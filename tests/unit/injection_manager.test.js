import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TransactionTracker, TRANSACTION_STATUSES } from '../../app/core/injection/transaction-tracker.js';
import { TargetManager } from '../../app/core/injection/target-manager.js';
import { InjectionManager } from '../../app/core/injection/injection-manager.js';

describe('Phase 07: Smart Text Injection Subsystem', () => {
  describe('TransactionTracker', () => {
    let tracker;

    beforeEach(() => {
      tracker = new TransactionTracker(10);
    });

    it('creates a transaction in PENDING state with text hash and metadata', () => {
      const tx = tracker.createTransaction({
        text: 'Hello world from VeoFlow',
        rawTranscript: 'hello world from veoflow',
        targetHwnd: '0x10A2F',
        processId: 1234,
        appName: 'notepad.exe',
        windowTitle: 'Untitled - Notepad',
        strategy: 'clipboard_paste'
      });

      expect(tx.id).toMatch(/^tx_\d+_[a-f0-9]{8}$/);
      expect(tx.status).toBe(TRANSACTION_STATUSES.PENDING);
      expect(tx.textHash).toBeDefined();
      expect(tx.textHash.length).toBe(16);
      expect(tx.textLength).toBe('Hello world from VeoFlow'.length);
      expect(tx.targetProcess.name).toBe('notepad.exe');
      expect(tx.targetWindow.hwnd).toBe('0x10A2F');
    });

    it('enforces rule: Never report unverified insertion as verified', () => {
      const tx = tracker.createTransaction({ text: 'sample' });

      // If status is set to VERIFIED but verified boolean is false, status falls back to UNVERIFIED
      tracker.updateTransaction(tx.id, {
        status: TRANSACTION_STATUSES.VERIFIED,
        verified: false
      });

      const updated = tracker.getTransaction(tx.id);
      expect(updated.status).toBe(TRANSACTION_STATUSES.UNVERIFIED);
      expect(updated.verified).toBe(false);
    });

    it('transitions to VERIFIED when verified is true', () => {
      const tx = tracker.createTransaction({ text: 'sample' });

      tracker.updateTransaction(tx.id, {
        status: TRANSACTION_STATUSES.INSERTED,
        verified: true
      });

      const updated = tracker.getTransaction(tx.id);
      expect(updated.status).toBe(TRANSACTION_STATUSES.VERIFIED);
      expect(updated.verified).toBe(true);
    });

    it('evicts oldest transactions when max capacity is reached', () => {
      for (let i = 0; i < 15; i++) {
        tracker.createTransaction({ text: `payload_${i}` });
      }

      const recent = tracker.getRecentTransactions(20);
      expect(recent.length).toBe(10);
      expect(recent[0].formattedText).toBe('payload_14');
    });
  });

  describe('TargetManager', () => {
    it('normalizes HWND handles across case, leading zeroes, and hex/dec representations', () => {
      const h1 = TargetManager.normalizeHwnd('0x10A2F');
      const h2 = TargetManager.normalizeHwnd('0x00010a2f');
      const h3 = TargetManager.normalizeHwnd('10a2f');

      expect(h1).toBe(h2);
      expect(h1).toBe(h3);
    });

    it('validates target when original HWND matches current active HWND', () => {
      const original = { hwnd: '0x12345', appName: 'notepad.exe' };
      const current = { hwnd: '0x00012345', appName: 'notepad.exe' };

      const res = TargetManager.revalidateTarget(original, current);
      expect(res.valid).toBe(true);
    });

    it('rejects target when foreground window has switched to another application', () => {
      const original = { hwnd: '0x12345', appName: 'Code.exe' };
      const current = { hwnd: '0x99999', appName: 'slack.exe' };

      const res = TargetManager.revalidateTarget(original, current);
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('Foreground window changed from Code.exe to slack.exe');
    });

    it('rejects target when HWND is 0x0 or missing', () => {
      const res = TargetManager.revalidateTarget({ hwnd: '0x0' }, { hwnd: '0x123' });
      expect(res.valid).toBe(false);
    });
  });

  describe('InjectionManager Orchestration & Recovery', () => {
    let mockHelper;
    let tracker;
    let manager;

    beforeEach(() => {
      tracker = new TransactionTracker();
      mockHelper = {
        getContext: vi.fn(),
        injectText: vi.fn()
      };
      manager = new InjectionManager(mockHelper, tracker);
    });

    it('successfully executes verified insertion and updates transaction ledger', async () => {
      mockHelper.getContext.mockResolvedValue({
        hwnd: '0xABCDE',
        appName: 'notepad.exe'
      });
      mockHelper.injectText.mockResolvedValue({
        success: true,
        verified: true,
        strategy: 'uia_value',
        clipboardRestored: true
      });

      const targetCtx = { hwnd: '0xABCDE', appName: 'notepad.exe' };
      const res = await manager.inject('Hello from VeoFlow', targetCtx);

      expect(res.success).toBe(true);
      expect(res.status).toBe(TRANSACTION_STATUSES.VERIFIED);
      expect(res.verified).toBe(true);
      expect(res.transaction.strategy).toBe('uia_value');
      expect(res.transaction.clipboardRestored).toBe(true);
    });

    it('marks unverified status when insertion succeeds without UIA verification', async () => {
      mockHelper.getContext.mockResolvedValue({
        hwnd: '0xABCDE',
        appName: 'chrome.exe'
      });
      mockHelper.injectText.mockResolvedValue({
        success: true,
        verified: false,
        strategy: 'clipboard_paste',
        clipboardRestored: true
      });

      const targetCtx = { hwnd: '0xABCDE', appName: 'chrome.exe' };
      const res = await manager.inject('Web content', targetCtx);

      expect(res.success).toBe(true);
      expect(res.status).toBe(TRANSACTION_STATUSES.UNVERIFIED);
      expect(res.verified).toBe(false);
      expect(res.transaction.strategy).toBe('clipboard_paste');
    });

    it('aborts safely with CANCELLED status when foreground window switches during processing', async () => {
      mockHelper.getContext.mockResolvedValue({
        hwnd: '0x99999',
        appName: 'different_app.exe'
      });

      const targetCtx = { hwnd: '0xABCDE', appName: 'notepad.exe' };
      const res = await manager.inject('Secret message', targetCtx);

      expect(res.success).toBe(false);
      expect(res.status).toBe(TRANSACTION_STATUSES.CANCELLED);
      expect(mockHelper.injectText).not.toHaveBeenCalled();
      expect(res.transaction.status).toBe(TRANSACTION_STATUSES.CANCELLED);
    });

    it('handles native helper error with FAILED status and offers recovery text', async () => {
      mockHelper.getContext.mockResolvedValue({ hwnd: '0x1', appName: 'app.exe' });
      mockHelper.injectText.mockResolvedValue({
        success: false,
        error: 'Clipboard locked by external process'
      });

      const targetCtx = { hwnd: '0x1', appName: 'app.exe' };
      const res = await manager.inject('Recoverable text', targetCtx, {
        rawTranscript: 'recoverable text'
      });

      expect(res.success).toBe(false);
      expect(res.status).toBe(TRANSACTION_STATUSES.FAILED);
      expect(res.transaction.formattedText).toBe('Recoverable text');
      expect(res.transaction.rawTranscript).toBe('recoverable text');
    });
  });

  describe('Unicode & Multilingual Text Integrity', () => {
    it('preserves multi-language scripts, emojis, and special symbols', () => {
      const payloads = [
        { lang: 'English', text: 'VeoFlow production-grade speech injection.' },
        { lang: 'Hindi', text: 'नमस्ते दुनिया, यह वीओफ्लो की आवाज़ टाइपिंग है।' },
        { lang: 'Bengali', text: 'হ্যালো বিশ্ব, এটি ভিওফ্লো ভয়েস টাইপিং টেস্ট।' },
        { lang: 'Japanese', text: 'こんにちは世界、これはVeoFlowの音声入力です。' },
        { lang: 'Emojis', text: '🚀 Speech recognition completed! 🎉 🎙️✨' },
        { lang: 'Special Characters', text: 'Math: ∀x ∈ ℝ, x² ≥ 0 & Currency: $100, €85, ¥15000, £75.' },
        { lang: 'Long Paragraph', text: 'Line 1: Multi-line paragraph test.\nLine 2: Indented text.\nLine 3: Final conclusion.' }
      ];

      const tracker = new TransactionTracker();

      for (const item of payloads) {
        const tx = tracker.createTransaction({ text: item.text, appName: 'notepad.exe' });
        expect(tx.formattedText).toBe(item.text);
        expect(tx.textHash).toBe(TransactionTracker.hashText(item.text));
        expect(tx.textLength).toBe(item.text.length);
      }
    });
  });
});

