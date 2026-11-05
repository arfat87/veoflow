/**
 * VeoFlow Target Manager (ESM)
 * Captures, stores, and revalidates foreground target window context prior to text injection.
 */
import logger from '../../shared/logger.js';

export class TargetManager {
  /**
   * Captures and normalizes the target context at the start of dictation.
   * @param {Object} rawContext - Output from native helper get_context
   * @returns {Object} Target descriptor
   */
  static captureTarget(rawContext = {}) {
    const raw = rawContext || {};
    const hwnd = (raw.hwnd || '0x0').trim();
    const pid = Number(raw.processId) || 0;
    const appName = (raw.appName || 'Unknown').trim();
    const windowTitle = (raw.windowTitle || '').trim();
    const controlType = (raw.textbox?.controlType || '').trim();

    return {
      hwnd,
      processId: pid,
      appName,
      windowTitle,
      focusedControlType: controlType,
      capturedAt: new Date().toISOString()
    };
  }

  /**
   * Normalizes HWND handles for comparison.
   */
  static normalizeHwnd(h) {
    if (!h) return '0';
    const s = String(h).trim().toLowerCase();
    try {
      if (s.startsWith('0x')) return BigInt(s).toString(16);
      return BigInt('0x' + s).toString(16);
    } catch {
      return s;
    }
  }

  /**
   * Revalidates that the currently active window matches the originally captured target.
   * @param {Object} originalTarget - Result of captureTarget()
   * @param {Object} currentActive - Current active window context from helper
   * @returns {{ valid: boolean, reason?: string }}
   */
  static revalidateTarget(originalTarget, currentActive) {
    if (!originalTarget || !originalTarget.hwnd || originalTarget.hwnd === '0x0') {
      return { valid: false, reason: 'Invalid or missing original target HWND' };
    }

    if (!currentActive || !currentActive.hwnd) {
      return { valid: false, reason: 'Could not determine current foreground window' };
    }

    const origNorm = this.normalizeHwnd(originalTarget.hwnd);
    const currNorm = this.normalizeHwnd(currentActive.hwnd);

    if (origNorm !== currNorm) {
      logger.warn(`Target window mismatch: expected HWND ${originalTarget.hwnd} (${originalTarget.appName}), but foreground is ${currentActive.hwnd} (${currentActive.appName})`);
      return {
        valid: false,
        reason: `Foreground window changed from ${originalTarget.appName} to ${currentActive.appName || 'another application'}`
      };
    }

    return { valid: true };
  }
}

export default TargetManager;

