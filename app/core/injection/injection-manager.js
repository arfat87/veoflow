/**
 * VeoFlow Smart Injection Manager (ESM)
 * Coordinates target revalidation, insertion strategy execution, verification, and recovery.
 */
import * as electron from 'electron';
const clipboard = electron.clipboard || (electron.default && typeof electron.default === 'object' ? electron.default.clipboard : null);
import helperClient from '../helperClient.js';
import { TargetManager } from './target-manager.js';
import { TransactionTracker, TRANSACTION_STATUSES, defaultTransactionTracker } from './transaction-tracker.js';
import logger from '../../shared/logger.js';

export class InjectionManager {
  constructor(helper = null, tracker = null) {
    this.helper = helper || helperClient;
    this.tracker = tracker || defaultTransactionTracker;
    this.lastSuccessfulText = '';
  }

  /**
   * Main insertion entrypoint with full transaction audit and target revalidation.
   * @param {string} formattedText - Validated text ready for pasting
   * @param {Object} targetContext - Context captured at start of dictation
   * @param {Object} [options] - Options (strategy, allowWindowChange, rawTranscript)
   * @returns {Promise<{ success: boolean, transaction: Object, status: string, error?: string }>}
   */
  async inject(formattedText, targetContext = {}, options = {}) {
    if (!formattedText || typeof formattedText !== 'string' || !formattedText.trim()) {
      return { success: false, status: TRANSACTION_STATUSES.FAILED, error: 'Empty text payload' };
    }

    const target = TargetManager.captureTarget(targetContext);
    const strategy = options.strategy || 'auto';
    const rawTranscript = options.rawTranscript || '';

    // 1. Initialize Audit Transaction
    const tx = this.tracker.createTransaction({
      text: formattedText,
      rawTranscript,
      targetHwnd: target.hwnd,
      processId: target.processId,
      appName: target.appName,
      windowTitle: target.windowTitle,
      strategy
    });

    logger.info(`Initiating injection transaction ${tx.id} for ${target.appName} (HWND: ${target.hwnd})`);

    // 2. Target Revalidation (Check active window before performing injection)
    if (!options.skipTargetRevalidation && target.hwnd && target.hwnd !== '0x0') {
      try {
        const currentActive = await this.helper.getContext();
        const validation = TargetManager.revalidateTarget(target, currentActive);

        if (!validation.valid && !options.allowWindowChange) {
          logger.warn(`Injection aborted for ${tx.id}: ${validation.reason}`);
          this.tracker.updateTransaction(tx.id, {
            status: TRANSACTION_STATUSES.CANCELLED,
            error: validation.reason
          });
          return {
            success: false,
            status: TRANSACTION_STATUSES.CANCELLED,
            transaction: this.tracker.getTransaction(tx.id),
            error: validation.reason
          };
        }
      } catch (err) {
        logger.warn(`Could not revalidate target context before injection: ${err.message}`);
      }
    }

    // 3. Dispatch to Native Helper
    try {
      const helperRes = await this.helper.injectText(formattedText, {
        targetHwnd: target.hwnd,
        strategy,
        transactionId: tx.id
      });

      // 4. Update Audit Record
      let finalStatus = TRANSACTION_STATUSES.INSERTED;
      if (helperRes.verified) {
        finalStatus = TRANSACTION_STATUSES.VERIFIED;
      } else if (helperRes.success) {
        finalStatus = TRANSACTION_STATUSES.UNVERIFIED;
      } else {
        finalStatus = TRANSACTION_STATUSES.FAILED;
      }

      const updatedTx = this.tracker.updateTransaction(tx.id, {
        status: finalStatus,
        verified: !!helperRes.verified,
        strategy: helperRes.strategy || strategy,
        clipboardRestored: !!helperRes.clipboardRestored,
        error: helperRes.error || null
      });

      if (helperRes.success) {
        this.lastSuccessfulText = formattedText;
        logger.info(`Injection transaction ${tx.id} completed: status=${finalStatus}, verified=${helperRes.verified}, strategy=${helperRes.strategy}`);
        return {
          success: true,
          status: finalStatus,
          verified: !!helperRes.verified,
          transaction: updatedTx
        };
      } else {
        logger.error(`Injection transaction ${tx.id} failed: ${helperRes.error || 'Unknown native error'}`);
        return {
          success: false,
          status: TRANSACTION_STATUSES.FAILED,
          transaction: updatedTx,
          error: helperRes.error || 'Native helper insertion failed'
        };
      }
    } catch (err) {
      logger.error(`Unexpected injection error in ${tx.id}:`, err.message);
      const updatedTx = this.tracker.updateTransaction(tx.id, {
        status: TRANSACTION_STATUSES.FAILED,
        error: err.message
      });

      return {
        success: false,
        status: TRANSACTION_STATUSES.FAILED,
        transaction: updatedTx,
        error: err.message
      };
    }
  }

  /**
   * Fallback Recovery: copies the formatted text to clipboard so user never loses work.
   * @param {string} text
   * @returns {boolean}
   */
  copyToClipboard(text) {
    if (!text) return false;
    try {
      if (clipboard && typeof clipboard.writeText === 'function') {
        clipboard.writeText(text);
      }
      return true;
    } catch {
      return false;
    }
  }
}

export const defaultInjectionManager = new InjectionManager();
export default defaultInjectionManager;

