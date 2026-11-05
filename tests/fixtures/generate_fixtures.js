/**
 * Generates synthetic WAV audio test fixtures.
 */
import fs from 'node:fs';
import path from 'node:path';
import { WavEncoder } from '../../app/core/audio/wav-encoder.js';

const FIXTURES_DIR = import.meta.dirname;

export function generateFixtures() {
  const sampleRate = 16000;

  // 1. Pure Silence (1 second, 16000 samples of 0.0)
  const silenceSamples = new Float32Array(sampleRate);
  const silenceWav = WavEncoder.encode(silenceSamples, { sampleRate, numChannels: 1 });
  fs.writeFileSync(path.join(FIXTURES_DIR, 'silence_16k.wav'), silenceWav);

  // 2. 440 Hz Sine Tone (1 second, amplitude 0.7)
  const toneSamples = new Float32Array(sampleRate);
  for (let i = 0; i < sampleRate; i++) {
    toneSamples[i] = 0.7 * Math.sin((2 * Math.PI * 440 * i) / sampleRate);
  }
  const toneWav = WavEncoder.encode(toneSamples, { sampleRate, numChannels: 1 });
  fs.writeFileSync(path.join(FIXTURES_DIR, 'sine_440hz_16k.wav'), toneWav);

  // 3. Noisy Input (1 second, random noise with amplitude 0.2)
  const noiseSamples = new Float32Array(sampleRate);
  for (let i = 0; i < sampleRate; i++) {
    noiseSamples[i] = (Math.random() * 2 - 1) * 0.2;
  }
  const noiseWav = WavEncoder.encode(noiseSamples, { sampleRate, numChannels: 1 });
  fs.writeFileSync(path.join(FIXTURES_DIR, 'noisy_16k.wav'), noiseWav);

  // 4. Short Audio (300ms, 4800 samples)
  const shortSamples = new Float32Array(4800);
  for (let i = 0; i < 4800; i++) {
    shortSamples[i] = 0.5 * Math.sin((2 * Math.PI * 880 * i) / sampleRate);
  }
  const shortWav = WavEncoder.encode(shortSamples, { sampleRate, numChannels: 1 });
  fs.writeFileSync(path.join(FIXTURES_DIR, 'short_burst_16k.wav'), shortWav);
}

// Run if called directly
if (process.argv[1] && process.argv[1].endsWith('generate_fixtures.js')) {
  generateFixtures();
  console.log('Fixtures generated successfully.');
}

