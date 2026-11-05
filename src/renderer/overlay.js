const widget = document.getElementById('widget');
const micBtn = document.getElementById('micBtn');
const settingsBtn = document.getElementById('settingsBtn');
const statusBadge = document.getElementById('statusBadge');
const statusText = document.getElementById('statusText');
const canvas = document.getElementById('visualizer');
const canvasCtx = canvas.getContext('2d');

let mediaRecorder = null;
let audioChunks = [];
let audioContext = null;
let analyser = null;
let animationFrameId = null;
let isRecording = false;

// Initialize Visualizer Audio Graph
async function initAudio() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 64;
    source.connect(analyser);

    // Setup MediaRecorder
    let mimeType = 'audio/webm;codecs=opus';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'audio/webm';
    }

    mediaRecorder = new MediaRecorder(stream, { mimeType });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        audioChunks.push(e.data);
      }
    };

    mediaRecorder.onstop = async () => {
      const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
      audioChunks = [];
      const arrayBuffer = await blob.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);

      console.log('[Overlay] Submitting recorded audio, size:', uint8.length);
      window.veoflow.submitAudio(uint8, mediaRecorder.mimeType);
    };

    console.log('[Overlay] Audio initialized successfully');
  } catch (err) {
    console.error('[Overlay] Microphone access error:', err);
    updateStateUI('error', { message: 'Mic permission denied' });
  }
}

// Waveform visualizer loop
function drawWaveform() {
  if (!analyser) return;

  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  analyser.getByteFrequencyData(dataArray);

  canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

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

    const hue = 190 + (percent * 50); // Cyan to blue gradient
    canvasCtx.fillStyle = `hsl(${hue}, 90%, 60%)`;

    // Rounded pill bars
    canvasCtx.beginPath();
    canvasCtx.roundRect(x, y, barWidth, barHeight, 2);
    canvasCtx.fill();
  }

  if (isRecording) {
    animationFrameId = requestAnimationFrame(drawWaveform);
  } else {
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

function startRecording() {
  if (isRecording) return;
  isRecording = true;
  audioChunks = [];

  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume();
  }

  if (mediaRecorder && mediaRecorder.state === 'inactive') {
    mediaRecorder.start(100);
  }

  drawWaveform();
}

function stopRecording() {
  if (!isRecording) return;
  isRecording = false;

  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }

  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
}

// Update UI based on pipeline states
function updateStateUI(state, payload = {}) {
  widget.className = `widget state-${state}`;

  switch (state) {
    case 'idle':
      statusBadge.textContent = 'VeoFlow';
      statusText.textContent = payload.message || 'Ctrl+Alt+Space';
      stopRecording();
      break;

    case 'recording':
      statusBadge.textContent = 'Listening';
      const targetApp = payload.context?.appName ? payload.context.appName.replace('.exe', '') : 'Active Window';
      statusText.textContent = `Speaking to ${targetApp}...`;
      startRecording();
      break;

    case 'processing':
    case 'transcribing':
      statusBadge.textContent = 'Transcribing';
      statusText.textContent = 'Processing speech...';
      stopRecording();
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
      stopRecording();
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

// Init mic on startup
window.addEventListener('DOMContentLoaded', () => {
  initAudio();
});
