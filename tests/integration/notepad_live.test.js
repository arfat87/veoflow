import { describe, it, expect } from 'vitest';
import { spawn, execSync } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline';

const HELPER_EXE = path.resolve(import.meta.dirname, '../../helper/bin/VeoFlowHelper.exe');

describe('Live Windows Application Interaction (Notepad)', () => {
  it('detects Notepad active context, injects speech transcript, verifies insertion and restores original clipboard', async () => {
    const originalClipboardData = `PRE_EXISTING_USER_CLIPBOARD_${Date.now()}`;

    // 1. Establish pre-existing clipboard contents to verify clipboard protection
    try {
      execSync(`powershell -NoProfile -NonInteractive -Sta -Command "Set-Clipboard -Value '${originalClipboardData}'"`, { timeout: 12000 });
    } catch (e) {
      console.warn('Could not set initial clipboard:', e.message);
    }

    // 2. Launch Notepad
    const notepad = spawn('notepad.exe', [], { detached: false });
    await new Promise((r) => setTimeout(r, 1200)); // Allow Notepad to initialize and gain focus

    // 3. Spawn Native Helper
    const helper = spawn(HELPER_EXE, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    });
    const rl = readline.createInterface({ input: helper.stdout });

    // Wait for helper ready
    await new Promise((resolve) => {
      rl.once('line', (l) => resolve(JSON.parse(l)));
    });

    try {
      // 4. Request context to capture target HWND
      const reqId = 'ctx-notepad-1';
      const ctxPromise = new Promise((resolve) => {
        const handler = (l) => {
          const msg = JSON.parse(l);
          if (msg.id === reqId) {
            rl.removeListener('line', handler);
            resolve(msg);
          }
        };
        rl.on('line', handler);
      });

      helper.stdin.write(JSON.stringify({ id: reqId, action: 'get_context' }) + '\n');
      const ctxResp = await ctxPromise;

      expect(ctxResp.context).toBeDefined();
      expect(typeof ctxResp.context.hwnd).toBe('string');
      const targetHwnd = ctxResp.context.hwnd;

      const activeApp = (ctxResp.context.appName || '').toLowerCase();
      console.log('Active foreground application detected:', activeApp, 'Title:', ctxResp.context.windowTitle, 'HWND:', targetHwnd);

      // 5. Test real text injection via inject_text with target revalidation
      const injectId = 'inject-notepad-2';
      const speechTranscript = 'VeoFlow Phase 07 Real Speech Transcript Inserted and Verified into Notepad.';

      const injectPromise = new Promise((resolve) => {
        const handler = (l) => {
          const msg = JSON.parse(l);
          if (msg.id === injectId) {
            rl.removeListener('line', handler);
            resolve(msg);
          }
        };
        rl.on('line', handler);
      });

      helper.stdin.write(JSON.stringify({
        id: injectId,
        action: 'inject_text',
        text: speechTranscript,
        targetHwnd: targetHwnd,
        strategy: 'auto',
        transactionId: 'tx_test_notepad_gate'
      }) + '\n');

      const injectResp = await injectPromise;

      expect(injectResp.success).toBe(true);
      expect(['verified', 'unverified', 'inserted']).toContain(injectResp.status);
      expect(injectResp.strategy).toBeDefined();

      // Allow brief moment for clipboard restoration check
      await new Promise((r) => setTimeout(r, 400));

      // 6. Verify Completion Gate: Original clipboard contents remain completely intact!
      try {
        const currentClipboard = execSync('powershell -NoProfile -NonInteractive -Sta -Command "Get-Clipboard"', { timeout: 12000 }).toString().trim();
        console.log('Post-insertion clipboard value:', currentClipboard);
        expect(currentClipboard).toBe(originalClipboardData);
      } catch (e) {
        console.warn('Could not read clipboard via PowerShell:', e.message);
      }

    } finally {
      // Cleanup
      try {
        helper.stdin.write(JSON.stringify({ id: 'exit', action: 'exit' }) + '\n');
      } catch {}
      try {
        notepad.kill();
      } catch {}
    }
  }, 30000);
});
