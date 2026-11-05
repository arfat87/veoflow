/**
 * VeoFlow Base Formatter Interface (ESM)
 * Abstract base class for LLM formatting providers.
 */

export class BaseFormatter {
  constructor(name) {
    if (new.target === BaseFormatter) {
      throw new TypeError('Cannot construct BaseFormatter instances directly.');
    }
    this.name = name;
  }

  /**
   * Format raw transcription text using the provided system prompt.
   * @param {string} rawText - Unformatted transcribed speech
   * @param {string} systemPrompt - Generated versioned system prompt with context
   * @param {Object} [options] - Optional parameters (e.g. apiKey, model, signal)
   * @returns {Promise<string>} Formatted text ready for insertion
   */
  async format(rawText, systemPrompt, options = {}) {
    throw new Error(`format() must be implemented by ${this.name} adapter.`);
  }

  /**
   * Tests connectivity to the provider endpoint.
   * @param {string} [apiKey]
   * @returns {Promise<boolean>}
   */
  async testConnection(apiKey) {
    throw new Error(`testConnection() must be implemented by ${this.name} adapter.`);
  }
}

export default BaseFormatter;

