import { describe, it, expect } from 'vitest';
import { AudioUtils } from '../../app/core/audio/audio-utils.js';

describe('AudioUtils', () => {
  it('calculates zero RMS and -100 dBFS for silence', () => {
    const silence = new Float32Array(1000).fill(0);
    const rms = AudioUtils.calculateRMS(silence);
    const db = AudioUtils.calculateDB(rms);

    expect(rms).toBe(0);
    expect(db).toBe(-100);
    expect(AudioUtils.isSilent(silence)).toBe(true);
  });

  it('calculates expected RMS for a 0.7 amplitude sine wave (~0.495)', () => {
    const sampleRate = 16000;
    const tone = new Float32Array(sampleRate);
    for (let i = 0; i < sampleRate; i++) {
      tone[i] = 0.7 * Math.sin((2 * Math.PI * 440 * i) / sampleRate);
    }

    const rms = AudioUtils.calculateRMS(tone);
    const db = AudioUtils.calculateDB(rms);

    // RMS of sine wave = Peak / sqrt(2) ≈ 0.7 / 1.4142 ≈ 0.495
    expect(rms).toBeCloseTo(0.495, 2);
    expect(db).toBeGreaterThan(-10);
    expect(AudioUtils.isSilent(tone)).toBe(false);
  });

  it('generates waveform data with normalized bar levels', () => {
    const samples = new Float32Array([0.1, 0.5, 0.9, 0.2, 0.8, 0.3]);
    const waveform = AudioUtils.generateWaveformData(samples, 3);

    expect(waveform.length).toBe(3);
    waveform.forEach(bar => {
      expect(bar).toBeGreaterThanOrEqual(0.0);
      expect(bar).toBeLessThanOrEqual(1.0);
    });
  });

  it('enforces maximum duration safety threshold', () => {
    const safeDuration = AudioUtils.checkDurationLimit(120000, 300000); // 2 min
    expect(safeDuration.exceeded).toBe(false);

    const exceededDuration = AudioUtils.checkDurationLimit(300001, 300000); // > 5 min
    expect(exceededDuration.exceeded).toBe(true);
  });

  it('resamples audio linearly to target sample rate', () => {
    const original = new Float32Array([0.0, 1.0, 0.0, -1.0]);
    const resampled = AudioUtils.resample(original, 16000, 8000);

    expect(resampled.length).toBe(2);
  });
});

