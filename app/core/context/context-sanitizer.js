/**
 * VeoFlow Context Sanitizer (ESM)
 * Sanitizes and bounds untrusted window context to prevent prompt injection.
 */

export class ContextSanitizer {
  /**
   * Sanitizes text fields, neutralizing control codes and prompt injection tokens.
   * @param {string} text
   * @param {number} [maxLength=300]
   * @returns {string} Sanitized string
   */
  static sanitizeText(text, maxLength = 300) {
    if (!text || typeof text !== 'string') return '';

    let clean = text;

    // 1. Strip prompt injection delimiters and role markers
    clean = clean
      .replace(/<\|im_start\|>/gi, '[stripped]')
      .replace(/<\|im_end\|>/gi, '[stripped]')
      .replace(/<\|endoftext\|>/gi, '[stripped]')
      .replace(/\[INST\]/gi, '[stripped]')
      .replace(/\[\/INST\]/gi, '[stripped]')
      .replace(/<<SYS>>/gi, '[stripped]')
      .replace(/<<\/SYS>>/gi, '[stripped]')
      .replace(/(?:^|\n|\[stripped\]\s*)(system|human|assistant|user|developer)(?::|\s+)/gim, '\n[role]: ')
      .replace(/```/g, "'''");

    // 2. Strip non-printable control characters (preserving \n and \t)
    clean = clean.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // 3. Bound length
    if (clean.length > maxLength) {
      clean = clean.slice(-maxLength); // Keep text closest to cursor
    }

    return clean.trim();
  }

  /**
   * Sanitizes a full context envelope.
   */
  static sanitizeContext(context) {
    if (!context) return null;

    return {
      appName: this.sanitizeText(context.appName || 'Unknown', 100),
      processPath: this.sanitizeText(context.processPath || '', 250),
      processId: Number(context.processId) || 0,
      windowTitle: this.sanitizeText(context.windowTitle || '', 200),
      url: this.sanitizeText(context.url || '', 250),
      textbox: {
        contents: this.sanitizeText(context.textbox?.contents || '', 300),
        beforeText: this.sanitizeText(context.textbox?.beforeText || '', 300),
        selectedText: this.sanitizeText(context.textbox?.selectedText || '', 300),
        afterText: this.sanitizeText(context.textbox?.afterText || '', 300),
        controlType: this.sanitizeText(context.textbox?.controlType || '', 80)
      }
    };
  }
}

export default ContextSanitizer;
