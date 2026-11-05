/**
 * VeoFlow Floating HUD Controller (ESM)
 * Connects AudioCaptureEngine with canvas visualizer and main process state transitions.
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

// Initialize Audio Engine
const audioEngine = new AudioCaptureEngine({
  maxDurationMs: 300000,
  onWaveformData: (dataArray) => {
    drawWaveform(dataArray);
  },
  onMaxDurationExceeded: () => {
    window.veoflow.stopRecording();
  },
  onError: (err) => {
    updateStateUI('error', { message: 'Microphone error: ' + err.message });
  }
});

// Canvas Waveform Renderer
function drawWaveform(dataArray) {
  canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

  const bufferLength = dataArray.length;
  const barWidth = 4;
  const barGap = 3;
  const barCount = Math.floor(canvas.width / (barWidth + barGap));
  const step = Math.floor(bufferLength / barCount) || 1;

  for (let i = 0; i < barCount; i++) {
    const value = dataArray[i * step] || 0;
    const percent = value / 255;
    const barHeight = Math.max(3, percent * (canvas.height - 4));

    const x = i * (barWidth + barGap);
    const y = (canvas.height - barHeight) / 2;

    const hue = 190 + (percent * 50); // Cyan to electric blue gradient
    canvasCtx.fillStyle = `hsl(${hue}, 90%, 60%)`;

    canvasCtx.beginPath();
    canvasCtx.roundRect(x, y, barWidth, barHeight, 2);
    canvasCtx.fill();
  }
}

function clearWaveform() {
  canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
}

// Update UI based on pipeline states
function updateStateUI(state, payload = {}) {
  widget.className = `widget state-${state}`;

  switch (state) {
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
      statusText.textContent = 'Connecting mic...';
      break;

    case 'recording':
      statusBadge.textContent = 'Listening';
      const targetApp = payload.context?.appName ? payload.context.appName.replace('.exe', '') : 'Active Window';
      statusText.textContent = `Speaking to ${targetApp}...`;
      isRecording = true;
      audioEngine.start();
      break;

    case 'stopping':
    case 'processing':
    case 'transcribing':
      statusBadge.textContent = 'Transcribing';
      statusText.textContent = 'Processing speech...';
      if (isRecording) {
        isRecording = false;
        audioEngine.stop().then(async (result) => {
          if (result && result.blob) {
            const arrayBuffer = await result.blob.arrayBuffer();
            const uint8 = new Uint8Array(arrayBuffer);
            window.veoflow.submitAudio(uint8, result.mimeType);
          }
        });
      }
      clearWaveform();
      break;

    case 'cancelled':
      statusBadge.textContent = 'Cancelled';
      statusText.textContent = 'Dictation discarded';
      isRecording = false;
      audioEngine.cancel();
      clearWaveform();
      setTimeout(() => {
        updateStateUI('idle');
      }, 1200);
      break;

    case 'formatting':
      statusBadge.textContent = 'Formatting';
      statusText.textContent = payload.preview ? `"${payload.preview}"` : 'Matching tone & context...';
      break;

    case 'pasting':
      statusBadge.textContent = 'Pasting';
      statusText.textContent = payload.preview ? `"${payload.preview}"` : 'Typing...';
      break;

    case 'success':
      statusBadge.textContent = 'Complete';
      statusText.textContent = payload.text ? `Pasted: "${payload.text.slice(0, 30)}..."` : 'Inserted successfully';
      break;

    case 'error':
      statusBadge.textContent = 'Error';
      statusText.textContent = payload.message || 'Failed to dictate';
      isRecording = false;
      audioEngine.cancel();
      clearWaveform();
      break;
  }
}

// Listen to main process state transitions
window.veoflow.onStateChange((data) => {
  console.log('[Overlay] Received state transition:', data);
  updateStateUI(data.state, data);
});

// Manual click on mic triggers toggle
micBtn.addEventListener('click', () => {
  if (isRecording) {
    window.veoflow.stopRecording();
  } else {
    window.veoflow.startRecording();
  }
});

// Open Settings
settingsBtn.addEventListener('click', () => {
  window.veoflow.openSettings();
});

// Warm up audio capture on page load
window.addEventListener('DOMContentLoaded', () => {
  audioEngine.initStream();
});
