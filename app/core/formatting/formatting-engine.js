/**
 * VeoFlow Formatting Engine (ESM)
 * Master orchestrator for contextual text formatting, instruction processing, and fallback routing.
 */
import defaultDb from '../../database/database.js';
import { PromptEngine, PROMPT_VERSION } from './prompt-engine.js';
import { GeminiFormatter } from './gemini-formatter.js';
import { GroqFormatter } from './groq-formatter.js';
import { OpenAIFormatter } from './openai-formatter.js';
import { ResponseValidator } from './response-validator.js';
import { DictionaryService } from './dictionary-service.js';
import { PROVIDERS } from '../../shared/constants.js';
import logger from '../../shared/logger.js';

export class FormattingEngine {
  constructor(databaseInstance = null, options = {}) {
    this.db = databaseInstance || defaultDb;
    this.dictionaryService = new DictionaryService(this.db);

    // Initialize adapters
    this.formatters = new Map([
      [PROVIDERS.GEMINI, new GeminiFormatter(() => this.db.getSetting('gemini_api_key'), options.geminiModel)],
      [PROVIDERS.GROQ, new GroqFormatter(() => this.db.getSetting('groq_api_key'), options.groqModel)],
      [PROVIDERS.OPENAI, new OpenAIFormatter(() => this.db.getSetting('openai_api_key'), options.openaiModel)]
    ]);
  }

  /**
   * Returns a specific formatter adapter.
   * @param {string} providerName - 'gemini' | 'groq' | 'openai'
   * @returns {BaseFormatter}
   */
  getFormatter(providerName) {
    const formatter = this.formatters.get(providerName?.toLowerCase());
    if (!formatter) {
      throw new Error(`Unsupported formatting provider: ${providerName}`);
    }
    return formatter;
  }

  /**
   * Resolves provider execution chain for fallback routing.
   * @returns {{ chain: BaseFormatter[], primaryName: string }}
   */
  resolveProviderChain() {
    const configuredPrimary = (this.db.getSetting('ai_provider') || PROVIDERS.GEMINI).toLowerCase();
    const allowFallback = this.db.getSetting('allow_fallback') !== 'false';

    const order = [configuredPrimary];
    for (const p of [PROVIDERS.GEMINI, PROVIDERS.GROQ, PROVIDERS.OPENAI]) {
      if (!order.includes(p)) order.push(p);
    }

    const availableFormatters = [];
    for (const name of order) {
      const adapter = this.formatters.get(name);
      if (adapter && adapter.getApiKey()) {
        availableFormatters.push(adapter);
      }
    }

    const chain = allowFallback
      ? availableFormatters
      : availableFormatters.slice(0, 1);

    return { chain, primaryName: configuredPrimary };
  }

  /**
   * Main formatting entrypoint.
   * @param {string} rawAsr - Raw transcribed speech text
   * @param {Object} [context] - Context envelope from ContextEngine
   * @param {Object} [options] - Overrides (mode, provider, etc.)
   * @returns {Promise<string>} Final formatted text for insertion
   */
  async format(rawAsr, context = {}, options = {}) {
    if (!rawAsr || typeof rawAsr !== 'string' || !rawAsr.trim()) {
      return '';
    }

    // 1. Snippet Expansion Check
    const expandedSnippet = this.dictionaryService.checkSnippets(rawAsr);
    if (expandedSnippet) {
      logger.info(`Snippet matched and expanded: "${rawAsr}"`);
      return expandedSnippet;
    }

    // 2. Resolve Dictation Mode
    const configuredTone = this.db.getSetting('tone_preference') || 'contextual';
    let mode = options.mode || configuredTone;

    // Check for explicit voice directives (translation, bullet points, grammar)
    const detectedInstruction = PromptEngine.detectInstruction(rawAsr);
    const isInstruction = detectedInstruction.isInstruction || mode === 'instruction';

    if (isInstruction) {
      mode = 'instruction';
    }

    // 3. Verbatim Mode bypasses LLM alteration
    if (mode === 'verbatim') {
      logger.info('Verbatim mode active: bypassing LLM formatting.');
      return this.dictionaryService.applyDictionary(rawAsr);
    }

    // 4. Resolve Provider Chain
    const { chain } = this.resolveProviderChain();

    // If no provider has an API key, fallback to raw text with custom dictionary
    if (chain.length === 0) {
      logger.warn('No LLM API keys configured for formatting; using verbatim fallback with dictionary.');
      return this.dictionaryService.applyDictionary(rawAsr);
    }

    // 5. Build Versioned System Prompt
    const systemPrompt = PromptEngine.buildPrompt(context, mode, {
      tone: configuredTone,
      instructionType: detectedInstruction.type
    });

    let formattedOutput = null;
    let lastError = null;

    // 6. Execute Provider with Automatic Fallback
    for (let i = 0; i < chain.length; i++) {
      const adapter = chain[i];
      try {
        logger.info(`Formatting with provider: ${adapter.name} (attempt ${i + 1}/${chain.length}) [Engine: v${PROMPT_VERSION}]`);
        const startTime = Date.now();

        const result = await adapter.format(rawAsr, systemPrompt, options);
        const latency = Date.now() - startTime;

        logger.info(`Formatting succeeded via ${adapter.name} in ${latency}ms`);
        formattedOutput = result;
        break;
      } catch (err) {
        lastError = err;
        logger.warn(`Provider ${adapter.name} formatting failed: ${err.message}`);
        if (i < chain.length - 1) {
          logger.info(`Falling back to next formatter in chain: ${chain[i + 1].name}`);
        }
      }
    }

    // 7. Validate and Sanitize Response
    const textToValidate = formattedOutput || rawAsr;
    const validation = ResponseValidator.validate(textToValidate, rawAsr, {
      mode,
      isInstruction
    });

    if (validation.warnings.length > 0) {
      logger.warn('Formatting validation warnings:', validation.warnings.join('; '));
    }

    // 8. Apply Custom Dictionary Substitutions as final step
    const finalResult = this.dictionaryService.applyDictionary(validation.text);
    return finalResult;
  }
}

export default FormattingEngine;

