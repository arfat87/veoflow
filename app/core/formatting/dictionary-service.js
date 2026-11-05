/**
 * VeoFlow Dictionary Service (ESM)
 * Manages custom dictionary substitutions and snippet expansions with injection safety,
 * case sensitivity, replacement priority, and recursive replacement protection.
 */
import defaultDb from '../../database/database.js';

export class DictionaryService {
  constructor(databaseInstance = null) {
    this.db = databaseInstance || defaultDb;
  }

  /**
   * Applies custom dictionary word substitutions.
   * Matches whole words, respects case sensitivity, honors priority ordering,
   * prevents $1/$& string injection, and eliminates recursive replacement loops.
   * @param {string} text - Input text
   * @returns {string} Text with substitutions applied
   */
  applyDictionary(text) {
    if (!text || typeof text !== 'string') return '';

    // Fetch dictionary ordered by priority ASC, LENGTH(trigger_word) DESC
    let rawDict = (this.db?.getDictionary?.(true) || []);
    if (!rawDict || rawDict.length === 0) {
      rawDict = (this.db?.getDictionary?.() || []);
    }

    // Filter enabled entries
    const dictionary = rawDict.filter(d => d.is_enabled !== 0 && d.is_enabled !== false);
    if (dictionary.length === 0) return text;

    let result = text;
    const placeholders = new Map();
    let placeholderCounter = 0;

    for (const d of dictionary) {
      if (!d.trigger_word || !d.replacement) continue;

      const escaped = this.escapeRegex(d.trigger_word);
      const isSimpleWord = /^\w+$/.test(d.trigger_word);
      const isCaseSensitive = (d.case_sensitive === 1 || d.case_sensitive === true);
      const flags = isCaseSensitive ? 'g' : 'gi';

      const token = `\uE000__VEO_REP_${placeholderCounter++}__\uE001`;
      placeholders.set(token, d.replacement);

      if (isSimpleWord) {
        const regex = new RegExp(`\\b${escaped}\\b`, flags);
        result = result.replace(regex, () => token);
      } else {
        const regex = new RegExp(`(^|\\s|[.,!?;:\'\"(])${escaped}(?=\\s|[.,!?;:\'\")]|$)`, flags);
        result = result.replace(regex, (match, prefix) => (prefix || '') + token);
      }
    }

    // Single-pass resolution of all tokens (prevents recursive replacement)
    for (const [token, replacement] of placeholders.entries()) {
      result = result.replaceAll(token, replacement);
    }

    return result;
  }

  /**
   * Checks whether the transcribed text matches a predefined snippet shortcut.
   * @param {string} text - Transcribed speech
   * @returns {string|null} Expanded snippet or null if no match
   */
  checkSnippets(text) {
    if (!text || typeof text !== 'string') return null;

    const clean = text.trim().toLowerCase()
      .replace(/^["']|["']$/g, '')
      .replace(/[.,!?;:]+$/, '')
      .trim();

    let rawSnippets = (this.db?.getSnippets?.(true) || []);
    if (!rawSnippets || rawSnippets.length === 0) {
      rawSnippets = (this.db?.getSnippets?.() || []);
    }

    const snippets = rawSnippets.filter(s => s.is_enabled !== 0 && s.is_enabled !== false);

    for (const s of snippets) {
      if (!s.shortcut || !s.expanded_text) continue;

      const shortcutClean = s.shortcut.toLowerCase()
        .replace(/^["']|["']$/g, '')
        .replace(/[.,!?;:]+$/, '')
        .trim();

      if (clean === shortcutClean) {
        // Record snippet usage
        if (s.id && typeof this.db?.recordSnippetUsage === 'function') {
          try {
            this.db.recordSnippetUsage(s.id);
          } catch {}
        }
        return s.expanded_text;
      }
    }

    return null;
  }

  /**
   * Escapes regex special characters.
   */
  escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

export default DictionaryService;
