/**
 * VeoFlow DiffPaster (ESM)
 * Calculates diffs and coordinates incremental or full text injection via native helper.
 */
import DiffMatchPatch from 'diff-match-patch';
import helper from './helperClient.js';
import { defaultInjectionManager } from './injection/injection-manager.js';

export class DiffPaster {
  constructor(injectionManager = null) {
    this.dmp = new DiffMatchPatch();
    this.injectionManager = injectionManager || defaultInjectionManager;
    this.lastPastedText = '';
  }

  reset() {
    this.lastPastedText = '';
  }

  // Calculate incremental changes between what was previously pasted and the new incoming text
  calculateDiff(newText) {
    const diffs = this.dmp.diff_main(this.lastPastedText, newText);
    this.dmp.diff_cleanupSemantic(diffs);
    return diffs;
  }

  // Execute full paste via injection manager
  async pasteFull(text, targetContext = {}, options = {}) {
    if (!text) return false;
    this.lastPastedText = text;
    const res = await this.injectionManager.inject(text, targetContext, options);
    return res.success;
  }

  // Execute incremental diff paste (for live streaming partial transcripts)
  async pasteIncremental(newText, targetContext = {}, options = {}) {
    if (!this.lastPastedText) {
      return await this.pasteFull(newText, targetContext, options);
    }

    const diffs = this.calculateDiff(newText);
    let backspaces = 0;
    let textToAppend = '';

    for (const [op, data] of diffs) {
      if (op === DiffMatchPatch.DIFF_DELETE) {
        backspaces += data.length;
      } else if (op === DiffMatchPatch.DIFF_INSERT) {
        textToAppend += data;
      }
    }

    this.lastPastedText = newText;

    // If change is simple append:
    if (backspaces === 0 && textToAppend.length > 0) {
      const res = await this.injectionManager.inject(textToAppend, targetContext, options);
      return res.success;
    }

    // Otherwise, replace with full new text
    const res = await this.injectionManager.inject(newText, targetContext, options);
    return res.success;
  }
}

export const defaultDiffPaster = new DiffPaster();
export default defaultDiffPaster;
