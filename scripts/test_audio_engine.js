import assert from 'node:assert';
import { WavEncoder } from '../app/core/audio/wav-encoder.js';
import { AudioUtils } from '../app/core/audio/audio-utils.js';
import { AudioManager } from '../app/core/audio/audio-manager.js';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

console.log('[TEST] Audio Engine & WAV Format Integrity Verification...');

// 1. Synthesize 1-second 16kHz mono audio (440Hz test tone)
const sampleRate = 16000;
const durationSeconds = 1.0;
const numSamples = sampleRate * durationSeconds;
const float32Samples = new Float32Array(numSamples);

for (let i = 0; i < numSamples; i++) {
  float32Samples[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.7; // -3dB tone
}

// 2. Measure RMS and dBFS
const rms = AudioUtils.calculateRMS(float32Samples);
const dbfs = AudioUtils.calculateDB(rms);
const silent = AudioUtils.isSilent(float32Samples, -50);

console.log(`Measured RMS: ${rms.toFixed(4)}, dBFS: ${dbfs.toFixed(2)} dB, IsSilence: ${silent}`);
assert.ok(rms > 0.45 && rms < 0.55, `RMS should be ~0.495 for 0.7 sine wave, got ${rms}`);
assert.ok(dbfs > -7.0 && dbfs < -5.0, `dBFS should be ~-6dB, got ${dbfs}`);
assert.strictEqual(silent, false, 'Tone should not be classified as silence');

// 3. Test Pure Silence Buffer
const silenceSamples = new Float32Array(16000); // pure 0.0
const silenceRms = AudioUtils.calculateRMS(silenceSamples);
const silenceDbfs = AudioUtils.calculateDB(silenceRms);
const silenceCheck = AudioUtils.isSilent(silenceSamples, -50);

console.log(`Silence RMS: ${silenceRms.toFixed(4)}, dBFS: ${silenceDbfs.toFixed(2)} dB, IsSilence: ${silenceCheck}`);
assert.strictEqual(silenceCheck, true, 'Zero buffer must be recognized as silence');

// 4. Encode to 16kHz 16-bit Mono PCM WAV
const wavBuffer = WavEncoder.encode(float32Samples, { sampleRate: 16000, numChannels: 1 });
assert.ok(wavBuffer instanceof Buffer, 'Encoded WAV must be a Buffer');

// 5. Parse and Validate RIFF / WAVE Header Integrity
const header = WavEncoder.parse(wavBuffer);
console.log('Parsed WAV Header:', JSON.stringify(header));

assert.strictEqual(header.isValid, true, 'Header must be valid');
assert.strictEqual(header.numChannels, 1, 'Channels must be 1 (mono)');
assert.strictEqual(header.sampleRate, 16000, 'Sample rate must be 16000 Hz');
assert.strictEqual(header.bitsPerSample, 16, 'Bits per sample must be 16');
assert.strictEqual(header.audioFormat, 1, 'Audio format must be 1 (PCM)');
assert.strictEqual(header.dataSize, numSamples * 2, `Data length must be ${numSamples * 2} bytes`);
assert.strictEqual(header.durationSec, 1.0, 'Duration must be 1.0 second');

// 6. Test Persistence & Storage Manager
const tempDir = path.join(os.tmpdir(), `veoflow_audio_test_${Date.now()}`);
const mgr = new AudioManager(tempDir, 3);

const savedPath = mgr.saveRecording(wavBuffer);
assert.ok(fs.existsSync(savedPath), 'Saved WAV file must exist on disk');

const stat = fs.statSync(savedPath);
assert.strictEqual(stat.size, wavBuffer.length, 'Saved file size must match encoded buffer');

// Clean up
mgr.cleanupOldRecordings();
try {
  if (fs.existsSync(savedPath)) fs.unlinkSync(savedPath);
  if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
} catch {}

console.log('[PASS] Audio Encoding, RIFF Headers, DSP Metrics & Storage Verified 100%');
