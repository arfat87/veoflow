import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AudioManager } from '../../app/core/audio/audio-manager.js';

describe('AudioManager', () => {
  let tempStorageDir;
  let audioManager;

  beforeEach(() => {
    tempStorageDir = path.join(os.tmpdir(), `veoflow_audio_test_${Date.now()}_${Math.random().toString(36).substring(7)}`);
    audioManager = new AudioManager(tempStorageDir);
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempStorageDir)) {
        fs.rmSync(tempStorageDir, { recursive: true, force: true });
      }
    } catch {}
  });

  it('creates storage directory if it does not exist', () => {
    expect(fs.existsSync(tempStorageDir)).toBe(true);
  });

  it('saves recording buffer and lists recordings', () => {
    const fakeAudio = Buffer.from('RIFF_SAMPLE_DATA_123456');
    const savedPath = audioManager.saveRecording(fakeAudio, 'wav');

    expect(fs.existsSync(savedPath)).toBe(true);
    expect(savedPath.endsWith('.wav')).toBe(true);

    const recordings = audioManager.listRecordings();
    expect(recordings.length).toBe(1);
    expect(recordings[0]).toBe(savedPath);
  });

  it('processes audio synchronously with metrics', () => {
    const samples = new Float32Array([0.2, 0.4, 0.6, 0.8]);
    const result = audioManager.processAudioSync(samples, { sampleRate: 16000 });

    expect(result.success).toBe(true);
    expect(result.wavBuffer).toBeDefined();
    expect(result.wavBuffer.length).toBe(44 + samples.length * 2);
    expect(result.rms).toBeGreaterThan(0);
    expect(result.waveform).toBeDefined();
  });

  it('processes audio asynchronously via Worker Thread', async () => {
    const samples = new Float32Array([0.1, -0.2, 0.3, -0.4]);
    const result = await audioManager.processAudioAsync(samples, { sampleRate: 16000 });

    expect(result.success).toBe(true);
    expect(result.wavBuffer).toBeDefined();
    expect(result.rms).toBeGreaterThan(0);
  });

  it('cleans up old recordings according to retention limits', () => {
    // Create multiple fake recordings
    for (let i = 0; i < 5; i++) {
      audioManager.saveRecording(Buffer.from(`sample_${i}`), 'wav');
    }

    expect(audioManager.listRecordings().length).toBe(5);

    // Artificially restrict max files to 3 and run cleanup
    audioManager.maxRecordingFiles = 3;
    audioManager.cleanupOldRecordings();

    expect(audioManager.listRecordings().length).toBe(3);
  });
});

