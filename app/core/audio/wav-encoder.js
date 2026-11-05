/**
 * VeoFlow WAV Audio Encoder (ESM)
 * Encodes raw PCM audio samples into standard 16-bit linear PCM WAV (RIFF) format.
 * High-performance, zero-dependency, compatible with Web Workers and Node.js.
 */

export class WavEncoder {
  /**
   * Encodes float audio samples (-1.0 to 1.0) or 16-bit integers into a standard WAV buffer.
   * @param {Float32Array|Int16Array|number[]} samples
   * @param {Object} options
   * @param {number} [options.sampleRate=16000]
   * @param {number} [options.numChannels=1]
   * @returns {Buffer} Standard 44-byte header + 16-bit PCM audio buffer
   */
  static encode(samples, options = {}) {
    const sampleRate = options.sampleRate || 16000;
    const numChannels = options.numChannels || 1;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;

    const numSamples = samples.length;
    const dataSize = numSamples * bytesPerSample;
    const bufferSize = 44 + dataSize;
    const buffer = Buffer.alloc(bufferSize);

    // RIFF Chunk Descriptor
    buffer.write('RIFF', 0, 4, 'ascii');
    buffer.writeUInt32LE(36 + dataSize, 4); // ChunkSize
    buffer.write('WAVE', 8, 4, 'ascii');

    // fmt sub-chunk
    buffer.write('fmt ', 12, 4, 'ascii');
    buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
    buffer.writeUInt16LE(1, 20); // AudioFormat (1 = Linear PCM)
    buffer.writeUInt16LE(numChannels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(byteRate, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(bitsPerSample, 34);

    // data sub-chunk
    buffer.write('data', 36, 4, 'ascii');
    buffer.writeUInt32LE(dataSize, 40);

    // Write 16-bit PCM samples
    let offset = 44;
    for (let i = 0; i < numSamples; i++) {
      let sample = samples[i];
      let int16Sample;

      if (typeof sample === 'number') {
        if (sample > 1.0 || sample < -1.0) {
          if (sample >= -32768 && sample <= 32767 && Number.isInteger(sample)) {
            int16Sample = sample;
          } else if (sample > 1.0) {
            int16Sample = 32767;
          } else {
            int16Sample = -32768;
          }
        } else {
          int16Sample = sample < 0 ? Math.round(sample * 32768) : Math.round(sample * 32767);
        }
      } else {
        int16Sample = 0;
      }

      buffer.writeInt16LE(int16Sample, offset);
      offset += 2;
    }

    return buffer;
  }

  /**
   * Validates and parses a WAV header.
   * @param {Buffer} buffer
   * @returns {Object} { isValid, sampleRate, numChannels, bitsPerSample, durationSec, dataSize }
   */
  static parse(buffer) {
    if (!buffer || buffer.length < 44) {
      return { isValid: false, error: 'Buffer too short for WAV header' };
    }

    const riff = buffer.toString('ascii', 0, 4);
    const wave = buffer.toString('ascii', 8, 12);
    const fmt = buffer.toString('ascii', 12, 16);

    if (riff !== 'RIFF' || wave !== 'WAVE' || fmt !== 'fmt ') {
      return { isValid: false, error: 'Invalid WAV magic numbers' };
    }

    const audioFormat = buffer.readUInt16LE(20);
    const numChannels = buffer.readUInt16LE(22);
    const sampleRate = buffer.readUInt32LE(24);
    const byteRate = buffer.readUInt32LE(28);
    const blockAlign = buffer.readUInt16LE(32);
    const bitsPerSample = buffer.readUInt16LE(34);

    let offset = 36;
    let dataSize = 0;

    // Search for data chunk (in case of extra RIFF chunks)
    while (offset < buffer.length - 8) {
      const chunkId = buffer.toString('ascii', offset, offset + 4);
      const chunkSize = buffer.readUInt32LE(offset + 4);
      if (chunkId === 'data') {
        dataSize = chunkSize;
        break;
      }
      offset += 8 + chunkSize;
    }

    const bytesPerSample = bitsPerSample / 8;
    const totalSamples = dataSize / (numChannels * bytesPerSample);
    const durationSec = sampleRate > 0 ? totalSamples / sampleRate : 0;

    return {
      isValid: true,
      audioFormat,
      numChannels,
      sampleRate,
      byteRate,
      blockAlign,
      bitsPerSample,
      dataSize,
      durationSec
    };
  }
}

export default WavEncoder;
