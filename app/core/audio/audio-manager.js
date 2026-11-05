/**
 * VeoFlow Audio Manager (ESM)
 * Coordinates audio storage, encoding worker dispatch, retention policies, and recording recovery.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import logger from '../../shared/logger.js';
import { WavEncoder } from './wav-encoder.js';
import { AudioUtils } from './audio-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class AudioManager {
  constructor(storageDir = null) {
    this.storageDir = storageDir || path.join(os.homedir(), '.veoflow', 'recordings');
    this.maxRetentionDays = 1; // 24 hours
    this.maxRecordingFiles = 50;
    this.workerPath = path.resolve(__dirname, './audio-worker.js');
    this.ensureStorageDir();
  }

  ensureStorageDir() {
    try {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true });
      }
    } catch (err) {
      logger.warn('Failed to create audio storage directory:', err.message);
    }
  }

  /**
   * Encodes audio samples to WAV using a background Worker Thread.
   * Falls back to synchronous execution if worker thread creation fails.
   */
  async processAudioAsync(samples, options = {}) {
    return new Promise((resolve) => {
      try {
        const worker = new Worker(this.workerPath);
        worker.postMessage({
          samples,
          sampleRate: options.sampleRate || 16000,
          numChannels: options.numChannels || 1,
          thresholdDb: options.thresholdDb || -45,
          barCount: options.barCount || 32
        });

        worker.on('message', (msg) => {
          worker.terminate();
          if (msg.success) {
            resolve(msg);
          } else {
            resolve(this.processAudioSync(samples, options));
          }
        });

        worker.on('error', () => {
          worker.terminate();
          resolve(this.processAudioSync(samples, options));
        });
      } catch {
        resolve(this.processAudioSync(samples, options));
      }
    });
  }

  /**
   * Synchronous audio processing fallback.
   */
  processAudioSync(samples, options = {}) {
    const wavBuffer = WavEncoder.encode(samples, {
      sampleRate: options.sampleRate || 16000,
      numChannels: options.numChannels || 1
    });
    const rms = AudioUtils.calculateRMS(samples);
    const db = AudioUtils.calculateDB(rms);
    const isSilent = AudioUtils.isSilent(samples, options.thresholdDb || -45);
    const waveform = AudioUtils.generateWaveformData(samples, options.barCount || 32);

    return {
      success: true,
      wavBuffer,
      rms,
      db,
      isSilent,
      waveform
    };
  }

  /**
   * Persists an audio buffer to the local recordings folder.
   * @param {Buffer|Uint8Array} audioBuffer
   * @param {string} [extension='wav']
   * @returns {string} Absolute file path to saved audio
   */
  saveRecording(audioBuffer, extension = 'wav') {
    this.ensureStorageDir();
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const filename = `recording_${timestamp}_${randomId}.${extension}`;
    const filePath = path.join(this.storageDir, filename);

    fs.writeFileSync(filePath, Buffer.from(audioBuffer));
    logger.info(`Saved recording to temporary storage: ${filename} (${audioBuffer.length} bytes)`);

    // Asynchronously perform directory cleanup
    this.cleanupOldRecordings();
    return filePath;
  }

  /**
   * Rotates recordings: removes files older than retention policy or beyond max count.
   */
  cleanupOldRecordings() {
    try {
      if (!fs.existsSync(this.storageDir)) return;

      const files = fs.readdirSync(this.storageDir)
        .filter(f => f.startsWith('recording_'))
        .map(f => {
          const fullPath = path.join(this.storageDir, f);
          const stat = fs.statSync(fullPath);
          return { name: f, path: fullPath, mtime: stat.mtimeMs };
        })
        .sort((a, b) => b.mtime - a.mtime); // Newest first

      const now = Date.now();
      const cutoff = now - (this.maxRetentionDays * 24 * 60 * 60 * 1000);

      files.forEach((file, index) => {
        // Delete if older than retention or beyond file count limit
        if (file.mtime < cutoff || index >= this.maxRecordingFiles) {
          try {
            fs.unlinkSync(file.path);
          } catch {}
        }
      });
    } catch (err) {
      logger.warn('Failed to clean up old recordings:', err.message);
    }
  }

  /**
   * Returns list of preserved recordings available for recovery.
   */
  listRecordings() {
    try {
      this.ensureStorageDir();
      return fs.readdirSync(this.storageDir)
        .filter(f => f.startsWith('recording_'))
        .map(f => path.join(this.storageDir, f));
    } catch {
      return [];
    }
  }
}

const defaultAudioManager = new AudioManager();
export default defaultAudioManager;

