/**
 * VeoFlow DiffPaster (ESM)
 * Calculates diffs and coordinates incremental or full text injection via native helper.
 */
import DiffMatchPatch from 'diff-match-patch';
import helper from './helperClient.js';

export class DiffPaster {
  constructor() {
    this.dmp = new DiffMatchPatch();
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

  // Execute full paste via native helper
  async pasteFull(text) {
    if (!text) return false;
    this.lastPastedText = text;
    return await helper.pasteText(text);
  }

  // Execute incremental diff paste (for live streaming partial transcripts)
  async pasteIncremental(newText) {
    if (!this.lastPastedText) {
      return await this.pasteFull(newText);
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
      return await helper.pasteText(textToAppend);
    }

    // Otherwise, replace with full new text
    return await helper.pasteText(newText);
  }
}

const defaultDiffPaster = new DiffPaster();
export default defaultDiffPaster;

