/**
 * VeoFlow Floating HUD Controller (ESM)
 * Connects AudioCaptureEngine with 60 FPS High-DPI canvas visualizer and main process state transitions.
 */
import { AudioCaptureEngine } from './audio-capture.js';

const widget = document.getElementById('widget');
const micBtn = document.getElementById('micBtn');
const settingsBtn = document.getElementById('settingsBtn');
const statusBadge = document.getElementById('statusBadge');
const statusText = document.getElementById('statusText');
const canvas = document.getElementById('visualizer');
const canvasCtx = canvas.getContext('2d');

let isRecording = false;

// Setup High-DPI Canvas Rendering
function setupCanvasDpi() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = rect.width || 160;
  const height = rect.height || 28;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvasCtx.scale(dpr, dpr);
}

// Initialize Audio Capture Engine
const audioEngine = new AudioCaptureEngine({
  maxDurationMs: 300000,
  onWaveformData: (dataArray) => {
    drawWaveform(dataArray);
  },
  onMaxDurationExceeded: () => {
    if (window.veoflow && window.veoflow.stopRecording) {
      window.veoflow.stopRecording();
    }
  },
  onError: (err) => {
    updateStateUI('error', { message: 'Microphone: ' + (err.message || 'Access error') });
  }
});

// Canvas Waveform Renderer with Smooth Cyan Gradient (#00F2FE)
function drawWaveform(dataArray) {
  if (!isRecording) return;
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.width / dpr;
  const height = canvas.height / dpr;

  canvasCtx.clearRect(0, 0, width, height);

  if (!dataArray || dataArray.length === 0) {
    return;
  }

  const bufferLength = dataArray.length;
  const barWidth = 3.5;
  const barGap = 2.5;
  const barCount = Math.floor(width / (barWidth + barGap));
  const step = Math.floor(bufferLength / barCount) || 1;

  for (let i = 0; i < barCount; i++) {
    const rawVal = dataArray[i * step] || 0;
    const percent = Math.min(1, Math.max(0, rawVal / 255));
    const barHeight = Math.max(3, percent * (height - 4));

    const x = i * (barWidth + barGap);
    const y = (height - barHeight) / 2;

    // Cyan #00F2FE gradient
    const gradient = canvasCtx.createLinearGradient(0, y, 0, y + barHeight);
    gradient.addColorStop(0, '#00F2FE');
    gradient.addColorStop(1, '#0099FF');
    canvasCtx.fillStyle = gradient;

    canvasCtx.beginPath();
    canvasCtx.roundRect(x, y, barWidth, barHeight, 2);
    canvasCtx.fill();
  }
}

function clearWaveform() {
  const dpr = window.devicePixelRatio || 1;
  canvasCtx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
}

// Update UI based on pipeline states (all 9 states supported)
export function updateStateUI(state, payload = {}) {
  const normState = state.toLowerCase();
  widget.className = `widget state-${normState}`;

  switch (normState) {
    case 'idle':
      statusBadge.textContent = 'VeoFlow';
      statusText.textContent = payload.message || 'Ctrl+Alt+Space';
      if (isRecording) {
        isRecording = false;
        audioEngine.cancel();
      }
      clearWaveform();
      break;

    case 'preparing':
      statusBadge.textContent = 'Preparing';
      statusText.textContent = 'Initializing mic...';
      break;

    case 'recording': {
      statusBadge.textContent = 'Listening';
      const targetApp = payload.context?.appName ? payload.context.appName.replace('.exe', '') : 'Active Window';
      statusText.textContent = `Speaking to ${targetApp}...`;
      isRecording = true;
      audioEngine.start();
      break;
    }

    case 'stopping':
      statusBadge.textContent = 'Stopping';
      statusText.textContent = 'Finalizing audio...';
      if (isRecording) {
        isRecording = false;
        flushAudio();
      }
      clearWaveform();
      break;

    case 'transcribing':
    case 'processing':
      statusBadge.textContent = 'Transcribing';
      statusText.textContent = 'Converting speech to text...';
      if (isRecording) {
        isRecording = false;
        flushAudio();
      }
      clearWaveform();
      break;

    case 'formatting':
      statusBadge.textContent = 'Formatting';
      statusText.textContent = payload.preview ? `"${payload.preview}"` : 'Matching tone & context...';
      clearWaveform();
      break;

    case 'inserting':
    case 'pasting':
      statusBadge.textContent = 'Inserting';
      statusText.textContent = payload.preview ? `"${payload.preview}"` : 'Typing into application...';
      clearWaveform();
      break;

    case 'completed':
    case 'success':
      statusBadge.textContent = 'Complete';
      statusText.textContent = payload.text ? `Pasted: "${payload.text.slice(0, 32)}..."` : 'Text inserted';
      clearWaveform();
      break;

    case 'error':
      statusBadge.textContent = 'Error';
      statusText.textContent = payload.message || 'Dictation failed';
      if (isRecording) {
        isRecording = false;
        audioEngine.cancel();
      }
      clearWaveform();
      break;

    case 'cancelled':
      statusBadge.textContent = 'Cancelled';
      statusText.textContent = 'Dictation discarded';
      if (isRecording) {
        isRecording = false;
        audioEngine.cancel();
      }
      clearWaveform();
      setTimeout(() => updateStateUI('idle'), 1200);
      break;

    default:
      statusBadge.textContent = 'VeoFlow';
      statusText.textContent = 'Ctrl+Alt+Space';
      break;
  }
}

async function flushAudio() {
  try {
    const result = await audioEngine.stop();
    if (result && result.blob && window.veoflow && window.veoflow.submitAudio) {
      const arrayBuffer = await result.blob.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);
      window.veoflow.submitAudio(uint8, result.mimeType);
    }
  } catch (err) {
    console.warn('[Overlay] Failed to flush audio buffer:', err);
  }
}

// Listen to main process state transitions
if (window.veoflow && window.veoflow.onStateChange) {
  window.veoflow.onStateChange((data) => {
    if (data && data.state) {
      updateStateUI(data.state, data);
    }
  });
}

// Manual click on mic triggers toggle
if (micBtn) {
  micBtn.addEventListener('click', () => {
    if (!window.veoflow) return;
    if (isRecording) {
      window.veoflow.stopRecording();
    } else {
      window.veoflow.startRecording();
    }
  });
}

// Open Settings
if (settingsBtn) {
  settingsBtn.addEventListener('click', () => {
    if (window.veoflow && window.veoflow.openSettings) {
      window.veoflow.openSettings();
    }
  });
}

// Initialization on DOM load
window.addEventListener('DOMContentLoaded', () => {
  setupCanvasDpi();
  audioEngine.initStream();
});

window.addEventListener('resize', () => {
  setupCanvasDpi();
});
