/**
 * VeoFlow Audio Utilities (ESM)
 * Signal analysis, RMS power calculation, silence detection, and waveform generation.
 */

export class AudioUtils {
  /**
   * Calculates Root-Mean-Square (RMS) amplitude of audio samples.
   * @param {Float32Array|number[]|Buffer} samples - Normalized audio samples (-1.0 to 1.0)
   * @returns {number} RMS in range [0.0, 1.0]
   */
  static calculateRMS(samples) {
    if (!samples || samples.length === 0) return 0;

    let sum = 0;
    const len = samples.length;

    for (let i = 0; i < len; i++) {
      const val = samples[i];
      sum += val * val;
    }

    return Math.sqrt(sum / len);
  }

  /**
   * Converts linear RMS [0.0, 1.0] to Decibels Relative to Full Scale (dBFS).
   * @param {number} rms
   * @returns {number} Decibels (e.g. 0 dBFS is peak, -60 dBFS is quiet)
   */
  static calculateDB(rms) {
    if (rms <= 0.000001) return -100;
    return 20 * Math.log10(rms);
  }

  /**
   * Detects whether an audio segment is considered silent.
   * @param {Float32Array|number[]} samples
   * @param {number} [thresholdDb=-45] - Silence threshold in dBFS (default: -45 dB)
   * @returns {boolean} True if audio RMS is below threshold
   */
  static isSilent(samples, thresholdDb = -45) {
    const rms = this.calculateRMS(samples);
    const db = this.calculateDB(rms);
    return db < thresholdDb;
  }

  /**
   * Generates downsampled normalized amplitude waveform data for rendering.
   * @param {Float32Array|number[]} samples
   * @param {number} [barCount=32]
   * @returns {number[]} Array of normalized bar levels in range [0.0, 1.0]
   */
  static generateWaveformData(samples, barCount = 32) {
    if (!samples || samples.length === 0) {
      return new Array(barCount).fill(0);
    }

    const bars = new Array(barCount);
    const blockSize = Math.floor(samples.length / barCount) || 1;

    for (let i = 0; i < barCount; i++) {
      const start = i * blockSize;
      const end = Math.min(start + blockSize, samples.length);
      let peak = 0;

      for (let j = start; j < end; j++) {
        const absVal = Math.abs(samples[j]);
        if (absVal > peak) peak = absVal;
      }

      bars[i] = Math.min(1.0, peak);
    }

    return bars;
  }

  /**
   * Validates audio duration against configured ceiling.
   * @param {number} durationMs - Elapsed recording duration in ms
   * @param {number} [maxDurationMs=300000] - Configured maximum duration (default 5 min = 300,000 ms)
   * @returns {{ exceeded: boolean, maxMs: number }}
   */
  static checkDurationLimit(durationMs, maxDurationMs = 300000) {
    return {
      exceeded: durationMs >= maxDurationMs,
      maxMs: maxDurationMs
    };
  }

  /**
   * Linear interpolation resampler for PCM audio.
   * @param {Float32Array|number[]} samples
   * @param {number} fromRate
   * @param {number} toRate
   * @returns {Float32Array}
   */
  static resample(samples, fromRate, toRate) {
    if (fromRate === toRate || !samples || samples.length === 0) {
      return samples instanceof Float32Array ? samples : new Float32Array(samples);
    }

    const ratio = fromRate / toRate;
    const newLength = Math.round(samples.length / ratio);
    const result = new Float32Array(newLength);

    for (let i = 0; i < newLength; i++) {
      const position = i * ratio;
      const index = Math.floor(position);
      const frac = position - index;

      const s0 = samples[index] || 0;
      const s1 = samples[index + 1] || s0;

      result[i] = s0 + frac * (s1 - s0);
    }

    return result;
  }
}

export default AudioUtils;

