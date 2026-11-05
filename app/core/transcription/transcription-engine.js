/**
 * VeoFlow Provider-Independent Transcription Engine (ESM)
 * Manages provider selection, API key retrieval, fallback routing, and raw transcript preservation.
 */
import defaultDb from '../../database/database.js';
import { PROVIDERS, DEFAULT_CONFIG } from '../../shared/constants.js';
import { GroqTranscriptionProvider } from '../providers/groq-provider.js';
import { OpenAITranscriptionProvider } from '../providers/openai-provider.js';
import { GeminiTranscriptionProvider } from '../providers/gemini-provider.js';
import {
  AuthenticationError,
  RateLimitError,
  ServerError,
  NetworkError,
  EmptyResponseError
} from '../providers/errors.js';
import logger from '../../shared/logger.js';

export class TranscriptionEngine {
  constructor(databaseInstance = null) {
    this.db = databaseInstance || defaultDb;

    this.providers = new Map();
    this.providers.set(PROVIDERS.GROQ, new GroqTranscriptionProvider(() => this.db.getSetting('groq_api_key')));
    this.providers.set(PROVIDERS.OPENAI, new OpenAITranscriptionProvider(() => this.db.getSetting('openai_api_key')));
    this.providers.set(PROVIDERS.GEMINI, new GeminiTranscriptionProvider(() => this.db.getSetting('gemini_api_key')));
  }

  /**
   * Returns registered provider instance by name.
   */
  getProvider(name) {
    return this.providers.get(name);
  }

  /**
   * Determine the fallback chain of providers to try based on user configuration.
   */
  resolveProviderChain() {
    const configuredPrimary = this.db.getSetting('stt_provider') ||
                              this.db.getSetting('ai_provider') ||
                              DEFAULT_CONFIG.AI_PROVIDER;

    const allowFallback = this.db.getSetting('allow_fallback') !== 'false';

    const chain = [];
    const primary = this.providers.get(configuredPrimary);
    if (primary && primary.getApiKey()) {
      chain.push(primary);
    }

    if (allowFallback) {
      for (const [name, provider] of this.providers.entries()) {
        if (name !== configuredPrimary && provider.getApiKey()) {
          chain.push(provider);
        }
      }
    }

    return { chain, configuredPrimary, allowFallback };
  }

  /**
   * Transcribes audio buffer through resolved provider with fallback handling.
   * @param {Buffer|Uint8Array} audioBuffer
   * @param {Object} [options={}]
   * @param {string} [options.language] - Optional manual language code ('en', 'hi', 'bn')
   * @param {string} [options.mimeType] - 'audio/webm', 'audio/wav'
   * @param {AbortSignal} [options.signal]
   * @returns {Promise<{ rawText: string, language: string, duration: number, latencyMs: number, provider: string, model: string }>}
   */
  async transcribe(audioBuffer, options = {}) {
    const language = options.language || this.db.getSetting('dictation_language') || null;
    const { chain, configuredPrimary, allowFallback } = this.resolveProviderChain();

    if (chain.length === 0) {
      throw new AuthenticationError(
        `No API key configured for ${configuredPrimary}. Please configure your API key in VeoFlow Settings.`,
        configuredPrimary,
        401
      );
    }

    let lastError = null;

    for (let i = 0; i < chain.length; i++) {
      const provider = chain[i];
      const isPrimary = (i === 0);

      logger.info(`Attempting transcription with provider: ${provider.name} (attempt ${i + 1}/${chain.length})`);

      try {
        const result = await provider.transcribe(audioBuffer, {
          ...options,
          language: language === 'auto' ? null : language
        });

        logger.info(`Transcription succeeded via ${provider.name} in ${result.latencyMs}ms: "${result.text}"`);

        return {
          rawText: result.text,
          language: result.language,
          duration: result.duration,
          latencyMs: result.latencyMs,
          provider: result.provider,
          model: result.model
        };

      } catch (err) {
        lastError = err;
        logger.warn(`Provider ${provider.name} failed:`, err.message);

        // If primary failed due to invalid API key, do NOT fall back silently to an unconfigured provider
        if (isPrimary && err instanceof AuthenticationError && !allowFallback) {
          throw err;
        }

        // Only fall back on server errors, rate limits, or network failures if more providers exist
        if (i < chain.length - 1 && allowFallback) {
          logger.info(`Falling back to next provider in chain: ${chain[i + 1].name}`);
          continue;
        }
      }
    }

    throw lastError || new Error('All transcription providers failed');
  }

  /**
   * Run connection tests across all configured providers.
   */
  async testAllConnections() {
    const results = {};
    for (const [name, provider] of this.providers.entries()) {
      results[name] = await provider.testConnection();
    }
    return results;
  }
}

const defaultTranscriptionEngine = new TranscriptionEngine();
export default defaultTranscriptionEngine;

