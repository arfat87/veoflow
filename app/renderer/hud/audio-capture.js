/**
 * VeoFlow Audio Capture Engine (ESM)
 * Browser / Renderer Web Audio API capture, AnalyserNode, MediaRecorder,
 * device selection, silence detection, duration limits, and cancellation.
 */

export class AudioCaptureEngine {
  constructor(options = {}) {
    this.maxDurationMs = options.maxDurationMs || 300000; // 5 minutes default
    this.silenceThresholdDb = options.silenceThresholdDb || -50;
    this.onWaveformData = options.onWaveformData || null;
    this.onMaxDurationExceeded = options.onMaxDurationExceeded || null;
    this.onError = options.onError || null;

    this.stream = null;
    this.audioContext = null;
    this.analyser = null;
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.selectedDeviceId = options.deviceId || 'default';

    this.state = 'idle'; // idle | preparing | recording | stopping | cancelled | error
    this.recordingStartTime = 0;
    this.durationCheckTimer = null;
    this.animFrameId = null;
  }

  /**
   * Enumerate all connected audio input hardware.
   * @returns {Promise<Array<{ deviceId: string, label: string }>>}
   */
  async enumerateMicrophones() {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        return [];
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices
        .filter(d => d.kind === 'audioinput')
        .map(d => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone (${d.deviceId.slice(0, 5)}...)`
        }));
    } catch (err) {
      console.warn('[AudioCapture] Failed to enumerate devices:', err);
      return [];
    }
  }

  /**
   * Select a specific microphone hardware by deviceId.
   */
  setMicrophone(deviceId) {
    this.selectedDeviceId = deviceId || 'default';
  }

  /**
   * Initialize Web Audio stream and analyzer graph.
   */
  async initStream() {
    this.state = 'preparing';

    const audioConstraints = {
      channelCount: 1,
      sampleRate: 16000,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    };

    if (this.selectedDeviceId && this.selectedDeviceId !== 'default') {
      audioConstraints.deviceId = { exact: this.selectedDeviceId };
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });

      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000
      });

      const source = this.audioContext.createMediaStreamSource(this.stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 64;
      this.analyser.smoothingTimeConstant = 0.8;
      source.connect(this.analyser);

      // Setup MediaRecorder
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm';
      }

      this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0 && this.state !== 'cancelled') {
          this.audioChunks.push(e.data);
        }
      };

      this.state = 'idle';
      return true;
    } catch (err) {
      this.state = 'error';
      console.error('[AudioCapture] Initialization failed:', err);
      if (this.onError) this.onError(err);
      return false;
    }
  }

  /**
   * Start live audio capture immediately.
   */
  async start() {
    if (this.state === 'recording') return;

    if (!this.stream || !this.stream.active) {
      const ok = await this.initStream();
      if (!ok) return;
    }

    this.state = 'recording';
    this.audioChunks = [];
    this.recordingStartTime = Date.now();

    if (this.audioContext && this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    if (this.mediaRecorder && this.mediaRecorder.state === 'inactive') {
      this.mediaRecorder.start(100); // 100ms chunk intervals
    }

    this.startAnalysisLoop();

    // 5-minute timeout guard
    this.durationCheckTimer = setInterval(() => {
      if (this.state === 'recording') {
        const elapsed = Date.now() - this.recordingStartTime;
        if (elapsed >= this.maxDurationMs) {
          console.warn('[AudioCapture] Max recording duration reached');
          if (this.onMaxDurationExceeded) this.onMaxDurationExceeded();
          this.stop();
        }
      }
    }, 1000);
  }

  /**
   * Normal stop: flushes remaining chunks and returns audio Blob.
   * @returns {Promise<{ blob: Blob, mimeType: string, durationMs: number } | null>}
   */
  async stop() {
    if (this.state !== 'recording') return null;
    this.state = 'stopping';

    if (this.durationCheckTimer) {
      clearInterval(this.durationCheckTimer);
      this.durationCheckTimer = null;
    }

    this.stopAnalysisLoop();

    const durationMs = Date.now() - this.recordingStartTime;

    return new Promise((resolve) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        this.state = 'idle';
        resolve(null);
        return;
      }

      this.mediaRecorder.onstop = () => {
        if (this.state === 'cancelled') {
          this.audioChunks = [];
          this.state = 'idle';
          resolve(null);
          return;
        }

        const mimeType = this.mediaRecorder.mimeType;
        const blob = new Blob(this.audioChunks, { type: mimeType });
        this.audioChunks = [];
        this.state = 'idle';
        resolve({ blob, mimeType, durationMs });
      };

      this.mediaRecorder.stop();
    });
  }

  /**
   * Immediate cancellation: drops all buffers without producing output.
   */
  cancel() {
    this.state = 'cancelled';
    this.audioChunks = [];

    if (this.durationCheckTimer) {
      clearInterval(this.durationCheckTimer);
      this.durationCheckTimer = null;
    }

    this.stopAnalysisLoop();

    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      try {
        this.mediaRecorder.stop();
      } catch {}
    }

    this.state = 'idle';
  }

  /**
   * Live FFT and RMS analysis loop for visualizer.
   */
  startAnalysisLoop() {
    const update = () => {
      if (this.state !== 'recording' || !this.analyser) return;

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      this.analyser.getByteFrequencyData(dataArray);

      if (this.onWaveformData) {
        this.onWaveformData(dataArray);
      }

      this.animFrameId = requestAnimationFrame(update);
    };

    update();
  }

  stopAnalysisLoop() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  /**
   * Cleanup resources.
   */
  destroy() {
    this.cancel();
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

export default AudioCaptureEngine;

