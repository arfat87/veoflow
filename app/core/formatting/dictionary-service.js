/**
 * VeoFlow Dictionary Service (ESM)
 * Manages custom dictionary substitutions and snippet expansions with injection safety.
 */
import defaultDb from '../../database/database.js';

export class DictionaryService {
  constructor(databaseInstance = null) {
    this.db = databaseInstance || defaultDb;
  }

  /**
   * Applies custom dictionary word substitutions.
   * Matches whole words, case-insensitively, avoiding $1/$& string injection.
   * @param {string} text - Input text
   * @returns {string} Text with substitutions applied
   */
  applyDictionary(text) {
    if (!text || typeof text !== 'string') return '';

    let result = text;
    const dictionary = (this.db?.getDictionary?.() || []);

    for (const d of dictionary) {
      if (!d.trigger_word || !d.replacement) continue;

      const escaped = this.escapeRegex(d.trigger_word);
      const isSimpleWord = /^\w+$/.test(d.trigger_word);

      if (isSimpleWord) {
        const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
        result = result.replace(regex, () => d.replacement);
      } else {
        const regex = new RegExp(`(^|\\s)${escaped}(?=\\s|[.,!?;:]|$)`, 'gi');
        result = result.replace(regex, (match, prefix) => (prefix || '') + d.replacement);
      }
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

    const snippets = (this.db?.getSnippets?.() || []);
    for (const s of snippets) {
      if (!s.shortcut || !s.expanded_text) continue;

      const shortcutClean = s.shortcut.toLowerCase()
        .replace(/^["']|["']$/g, '')
        .replace(/[.,!?;:]+$/, '')
        .trim();

      if (clean === shortcutClean) {
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

