/**
 * VeoFlow Transaction Tracker (ESM)
 * Tracks and audits text insertion transactions with status lifecycles and cryptographic hashes.
 */
import crypto from 'node:crypto';
import defaultDb from '../../database/database.js';

export const TRANSACTION_STATUSES = {
  PENDING: 'pending',
  INSERTED: 'inserted',
  VERIFIED: 'verified',
  UNVERIFIED: 'unverified',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

export class TransactionTracker {
  constructor(maxHistory = 100, databaseInstance = null) {
    this.transactions = new Map();
    this.maxHistory = maxHistory;
    this.db = databaseInstance;
  }

  /**
   * Generates a SHA-256 hash of the text payload for integrity verification.
   * @param {string} text
   * @returns {string} Truncated 16-char hex hash
   */
  static hashText(text) {
    if (!text || typeof text !== 'string') return '';
    return crypto.createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16);
  }

  /**
   * Initializes a new paste transaction in PENDING state.
   */
  createTransaction({ text, rawTranscript = '', targetHwnd = '0x0', processId = 0, appName = 'Unknown', windowTitle = '', strategy = 'auto' }) {
    const id = `tx_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const textHash = TransactionTracker.hashText(text);

    const transaction = {
      id,
      timestamp: new Date().toISOString(),
      status: TRANSACTION_STATUSES.PENDING,
      targetProcess: {
        id: Number(processId) || 0,
        name: appName || 'Unknown'
      },
      targetWindow: {
        hwnd: targetHwnd || '0x0',
        title: windowTitle || ''
      },
      textHash,
      textLength: text ? text.length : 0,
      formattedText: text,
      rawTranscript: rawTranscript || '',
      strategy: strategy || 'auto',
      verified: false,
      clipboardRestored: false,
      error: null
    };

    this.transactions.set(id, transaction);

    if (this.db && typeof this.db.addInsertionTransaction === 'function') {
      try {
        this.db.addInsertionTransaction({
          transactionId: id,
          targetHwnd,
          targetProcess: appName,
          strategy,
          textHash,
          status: TRANSACTION_STATUSES.PENDING
        });
      } catch {}
    }

    // Evict oldest transactions if capacity exceeded
    if (this.transactions.size > this.maxHistory) {
      const oldestKey = this.transactions.keys().next().value;
      this.transactions.delete(oldestKey);
    }

    return transaction;
  }

  /**
   * Updates an existing transaction. Enforces the strict rule:
   * "Never report unverified insertion as verified."
   */
  updateTransaction(id, updates = {}) {
    const tx = this.transactions.get(id);
    if (!tx) return null;

    if (updates.status) {
      // Validate allowed statuses
      const allowed = Object.values(TRANSACTION_STATUSES);
      if (allowed.includes(updates.status)) {
        tx.status = updates.status;
      }
    }

    if (typeof updates.verified === 'boolean') {
      tx.verified = updates.verified;
      // If marked verified, ensure status reflects verified
      if (updates.verified && tx.status === TRANSACTION_STATUSES.INSERTED) {
        tx.status = TRANSACTION_STATUSES.VERIFIED;
      } else if (!updates.verified && tx.status === TRANSACTION_STATUSES.VERIFIED) {
        // Enforce rule: cannot be status 'verified' if verified is false
        tx.status = TRANSACTION_STATUSES.UNVERIFIED;
      }
    }

    if (updates.strategy) tx.strategy = updates.strategy;
    if (typeof updates.clipboardRestored === 'boolean') tx.clipboardRestored = updates.clipboardRestored;
    if (updates.error) tx.error = updates.error;

    if (this.db && typeof this.db.updateInsertionTransaction === 'function') {
      try {
        this.db.updateInsertionTransaction(id, {
          status: tx.status,
          errorMessage: tx.error,
          completedAt: new Date().toISOString()
        });
      } catch {}
    }

    return tx;
  }

  getTransaction(id) {
    return this.transactions.get(id) || null;
  }

  getRecentTransactions(limit = 20) {
    return Array.from(this.transactions.values()).slice(-limit).reverse();
  }
}

export const defaultTransactionTracker = new TransactionTracker(100, defaultDb);
export default defaultTransactionTracker;

