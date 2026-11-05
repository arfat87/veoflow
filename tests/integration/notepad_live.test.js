import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline';

const HELPER_EXE = path.resolve(import.meta.dirname, '../../helper/bin/VeoFlowHelper.exe');

describe('Live Windows Application Interaction (Notepad)', () => {
  it('detects Notepad active context and injects text via helper', async () => {
    // 1. Launch Notepad
    const notepad = spawn('notepad.exe', [], { detached: false });
    await new Promise((r) => setTimeout(r, 800)); // Allow Notepad to initialize and gain focus

    // 2. Spawn Helper
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
      // 3. Request context
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
      // If notepad is active foreground window:
      const activeApp = (ctxResp.context.appName || '').toLowerCase();
      console.log('Active foreground application detected:', activeApp, 'Title:', ctxResp.context.windowTitle);

      // 4. Test text injection via paste_text
      const pasteId = 'paste-notepad-2';
      const pastePromise = new Promise((resolve) => {
        const handler = (l) => {
          const msg = JSON.parse(l);
          if (msg.id === pasteId) {
            rl.removeListener('line', handler);
            resolve(msg);
          }
        };
        rl.on('line', handler);
      });

      helper.stdin.write(JSON.stringify({
        id: pasteId,
        action: 'paste_text',
        text: 'VeoFlow Phase 02 Native Helper Verified.'
      }) + '\n');

      const pasteResp = await pastePromise;
      expect(pasteResp.success).toBe(true);

    } finally {
      // Cleanup
      try {
        helper.stdin.write(JSON.stringify({ id: 'exit', action: 'exit' }) + '\n');
      } catch {}
      try {
        notepad.kill();
      } catch {}
    }
  });
});

