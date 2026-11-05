/**
 * VeoFlow Response Validator (ESM)
 * Sanitizes LLM artifacts, validates content retention, and ensures insertion safety.
 */
import logger from '../../shared/logger.js';

export class ResponseValidator {
  /**
   * Sanitizes and strips LLM preambles, fences, and accidental wrapping quotes.
   * @param {string} text - Raw output from LLM
   * @returns {string} Cleaned output for direct insertion
   */
  static sanitizeOutput(text) {
    if (!text || typeof text !== 'string') return '';

    let clean = text.trim();

    // 1. Strip markdown code fences if wrapped entirely
    if (clean.startsWith('```')) {
      clean = clean
        .replace(/^```[a-zA-Z0-9_-]*\r?\n?/, '')
        .replace(/\r?\n?```$/, '')
        .trim();
    }

    // 2. Strip common conversational preambles
    const preambleRegex = /^(?:Here\s+(?:is|are)(?:\s+(?:the|your|the\s+following))?\s*(?:formatted|cleaned|translated|corrected)?\s*(?:text|transcript|result|email|bullets?|version):?\s*|Sure,?\s*(?:here\s+is\s+(?:the\s+|your\s+)?text:?)?|Certainly,?\s*(?:here\s+is\s+(?:the\s+|your\s+)?text:?)?|Formatted\s+text:\s*|Output:\s*)/i;
    clean = clean.replace(preambleRegex, '').trim();

    // 3. Strip accidental outer quotes if the entire string is enclosed in "" or '' or “”
    if ((clean.startsWith('"') && clean.endsWith('"') && clean.length > 1) ||
        (clean.startsWith("'") && clean.endsWith("'") && clean.length > 1) ||
        (clean.startsWith('“') && clean.endsWith('”') && clean.length > 1)) {
      clean = clean.slice(1, -1).trim();
    }

    return clean;
  }

  /**
   * Validates that the formatted text meets quality, non-hallucination, and preservation criteria.
   * @param {string} formattedText - Cleaned LLM output
   * @param {string} rawTranscript - Original speech transcript
   * @param {Object} [options] - Context or instruction metadata
   * @returns {{ valid: boolean, text: string, warnings: string[] }}
   */
  static validate(formattedText, rawTranscript, options = {}) {
    const warnings = [];
    const sanitized = this.sanitizeOutput(formattedText);

    if (!sanitized || !sanitized.trim()) {
      return {
        valid: false,
        text: rawTranscript,
        warnings: ['Formatted text is empty; falling back to raw transcript.']
      };
    }

    // 1. Check for LLM refusal or conversational error patterns
    const refusalPatterns = [
      /^I cannot (?:fulfill|complete|process) this request/i,
      /^I'm sorry, but as an AI/i,
      /^As an AI language model/i
    ];
    for (const pat of refusalPatterns) {
      if (pat.test(sanitized)) {
        logger.warn('LLM refused to format text, falling back to raw transcript');
        return {
          valid: false,
          text: rawTranscript,
          warnings: ['LLM returned refusal pattern; falling back to raw transcript.']
        };
      }
    }

    // 2. Number Preservation Check (unless explicit instruction or translation was requested)
    if (!options.isInstruction && options.mode !== 'instruction') {
      const numbersInRaw = rawTranscript.match(/\b\d+(?:[.,]\d+)?\b/g) || [];
      for (const num of numbersInRaw) {
        if (!sanitized.includes(num)) {
          warnings.push(`Number "${num}" in raw transcript was not found in formatted output.`);
        }
      }
    }

    // 3. Length sanity check (Prevent extreme uncontrolled hallucination)
    // If raw is short (e.g. 10 chars) and output is 1000 chars without an instruction asking for it
    if (!options.isInstruction && rawTranscript.length > 0) {
      const expansionRatio = sanitized.length / rawTranscript.length;
      if (expansionRatio > 4 && rawTranscript.length < 50) {
        warnings.push(`Suspicious length expansion ratio: ${expansionRatio.toFixed(1)}x`);
      }
    }

    return {
      valid: true,
      text: sanitized,
      warnings
    };
  }
}

export default ResponseValidator;
