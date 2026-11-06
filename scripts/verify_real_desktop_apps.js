import assert from 'node:assert';
import { spawn, execSync } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline';
import defaultDb from '../app/database/database.js';
import { TransactionTracker, TRANSACTION_STATUSES } from '../app/core/injection/transaction-tracker.js';

const HELPER_PATH = path.resolve('helper/bin/VeoFlowHelper.exe');
const GET_HWND_PATH = path.resolve('scripts/get_window_hwnd.exe');

function getClipboardText() {
  return execSync('powershell -NoProfile -NonInteractive -Sta -Command "Get-Clipboard"', { timeout: 8000 })
    .toString()
    .trim();
}

function setClipboardText(text) {
  const escaped = text.replace(/'/g, "''");
  execSync(`powershell -NoProfile -NonInteractive -Sta -Command "Set-Clipboard -Value '${escaped}'"`, { timeout: 8000 });
}

async function runDesktopAppAcceptance() {
  console.log('================================================================');
  console.log(' VEOFLOW v1.0.0 — REAL DESKTOP APPLICATION ACCEPTANCE SUITE      ');
  console.log('================================================================\n');

  // 1. Establish Canary Clipboard
  const originalCanary = `CANARY_ACCEPTANCE_${Date.now()}`;
  setClipboardText(originalCanary);
  const verifyCanary = getClipboardText();
  assert.strictEqual(verifyCanary, originalCanary, 'Canary clipboard must be established');
  console.log('[1] Baseline Clipboard Canary Established:', verifyCanary);

  const tracker = new TransactionTracker(100, defaultDb);

  // 2. Spawn Real Helper
  const proc = spawn(HELPER_PATH, [], { stdio: ['pipe', 'pipe', 'pipe'] });
  const rl = readline.createInterface({ input: proc.stdout });

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
      proc.stdin.write(JSON.stringify(cmd) + '\n');
    });
  }

  // Wait for ready
  await new Promise((resolve) => {
    rl.once('line', (line) => resolve(JSON.parse(line)));
  });

  try {
    // 3. Query Active Foreground Application Context
    const ctxResp = await sendCommand({ id: 'ctx_acceptance_1', action: 'get_context' });
    console.log('[2] Active Desktop Application Context:');
    console.log(`    - HWND:         ${ctxResp.context?.hwnd}`);
    console.log(`    - Application:  ${ctxResp.context?.appName}`);
    console.log(`    - Window Title: ${ctxResp.context?.windowTitle}`);
    console.log(`    - Process ID:   ${ctxResp.context?.processId}`);
    console.log(`    - Path:         ${ctxResp.context?.processPath}`);

    const activeHwnd = ctxResp.context?.hwnd;
    assert.ok(activeHwnd && activeHwnd !== '0x0', 'Active HWND must be valid');

    // 4. Test Active Application Injection & Unicode Preservation
    const unicodePayload = 'VeoFlow Acceptance: Multilingual Test 🚀 (नमस्ते & 日本語) & Symbols: <>&%';
    const tx = tracker.createTransaction({
      text: unicodePayload,
      rawTranscript: 'veoflow acceptance multilingual test symbols',
      targetHwnd: activeHwnd,
      appName: ctxResp.context?.appName || 'desktop',
      strategy: 'auto'
    });

    console.log('\n[3] Initiating Real Injection into Active Window:');
    console.log(`    - Transaction ID: ${tx.id}`);
    console.log(`    - Target:         ${activeHwnd} (${ctxResp.context?.appName})`);
    console.log(`    - Payload:        ${unicodePayload}`);

    const injectResp = await sendCommand({
      id: 'inj_acceptance_1',
      action: 'inject_text',
      text: unicodePayload,
      targetHwnd: activeHwnd,
      strategy: 'auto',
      transactionId: tx.id
    });

    console.log('[4] Helper Injection Response:', JSON.stringify(injectResp));

    assert.strictEqual(injectResp.success, true, 'Active application injection must report success');
    assert.strictEqual(injectResp.targetHwnd, activeHwnd, 'Target HWND must match');
    assert.strictEqual(injectResp.clipboardRestored, true, 'Clipboard must be restored');
    assert.notStrictEqual(injectResp.status, 'inserted', 'Status must never be inserted');
    assert.ok(['verified', 'unverified'].includes(injectResp.status));

    // 5. Reconcile with SQLite Database
    let finalStatus = injectResp.verified ? TRANSACTION_STATUSES.VERIFIED : TRANSACTION_STATUSES.UNVERIFIED;
    tracker.updateTransaction(tx.id, {
      status: finalStatus,
      strategy: injectResp.strategy || 'clipboard_paste',
      verified: !!injectResp.verified,
      clipboardRestored: !!injectResp.clipboardRestored
    });

    const dbTx = defaultDb.getTransaction(tx.id);
    console.log('[5] Reconciled SQLite Ledger Record:', JSON.stringify(dbTx));
    assert.ok(dbTx, 'Record must exist in SQLite');
    assert.strictEqual(dbTx.status, finalStatus, 'SQLite status must match helper status');
    assert.notStrictEqual(dbTx.status, 'inserted', 'SQLite status must NEVER be inserted');
    assert.strictEqual(dbTx.target_hwnd, activeHwnd, 'SQLite target HWND must match');

    // 6. Verify Post-Injection Clipboard Restoration
    const currentClip = getClipboardText();
    assert.strictEqual(currentClip, originalCanary, 'User canary clipboard must remain 100% intact');
    console.log('[6] Clipboard Restoration Verified 100%: original canary preserved');

    // 7. Verify Background Window Rejection (Focus Change Guard)
    let bgHwnd = '0x1B0962';
    try {
      const out = execSync(`"${GET_HWND_PATH}"`, { timeout: 5000 }).toString().trim();
      if (out && out.startsWith('0x')) bgHwnd = out;
    } catch {}

    console.log(`\n[7] Testing Focus Change Guard with Background Target: ${bgHwnd}...`);
    const bgResp = await sendCommand({
      id: 'inj_bg_guard',
      action: 'inject_text',
      text: 'Background Attack Payload That Must Be Aborted',
      targetHwnd: bgHwnd
    });

    console.log('    Background Guard Response:', JSON.stringify(bgResp));
    assert.strictEqual(bgResp.success, false, 'Background target must fail');
    assert.strictEqual(bgResp.status, 'aborted', 'Background target status must be aborted');
    assert.ok(bgResp.error.includes('not the active foreground window'), 'Must report foreground mismatch');
    console.log('    -> PASS: Background target safely aborted');

    // 8. Verify Zero HWND Guard
    console.log('\n[8] Testing Zero HWND Guard (0x0)...');
    const zeroResp = await sendCommand({
      id: 'inj_zero_guard',
      action: 'inject_text',
      text: 'Zero HWND Payload',
      targetHwnd: '0x0'
    });
    assert.strictEqual(zeroResp.success, false);
    assert.strictEqual(zeroResp.status, 'aborted');
    console.log('    -> PASS: Zero HWND safely aborted');

    console.log('\n================================================================');
    console.log(' [PASS] ALL REAL DESKTOP ACCEPTANCE CHECKS PASSED 100%          ');
    console.log('================================================================');
  } finally {
    try {
      setClipboardText(originalCanary);
    } catch {}
    try {
      proc.stdin.write(JSON.stringify({ id: 'exit', action: 'exit' }) + '\n');
      proc.kill();
    } catch {}
  }
}

runDesktopAppAcceptance().catch((e) => {
  console.error('\n[FAIL] Real Desktop Acceptance Suite failed:', e);
  process.exit(1);
});
