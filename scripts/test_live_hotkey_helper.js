import { spawn } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline';

const HELPER_PATH = path.resolve('helper/bin/VeoFlowHelper.exe');

async function testHelperHotkey() {
  console.log('[TEST] Launching VeoFlowHelper for Hotkey Validation...');
  const proc = spawn(HELPER_PATH, [], { stdio: ['pipe', 'pipe', 'pipe'] });
  const rl = readline.createInterface({ input: proc.stdout });

  const messages = [];
  rl.on('line', (line) => {
    try {
      const parsed = JSON.parse(line);
      messages.push(parsed);
      console.log('<- HELPER:', JSON.stringify(parsed));
    } catch {
      console.log('<- RAW:', line);
    }
  });

  // Wait for ready
  await new Promise((resolve) => setTimeout(resolve, 800));

  // Send set_hotkey
  console.log('-> SEND: set_hotkey Ctrl+Alt+Space');
  proc.stdin.write(JSON.stringify({
    id: 'req_hk_1',
    action: 'set_hotkey',
    modifiers: 'ctrl+alt',
    key: 'space'
  }) + '\n');

  await new Promise((resolve) => setTimeout(resolve, 600));

  // Send ping
  console.log('-> SEND: ping');
  proc.stdin.write(JSON.stringify({
    id: 'req_ping_1',
    action: 'ping'
  }) + '\n');

  await new Promise((resolve) => setTimeout(resolve, 600));

  // Exit
  proc.stdin.write(JSON.stringify({ id: 'exit', action: 'exit' }) + '\n');
  await new Promise((resolve) => setTimeout(resolve, 500));
  proc.kill();

  const ready = messages.find(m => m.type === 'status' && m.status === 'ready');
  const hkResponse = messages.find(m => m.id === 'req_hk_1');
  const pingResponse = messages.find(m => m.id === 'req_ping_1');

  console.log('\n--- VERIFICATION ---');
  console.log('Ready Received:', !!ready, 'PID:', ready?.pid);
  console.log('Hotkey Updated:', hkResponse?.status === 'updated');
  console.log('Pong Received:', pingResponse?.status === 'pong');

  if (ready && hkResponse?.status === 'updated' && pingResponse?.status === 'pong') {
    console.log('[PASS] Helper Hotkey Subsystem Verified Cleanly');
    process.exit(0);
  } else {
    console.error('[FAIL] Missing responses');
    process.exit(1);
  }
}

testHelperHotkey().catch(e => {
  console.error(e);
  process.exit(1);
});

