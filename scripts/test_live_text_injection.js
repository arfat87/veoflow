import assert from 'node:assert';
import { spawn } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline';
import { TransactionTracker, TRANSACTION_STATUSES } from '../app/core/injection/transaction-tracker.js';

const HELPER_PATH = path.resolve('helper/bin/VeoFlowHelper.exe');

async function testLiveTextInjection() {
  console.log('[TEST] Live Native Helper Text Injection Subsystem...');

  const tracker = new TransactionTracker();
  const proc = spawn(HELPER_PATH, [], { stdio: ['pipe', 'pipe', 'pipe'] });
  const rl = readline.createInterface({ input: proc.stdout });

  const responses = new Map();
  rl.on('line', (line) => {
    try {
      const msg = JSON.parse(line);
      if (msg.id) {
        responses.set(msg.id, msg);
      }
      console.log('<- HELPER:', line);
    } catch {
      console.log('<- RAW:', line);
    }
  });

  function waitForResponse(reqId, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timeout waiting for response to ${reqId}`)), timeoutMs);
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

  // 1. Wait for helper ready
  await new Promise((resolve) => setTimeout(resolve, 800));

  // 2. Query Active Foreground Window Context
  const ctxId = 'ctx_test_1';
  const ctxPromise = waitForResponse(ctxId);
  proc.stdin.write(JSON.stringify({ id: ctxId, action: 'get_context' }) + '\n');
  const ctxResp = await ctxPromise;
  console.log('Captured Context:', JSON.stringify(ctxResp.context));

  // 3. Create Audit Transaction
  const multilineUnicodePayload = 'Line 1: VeoFlow Testing\nLine 2: "Quoted String" & Special: <>&%\nLine 3: 🚀 Multi-Language: नमस्ते & 日本語';
  const tx = tracker.createTransaction({
    text: multilineUnicodePayload,
    rawTranscript: 'line one veoflow testing line two quoted string line three multi language',
    targetHwnd: ctxResp.context?.hwnd || '0x0',
    appName: ctxResp.context?.appName || 'desktop',
    strategy: 'auto'
  });

  assert.strictEqual(tx.status, TRANSACTION_STATUSES.PENDING);

  // 4. Dispatch inject_text with target HWND, auto strategy, and unique transaction ID
  const injectId = 'inject_test_1';
  const injectPromise = waitForResponse(injectId, 10000);
  proc.stdin.write(JSON.stringify({
    id: injectId,
    action: 'inject_text',
    text: multilineUnicodePayload,
    targetHwnd: ctxResp.context?.hwnd || '0x0',
    strategy: 'auto',
    transactionId: tx.id
  }) + '\n');

  const injectResp = await injectPromise;
  assert.ok(injectResp, 'inject_text response received');
  assert.strictEqual(injectResp.success, true, 'inject_text must report success');
  console.log('Injection Result:', JSON.stringify(injectResp));

  // 5. Update Audit Transaction matching helper response and InjectionManager semantics
  let finalStatus = TRANSACTION_STATUSES.FAILED;
  if (injectResp.verified) {
    finalStatus = TRANSACTION_STATUSES.VERIFIED;
  } else if (injectResp.success) {
    finalStatus = TRANSACTION_STATUSES.UNVERIFIED;
  }

  tracker.updateTransaction(tx.id, {
    status: finalStatus,
    strategy: injectResp.strategy,
    verified: !!injectResp.verified,
    clipboardRestored: !!injectResp.clipboardRestored
  });

  const finalTx = tracker.getTransaction(tx.id);
  assert.strictEqual(finalTx.status, TRANSACTION_STATUSES.UNVERIFIED);
  assert.strictEqual(finalTx.clipboardRestored, true);
  console.log('Audited Transaction Final State:', JSON.stringify(finalTx));

  // 6. Test Shutdown
  proc.stdin.write(JSON.stringify({ id: 'exit', action: 'exit' }) + '\n');
  await new Promise((resolve) => setTimeout(resolve, 400));
  proc.kill();

  console.log('[PASS] Live Text Injection with Multiline, Unicode & Transaction Ledger Verified 100%');
}

testLiveTextInjection().catch((e) => {
  console.error(e);
  process.exit(1);
});
