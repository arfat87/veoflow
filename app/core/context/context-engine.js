/**
 * VeoFlow Master Context Engine (ESM)
 * Extracts, classifies, sanitizes, and applies privacy filters to active window context.
 */
import defaultDb from '../../database/database.js';
import { AppClassifier } from './app-classifier.js';
import { ContextSanitizer } from './context-sanitizer.js';
import { DEFAULT_CONFIG } from '../../shared/constants.js';
import logger from '../../shared/logger.js';

export class ContextEngine {
  constructor(databaseInstance = null) {
    this.db = databaseInstance || defaultDb;
    this.classifier = new AppClassifier(() => this.db.getAppRules());
  }

  /**
   * Evaluates privacy permissions from database configuration.
   */
  getPrivacyPolicy() {
    return {
      windowTitle: this.db.getSetting('context_window_title') !== 'false',
      selectedText: this.db.getSetting('context_selected_text') === 'true', // Privacy default: disabled
      textboxContent: this.db.getSetting('context_textbox_content') === 'true', // Privacy default: disabled
      browserUrl: this.db.getSetting('context_browser_url') === 'true' // Privacy default: disabled
    };
  }

  /**
   * Processes raw helper context through privacy filtering, classification, and sanitization.
   * @param {string} sessionId - Associated recording session identifier
   * @param {Object} rawHelperContext - Output from VeoFlowHelper.exe get_context
   * @returns {Object} Validated, permission-filtered context object
   */
  processContext(sessionId, rawHelperContext = {}) {
    const privacy = this.getPrivacyPolicy();
    const raw = rawHelperContext || {};

    // 1. Semantic Application Classification
    const classification = this.classifier.classify(raw);

    // 2. Permission Filtering
    const permittedTitle = privacy.windowTitle ? (raw.windowTitle || '') : '';
    const permittedUrl = privacy.browserUrl ? (raw.url || '') : '';
    const permittedSelected = privacy.selectedText ? (raw.textbox?.selectedText || '') : '';
    const permittedContents = privacy.textboxContent ? (raw.textbox?.contents || '') : '';
    const permittedBefore = privacy.textboxContent ? (raw.textbox?.beforeText || '') : '';
    const permittedAfter = privacy.textboxContent ? (raw.textbox?.afterText || '') : '';

    // 3. Context Sanitization (neutralizing injection vectors and bounding length)
    const sanitizedTitle = ContextSanitizer.sanitizeText(permittedTitle, 200);
    const sanitizedUrl = ContextSanitizer.sanitizeText(permittedUrl, 250);
    const sanitizedSelected = ContextSanitizer.sanitizeText(permittedSelected, 300);
    const sanitizedContents = ContextSanitizer.sanitizeText(permittedContents, 300);
    const sanitizedBefore = ContextSanitizer.sanitizeText(permittedBefore, 300);
    const sanitizedAfter = ContextSanitizer.sanitizeText(permittedAfter, 300);
    const sanitizedControl = ContextSanitizer.sanitizeText(raw.textbox?.controlType || '', 80);

    const context = {
      sessionId: sessionId || `session_${Date.now()}`,
      targetHwnd: raw.hwnd || '0x0',
      timestamp: new Date().toISOString(),
      application: {
        name: raw.appName || 'Unknown',
        displayName: classification.displayName,
        category: classification.category,
        processId: Number(raw.processId) || 0,
        processPath: raw.processPath || ''
      },
      window: {
        title: sanitizedTitle,
        url: sanitizedUrl
      },
      input: {
        controlType: sanitizedControl,
        selectedText: sanitizedSelected,
        surroundingText: sanitizedContents,
        beforeCursor: sanitizedBefore,
        afterCursor: sanitizedAfter
      },
      privacy: {
        windowTitlePermitted: privacy.windowTitle,
        selectedTextPermitted: privacy.selectedText,
        textboxContentPermitted: privacy.textboxContent,
        urlPermitted: privacy.browserUrl
      },
      diagnostics: {
        matchedRule: classification.matchedRule,
        rawApp: raw.appName,
        rawHwnd: raw.hwnd
      }
    };

    logger.info(`Context resolved: [${context.application.category}] ${context.application.displayName} (HWND: ${context.targetHwnd})`);
    return context;
  }

  /**
   * Detects whether the active window has changed between capture and injection.
   * @param {string} originalHwnd - Handle recorded at start of dictation
   * @param {string} currentHwnd - Current active window handle
   * @returns {boolean} True if target window changed
   */
  hasTargetWindowChanged(originalHwnd, currentHwnd) {
    if (!originalHwnd || !currentHwnd) return false;
    const normalizeHwnd = (h) => {
      const s = String(h).trim().toLowerCase();
      try {
        if (s.startsWith('0x')) return BigInt(s).toString(16);
        return BigInt('0x' + s).toString(16);
      } catch {
        return s;
      }
    };
    return normalizeHwnd(originalHwnd) !== normalizeHwnd(currentHwnd);
  }
}

const defaultContextEngine = new ContextEngine();
export default defaultContextEngine;
