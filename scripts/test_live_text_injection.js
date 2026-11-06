import assert from 'node:assert';
import { spawn, execSync } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline';
import defaultDb from '../app/database/database.js';
import { TransactionTracker, TRANSACTION_STATUSES } from '../app/core/injection/transaction-tracker.js';

const HELPER_PATH = path.resolve('helper/bin/VeoFlowHelper.exe');

function getClipboardText() {
  return execSync('powershell -NoProfile -NonInteractive -Sta -Command "Get-Clipboard"', { timeout: 8000 })
    .toString()
    .trim();
}

function setClipboardText(text) {
  const escaped = text.replace(/'/g, "''");
  execSync(`powershell -NoProfile -NonInteractive -Sta -Command "Set-Clipboard -Value '${escaped}'"`, { timeout: 8000 });
}

async function testLiveTextInjection() {
  console.log('====================================================');
  console.log(' PHASE 03: STRICT LIVE TEXT INJECTION & RECONCILIATION ');
  console.log('====================================================');

  // SQLite Database is initialized upon import
  const tracker = new TransactionTracker(100, defaultDb);

  // 1. Establish and verify baseline user clipboard
  const originalClipboardData = `PRE_EXISTING_CANARY_CLIPBOARD_${Date.now()}`;
  setClipboardText(originalClipboardData);
  const readBack = getClipboardText();
  assert.strictEqual(readBack, originalClipboardData, 'Initial clipboard setup must be verified');
  console.log('[1] Baseline clipboard established and verified:', readBack);

  const proc = spawn(HELPER_PATH, [], { stdio: ['pipe', 'pipe', 'pipe'] });
  const rl = readline.createInterface({ input: proc.stdout });

  function waitForResponse(reqId, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timeout waiting for helper response to ${reqId}`)), timeoutMs);
      const handler = (line) => {
        try {
          const msg = JSON.parse(line);
          if (msg.id === reqId) {
            rl.removeListener('line', handler);
            clearTimeout(timer);
            resolve(msg);
          }
        } catch {}
      };
      rl.on('line', handler);
    });
  }

  try {
    // 2. Wait for helper ready
    await new Promise((resolve) => {
      rl.once('line', (line) => resolve(JSON.parse(line)));
    });

    // 3. Query Active Foreground Window Context
    const ctxId = 'ctx_strict_1';
    const ctxPromise = waitForResponse(ctxId);
    proc.stdin.write(JSON.stringify({ id: ctxId, action: 'get_context' }) + '\n');
    const ctxResp = await ctxPromise;
    console.log('[2] Active Context Captured:', JSON.stringify(ctxResp.context));

    const targetHwnd = ctxResp.context?.hwnd;
    assert.ok(targetHwnd && targetHwnd !== '0x0', `Target HWND must be non-zero (got ${targetHwnd})`);

    // 4. Create Audit Transaction in SQLite ledger
    const multilineUnicodePayload = 'Line 1: VeoFlow Phase 03 Strict Test\nLine 2: "Quoted String" & Special: <>&%\nLine 3: 🚀 Multi-Language: नमस्ते & 日本語';
    const tx = tracker.createTransaction({
      text: multilineUnicodePayload,
      rawTranscript: 'line one veoflow phase zero three strict test line two quoted string',
      targetHwnd: targetHwnd,
      appName: ctxResp.context?.appName || 'desktop',
      strategy: 'auto'
    });

    assert.strictEqual(tx.status, TRANSACTION_STATUSES.PENDING);
    console.log('[3] SQLite Pending Transaction Created:', tx.id);

    // Verify initial SQLite record
    const initialSqliteTx = defaultDb.getTransaction(tx.id);
    assert.ok(initialSqliteTx, `Transaction ${tx.id} must exist in SQLite database`);
    assert.strictEqual(initialSqliteTx.status, 'pending', 'Initial SQLite status must be pending');

    // 5. Dispatch inject_text with target HWND, auto strategy, and unique transaction ID
    const injectId = 'inject_strict_1';
    const injectPromise = waitForResponse(injectId, 10000);
    proc.stdin.write(JSON.stringify({
      id: injectId,
      action: 'inject_text',
      text: multilineUnicodePayload,
      targetHwnd: targetHwnd,
      strategy: 'auto',
      transactionId: tx.id
    }) + '\n');

    const injectResp = await injectPromise;
    console.log('[4] Helper Injection Response:', JSON.stringify(injectResp));

    // STRICT RECONCILIATION ASSERTIONS:
    assert.strictEqual(injectResp.success, true, 'Helper injection must report success: true');
    assert.strictEqual(injectResp.targetHwnd, targetHwnd, 'Helper response target HWND must match requested context HWND');
    assert.strictEqual(injectResp.clipboardRestored, true, 'Helper must report clipboardRestored: true');
    assert.ok(
      ['verified', 'unverified'].includes(injectResp.status),
      `Helper status must be 'verified' or 'unverified', got '${injectResp.status}'`
    );
    assert.notStrictEqual(injectResp.status, 'inserted', 'Helper response status must NEVER be "inserted"');

    // 6. Update Tracker matching Helper Response
    let finalStatus = TRANSACTION_STATUSES.FAILED;
    if (injectResp.verified) {
      finalStatus = TRANSACTION_STATUSES.VERIFIED;
    } else if (injectResp.success) {
      finalStatus = TRANSACTION_STATUSES.UNVERIFIED;
    }

    tracker.updateTransaction(tx.id, {
      status: finalStatus,
      strategy: injectResp.strategy || 'clipboard_paste',
      verified: !!injectResp.verified,
      clipboardRestored: !!injectResp.clipboardRestored
    });

    // 7. Verify SQLite Database Ledger Reconciliation
    const finalSqliteTx = defaultDb.getTransaction(tx.id);
    console.log('[5] Final SQLite Ledger Record:', JSON.stringify(finalSqliteTx));

    assert.ok(finalSqliteTx, 'Final transaction record must exist in SQLite');
    assert.strictEqual(finalSqliteTx.status, finalStatus, `SQLite status must match helper status '${finalStatus}'`);
    assert.notStrictEqual(finalSqliteTx.status, 'inserted', 'SQLite status must NEVER be "inserted"');
    assert.strictEqual(finalSqliteTx.strategy, injectResp.strategy, 'SQLite strategy must match helper strategy');
    assert.strictEqual(finalSqliteTx.target_hwnd, targetHwnd, 'SQLite target_hwnd must match target HWND');

    // 8. Verify Clipboard Restoration
    const postClipboard = getClipboardText();
    assert.strictEqual(
      postClipboard,
      originalClipboardData,
      `Original clipboard must be restored. Expected '${originalClipboardData}', found '${postClipboard}'`
    );
    console.log('[6] Clipboard Restoration Verified 100%: original canary preserved');

    console.log('\n====================================================');
    console.log(' [PASS] STRICT INTEGRATION RECONCILIATION VERIFIED ');
    console.log('====================================================');
  } finally {
    // ALWAYS restore user's original clipboard in case of any failure
    try {
      setClipboardText(originalClipboardData);
    } catch {}

    // Clean up helper process
    try {
      proc.stdin.write(JSON.stringify({ id: 'exit', action: 'exit' }) + '\n');
      proc.kill();
    } catch {}
  }
}

testLiveTextInjection().catch((e) => {
  console.error('\n[FAIL] Strict integration test failed:', e);
  process.exit(1);
});
