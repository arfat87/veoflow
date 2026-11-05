/**
 * VeoFlow Audio Worker Thread (ESM)
 * Offloads CPU-intensive WAV encoding and FFT/RMS analysis from the main thread.
 */
import { parentPort } from 'node:worker_threads';
import { WavEncoder } from './wav-encoder.js';
import { AudioUtils } from './audio-utils.js';

if (parentPort) {
  parentPort.on('message', (task) => {
    try {
      const { samples, sampleRate, numChannels, thresholdDb, barCount } = task;

      // 1. WAV Encoding
      const wavBuffer = WavEncoder.encode(samples, {
        sampleRate: sampleRate || 16000,
        numChannels: numChannels || 1
      });

      // 2. Audio Metrics
      const rms = AudioUtils.calculateRMS(samples);
      const db = AudioUtils.calculateDB(rms);
      const isSilent = AudioUtils.isSilent(samples, thresholdDb || -45);
      const waveform = AudioUtils.generateWaveformData(samples, barCount || 32);

      parentPort.postMessage({
        success: true,
        wavBuffer,
        rms,
        db,
        isSilent,
        waveform
      });
    } catch (err) {
      parentPort.postMessage({
        success: false,
        error: err.message
      });
    }
  });
}

