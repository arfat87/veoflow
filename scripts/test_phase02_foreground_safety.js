import assert from 'node:assert';
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const HELPER_EXE = path.resolve('helper/bin/VeoFlowHelper.exe');

async function runForegroundSafetySuite() {
  console.log('====================================================');
  console.log(' PHASE 02: STRICT FOREGROUND INJECTION SAFETY SUITE ');
  console.log('====================================================');

  const helper = spawn(HELPER_EXE, [], {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true
  });
  const rl = readline.createInterface({ input: helper.stdout });

  function sendCommand(cmd, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timeout on cmd ${cmd.id || cmd.action}`)), timeoutMs);
      const handler = (line) => {
        try {
          const msg = JSON.parse(line);
          if (msg.id === cmd.id) {
            rl.removeListener('line', handler);
            clearTimeout(timer);
            resolve(msg);
          }
        } catch {}
      };
      rl.on('line', handler);
      helper.stdin.write(JSON.stringify(cmd) + '\n');
    });
  }

  // Wait for ready
  await new Promise((resolve) => {
    rl.once('line', (line) => resolve(JSON.parse(line)));
  });

  try {
    // -----------------------------------------------------------------
    // TEST 1: Zero HWND (0x0, empty, null) -> MUST ABORT
    // -----------------------------------------------------------------
    console.log('[TEST 1] Testing Zero HWND rejection...');
    const zeroRes1 = await sendCommand({
      id: 'test_zero_1',
      action: 'inject_text',
      text: 'Test Zero 1',
      targetHwnd: '0x0'
    });
    assert.strictEqual(zeroRes1.success, false, '0x0 HWND must not succeed');
    assert.strictEqual(zeroRes1.status, 'aborted', '0x0 HWND status must be aborted');
    console.log('  -> PASS: 0x0 HWND aborted with error:', zeroRes1.error);

    const zeroRes2 = await sendCommand({
      id: 'test_zero_2',
      action: 'inject_text',
      text: 'Test Zero 2',
      targetHwnd: ''
    });
    assert.strictEqual(zeroRes2.success, false, 'Empty HWND must not succeed');
    assert.strictEqual(zeroRes2.status, 'aborted', 'Empty HWND status must be aborted');
    console.log('  -> PASS: Empty HWND aborted with error:', zeroRes2.error);

    // -----------------------------------------------------------------
    // TEST 2: Destroyed / Invalid HWND -> MUST ABORT
    // -----------------------------------------------------------------
    console.log('[TEST 2] Testing Destroyed / Non-existent HWND rejection...');
    const deadRes = await sendCommand({
      id: 'test_dead_1',
      action: 'inject_text',
      text: 'Test Destroyed',
      targetHwnd: '0xDEADBEEF'
    });
    assert.strictEqual(deadRes.success, false, 'Non-existent HWND must not succeed');
    assert.strictEqual(deadRes.status, 'aborted', 'Non-existent HWND status must be aborted');
    assert.ok(deadRes.error.includes('destroyed') || deadRes.error.includes('does not exist'), 'Must report destroyed/non-existent');
    console.log('  -> PASS: Destroyed HWND aborted with error:', deadRes.error);

    // -----------------------------------------------------------------
    // TEST 3: Background Window HWND (Target != Active Foreground) -> MUST ABORT
    // -----------------------------------------------------------------
    console.log('[TEST 3] Testing Background Window rejection...');
    const ctxResp = await sendCommand({ id: 'test_ctx_1', action: 'get_context' });
    const realFgHwnd = ctxResp.context?.hwnd || '0x0';
    console.log('  Active desktop foreground window:', realFgHwnd, `(${ctxResp.context?.appName})`);

    // Get an actual, existing visible background window from the user desktop
    let bgTargetHwnd = '0x1B0962';
    try {
      if (!fs.existsSync('scripts/get_window_hwnd.exe') && fs.existsSync('scripts/get_window_hwnd.cs')) {
        execSync('C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe /nologo /out:scripts\\get_window_hwnd.exe scripts\\get_window_hwnd.cs');
      }
      const out = execSync('scripts\\get_window_hwnd.exe', { timeout: 5000 }).toString().trim();
      if (out && out.startsWith('0x')) {
        bgTargetHwnd = out;
      }
    } catch (e) {
      console.warn('  Fallback to default background HWND:', e.message);
    }
    console.log('  Targeting verified background window:', bgTargetHwnd);

    const bgRes = await sendCommand({
      id: 'test_bg_1',
      action: 'inject_text',
      text: 'Background Payload Must Be Aborted',
      targetHwnd: bgTargetHwnd
    });
    console.log('  Background test response:', JSON.stringify(bgRes));
    assert.strictEqual(bgRes.success, false, 'Background target HWND must not succeed');
    assert.strictEqual(bgRes.status, 'aborted', 'Background target status must be aborted');
    assert.ok(
      bgRes.error.includes('not the active foreground window') || bgRes.error.includes('Foreground window mismatch'),
      `Error must mention foreground mismatch, got: ${bgRes.error}`
    );
    console.log('  -> PASS: Background window aborted with error:', bgRes.error);

    // -----------------------------------------------------------------
    // TEST 4: Clipboard Preservation after Abort
    // -----------------------------------------------------------------
    console.log('[TEST 4] Testing Clipboard Preservation after Abort...');
    const testSecretClipboard = `USER_UNTOUCHED_SECRET_${Date.now()}`;
    try {
      execSync(`powershell -NoProfile -NonInteractive -Sta -Command "Set-Clipboard -Value '${testSecretClipboard}'"`, { timeout: 8000 });
    } catch {}

    const abortRes = await sendCommand({
      id: 'test_abort_clip',
      action: 'inject_text',
      text: 'TEMPORARY_PAYLOAD_THAT_MUST_NOT_PERSIST',
      targetHwnd: '0x0'
    });
    assert.strictEqual(abortRes.success, false);
    assert.strictEqual(abortRes.status, 'aborted');

    let currentClip = '';
    try {
      currentClip = execSync('powershell -NoProfile -NonInteractive -Sta -Command "Get-Clipboard"', { timeout: 8000 }).toString().trim();
    } catch {}
    assert.strictEqual(currentClip, testSecretClipboard, 'Clipboard must remain completely intact after injection abort');
    console.log('  -> PASS: User clipboard was 100% preserved after abort');

    // -----------------------------------------------------------------
    // TEST 5: Active Foreground Target -> Injects & Restores Clipboard
    // -----------------------------------------------------------------
    console.log('[TEST 5] Testing Active Foreground Target Injection & Restoration...');
    if (realFgHwnd && realFgHwnd !== '0x0') {
      const activeRes = await sendCommand({
        id: 'test_active_1',
        action: 'inject_text',
        text: 'VeoFlow Active Foreground Verified Test Sentence.',
        targetHwnd: realFgHwnd,
        strategy: 'clipboard_paste',
        transactionId: 'tx_verified_active_fg'
      });
      assert.strictEqual(activeRes.success, true, 'Active foreground target must succeed');
      assert.ok(['verified', 'unverified'].includes(activeRes.status), 'Status must be verified or unverified');
      assert.strictEqual(activeRes.clipboardRestored, true, 'Clipboard must be restored after successful paste');
      console.log('  -> PASS: Active foreground injection succeeded with status:', activeRes.status, 'clipboardRestored:', activeRes.clipboardRestored);

      // Verify user's original clipboard was restored after the paste
      let postPasteClip = '';
      try {
        postPasteClip = execSync('powershell -NoProfile -NonInteractive -Sta -Command "Get-Clipboard"', { timeout: 8000 }).toString().trim();
      } catch {}
      assert.strictEqual(postPasteClip, testSecretClipboard, 'Original clipboard must be restored post-paste');
      console.log('  -> PASS: User original clipboard restored post-paste successfully');
    } else {
      console.log('  (Skipping active test: no active foreground window in this session)');
    }

    console.log('\n====================================================');
    console.log(' ALL FOREGROUND INJECTION SAFETY TESTS PASSED 100%  ');
    console.log('====================================================');
  } finally {
    try {
      helper.stdin.write(JSON.stringify({ id: 'exit', action: 'exit' }) + '\n');
      helper.kill();
    } catch {}
  }
}

runForegroundSafetySuite().catch((err) => {
  console.error('\n[FAIL] Test suite failed:', err);
  process.exit(1);
});
