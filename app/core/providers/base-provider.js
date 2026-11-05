/**
 * VeoFlow Abstract AI Provider Interface (ESM)
 */
export class AIProvider {
  constructor(name) {
    if (new.target === AIProvider) {
      throw new TypeError('Cannot construct AIProvider instances directly');
    }
    this.name = name;
  }

  /**
   * Transcribe an audio buffer into text.
   * @param {Buffer|Uint8Array} audioBuffer
   * @param {Object} [options={}]
   * @param {string} [options.model]
   * @param {string} [options.language] - Optional ISO-639-1 language code (e.g. 'en', 'hi', 'bn')
   * @param {string} [options.mimeType]
   * @param {AbortSignal} [options.signal]
   * @param {number} [options.timeoutMs]
   * @returns {Promise<{ text: string, language: string, duration: number, latencyMs: number, provider: string, model: string }>}
   */
  async transcribe(audioBuffer, options = {}) {
    throw new Error('transcribe() must be implemented by subclass');
  }

  /**
   * Test API connectivity and credential validity.
   * @returns {Promise<{ success: boolean, message: string, latencyMs: number }>}
   */
  async testConnection() {
    throw new Error('testConnection() must be implemented by subclass');
  }

  /**
   * Return supported model list for this provider.
   * @returns {Array<string>}
   */
  getModels() {
    throw new Error('getModels() must be implemented by subclass');
  }
}

export default AIProvider;

