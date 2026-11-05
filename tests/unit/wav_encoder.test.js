import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { WavEncoder } from '../../app/core/audio/wav-encoder.js';

describe('WavEncoder', () => {
  it('encodes Float32Array PCM samples into valid 44-byte RIFF/WAVE header', () => {
    const samples = new Float32Array([0.0, 0.5, -0.5, 1.0, -1.0]);
    const wav = WavEncoder.encode(samples, { sampleRate: 16000, numChannels: 1 });

    expect(wav.length).toBe(44 + samples.length * 2);
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
    expect(wav.toString('ascii', 12, 16)).toBe('fmt ');
    expect(wav.readUInt16LE(20)).toBe(1); // Linear PCM
    expect(wav.readUInt16LE(22)).toBe(1); // 1 Channel
    expect(wav.readUInt32LE(24)).toBe(16000); // 16kHz
    expect(wav.readUInt16LE(34)).toBe(16); // 16-bit
    expect(wav.toString('ascii', 36, 40)).toBe('data');
    expect(wav.readUInt32LE(40)).toBe(samples.length * 2);
  });

  it('correctly parses encoded WAV buffer with WavEncoder.parse', () => {
    const samples = new Float32Array(16000);
    const wav = WavEncoder.encode(samples, { sampleRate: 16000, numChannels: 1 });
    const parsed = WavEncoder.parse(wav);

    expect(parsed.isValid).toBe(true);
    expect(parsed.sampleRate).toBe(16000);
    expect(parsed.numChannels).toBe(1);
    expect(parsed.bitsPerSample).toBe(16);
    expect(parsed.durationSec).toBeCloseTo(1.0, 2);
    expect(parsed.dataSize).toBe(32000);
  });

  it('correctly parses generated test fixtures', () => {
    const fixturePath = path.resolve(import.meta.dirname, '../fixtures/sine_440hz_16k.wav');
    const buffer = fs.readFileSync(fixturePath);
    const parsed = WavEncoder.parse(buffer);

    expect(parsed.isValid).toBe(true);
    expect(parsed.sampleRate).toBe(16000);
    expect(parsed.numChannels).toBe(1);
    expect(parsed.durationSec).toBeCloseTo(1.0, 2);
  });

  it('clamps out-of-range float values without integer overflow', () => {
    const samples = new Float32Array([2.5, -3.5]);
    const wav = WavEncoder.encode(samples, { sampleRate: 16000, numChannels: 1 });

    const firstSample = wav.readInt16LE(44);
    const secondSample = wav.readInt16LE(46);

    expect(firstSample).toBe(32767);
    expect(secondSample).toBe(-32768);
  });

  it('rejects invalid or truncated WAV headers in parse', () => {
    const invalid = Buffer.from('NOT_A_VALID_WAV_HEADER');
    const parsed = WavEncoder.parse(invalid);
    expect(parsed.isValid).toBe(false);
  });
});

