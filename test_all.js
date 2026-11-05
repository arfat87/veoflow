import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { DatabaseManager } from './app/database/database.js';
import diffPaster from './app/core/diffPaster.js';
import { AIService } from './app/core/aiService.js';
import helperClient from './app/core/helperClient.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('========================================');
console.log('      VeoFlow Comprehensive Test Suite  ');
console.log('========================================\n');

async function runTests() {
  let passed = 0;
  let failed = 0;

  function record(title, fn) {
    return async () => {
      process.stdout.write(`[TEST] ${title} ... `);
      try {
        await fn();
        console.log('PASSED \x1b[32m✓\x1b[0m');
        passed++;
      } catch (err) {
        console.log(`FAILED \x1b[31m✗\x1b[0m: ${err.message}`);
        console.error(err);
        failed++;
      }
    };
  }

  // 1. Verify Helper Binary exists and is executable
  await record('Helper Binary Exists', () => {
    const helperPath = path.resolve(__dirname, 'helper/bin/VeoFlowHelper.exe');
    assert.strictEqual(fs.existsSync(helperPath), true, `Helper binary not found at ${helperPath}`);
  })();

  // 2. Test Helper IPC Communication directly
  await record('Native Helper IPC (spawn, ping, get_context, set_hotkey)', async () => {
    const helperPath = path.resolve(__dirname, 'helper/bin/VeoFlowHelper.exe');
    const child = spawn(helperPath, [], { stdio: ['pipe', 'pipe', 'pipe'] });

    let readyReceived = false;
    let pongReceived = false;
    let contextReceived = false;
    let hotkeyReceived = false;

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error('Helper IPC timeout after 8s'));
      }, 8000);

      let buffer = '';
      child.stdout.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const msg = JSON.parse(trimmed);
            if (msg.type === 'status' && msg.status === 'ready') {
              readyReceived = true;
              child.stdin.write(JSON.stringify({ action: 'ping', id: 'ping-1' }) + '\n');
            } else if (msg.type === 'response' && msg.id === 'ping-1') {
              pongReceived = (msg.status === 'pong');
              child.stdin.write(JSON.stringify({ action: 'get_context', id: 'ctx-1' }) + '\n');
            } else if (msg.type === 'response' && msg.id === 'ctx-1') {
              contextReceived = !!(msg.context && typeof msg.context.appName === 'string');
              child.stdin.write(JSON.stringify({ action: 'set_hotkey', id: 'hk-1', modifiers: 'ctrl+alt', key: 'space' }) + '\n');
            } else if (msg.type === 'response' && msg.id === 'hk-1') {
              hotkeyReceived = (msg.status === 'updated');
              child.stdin.write(JSON.stringify({ action: 'exit' }) + '\n');
              clearTimeout(timeout);
              child.kill();
              resolve();
            }
          } catch (e) {
            // Ignore non-json
          }
        }
      });

      child.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    assert.strictEqual(readyReceived, true, 'Helper ready message not received');
    assert.strictEqual(pongReceived, true, 'Pong response not received');
    assert.strictEqual(contextReceived, true, 'Active window context not received');
    assert.strictEqual(hotkeyReceived, true, 'Set hotkey response not received');
  })();

  // 3. Test Database Manager with Isolated Temp File (Zero Pollution)
  const tempTestDbPath = path.join(os.tmpdir(), `veoflow_test_${Date.now()}.sqlite`);
  let testDb;

  await record('Database Operations in Isolated Sandbox (Settings, History, Dictionary, Snippets)', async () => {
    testDb = new DatabaseManager(tempTestDbPath);

    // Settings
    testDb.setSetting('test_key', 'test_value_123');
    assert.strictEqual(testDb.getSetting('test_key'), 'test_value_123');

    // Snippets
    const testShortcut = 'ttest';
    const testSnippetText = 'Hello from automated test!';
    const snippetId = testDb.addSnippet(testShortcut, testSnippetText);
    assert.ok(typeof snippetId === 'number', `Snippet ID should be a number, got: ${typeof snippetId}`);
    let snippets = testDb.getSnippets();
    const foundSnippet = snippets.find(s => s.id === snippetId);
    assert.ok(foundSnippet, 'Added snippet not found in getSnippets()');
    assert.strictEqual(foundSnippet.expanded_text, testSnippetText);
    testDb.deleteSnippet(snippetId);
    snippets = testDb.getSnippets();
    assert.ok(!snippets.find(s => s.id === snippetId), 'Snippet should be deleted');

    // Dictionary
    const testTrigger = 'fooBarTest';
    const testRep = '$100 USD special & replacement';
    const dictId = testDb.addDictionaryWord(testTrigger, testRep);
    assert.ok(typeof dictId === 'number', `Dictionary ID should be a number, got: ${typeof dictId}`);
    let dict = testDb.getDictionary();
    const foundDict = dict.find(d => d.id === dictId);
    assert.ok(foundDict, 'Added dictionary word not found');
    assert.strictEqual(foundDict.replacement, testRep);
    testDb.deleteDictionaryWord(dictId);
    dict = testDb.getDictionary();
    assert.ok(!dict.find(d => d.id === dictId), 'Dictionary word should be deleted');

    // History
    const historyId = testDb.addHistory({
      appName: 'TestApp.exe',
      windowTitle: 'Test Window',
      url: 'https://test.com',
      rawAsr: 'hello world',
      formattedText: 'Hello World.',
      latencyMs: 120,
      status: 'success'
    });
    assert.ok(historyId, 'History ID should be returned');
    const history = testDb.getHistory();
    const lastHistory = history[0];
    assert.strictEqual(lastHistory.app_name, 'TestApp.exe');
    assert.strictEqual(lastHistory.raw_asr, 'hello world');
    assert.strictEqual(lastHistory.formatted_text, 'Hello World.');
  })();

  // 4. Test Diff Match Patch & Paster logic
  await record('Diff Paster (calculateDiff and text operations)', () => {
    diffPaster.reset();
    assert.strictEqual(diffPaster.lastPastedText, '');

    diffPaster.lastPastedText = 'Hello ';
    const diffs = diffPaster.calculateDiff('Hello World');
    assert.ok(Array.isArray(diffs), 'calculateDiff should return an array');
    assert.strictEqual(diffs[0][0], 0);
    assert.strictEqual(diffs[0][1], 'Hello ');
    assert.strictEqual(diffs[1][0], 1);
    assert.strictEqual(diffs[1][1], 'World');
    diffPaster.reset();
  })();

  // 5. Test AI Service logic (Prompt generation, snippets with punctuation, safe dictionary)
  await record('AIService (Prompt generation, Punctuation-normalized snippets, Safe dictionary)', async () => {
    const customAi = new AIService(testDb);

    // Test dictionary substitution with replacement string containing $1 and special chars
    const dictId = testDb.addDictionaryWord('priceTrigger', '$100.00');
    const replaced = customAi.applyDictionary('the total is priceTrigger today');
    assert.strictEqual(replaced, 'the total is $100.00 today');
    testDb.deleteDictionaryWord(dictId);

    // Test snippet expansion even when utterance has trailing punctuation or quotes from ASR
    const snipId = testDb.addSnippet('testemail', 'support@veoflow.ai');
    assert.strictEqual(customAi.checkSnippets('testemail'), 'support@veoflow.ai');
    assert.strictEqual(customAi.checkSnippets('Testemail.'), 'support@veoflow.ai');
    assert.strictEqual(customAi.checkSnippets('"testemail"'), 'support@veoflow.ai');
    testDb.deleteSnippet(snipId);

    // Test system prompt generation for various contexts
    const promptIDE = customAi.buildFormattingSystemPrompt({ appName: 'Code.exe', windowTitle: 'index.js - VeoFlow' }, 'contextual');
    assert.ok(promptIDE.includes('Code.exe') || promptIDE.includes('code_editor'), 'Prompt should include IDE context');

    const promptSlack = customAi.buildFormattingSystemPrompt({ appName: 'Slack.exe', windowTitle: 'general | Slack' }, 'contextual');
    assert.ok(promptSlack.includes('Slack.exe') || promptSlack.includes('chat'), 'Prompt should include Slack context');
  })();

  // 6. Test Helper Text Injection with Multi-line, Quotes, and Newlines
  await record('Helper Text Injection with quotes, newlines, and unicode', async () => {
    helperClient.start();

    // Wait for helper to be ready
    await new Promise((resolve) => {
      if (helperClient.isReady) return resolve();
      helperClient.once('ready', resolve);
    });

    const ctx = await helperClient.getContext();
    assert.ok(ctx && typeof ctx.appName === 'string', 'Helper getContext should return context object');

    // Test pasteText with quotes and multi-line content (verifies robust JSON parsing in helper)
    const complexText = 'Line 1: "quoted"\nLine 2: - Item A\nLine 3: 🚀 Unicode';
    const pasteResult = await helperClient.pasteText(complexText);
    assert.strictEqual(pasteResult, true, 'Helper pasteText should report success for complex text');

    helperClient.stop();
  })();

  // 7. Verify Files & HTML/CSS/JS Assets
  await record('Frontend & Overlay Assets Integrity', () => {
    const files = [
      'app/renderer/hud/overlay.html',
      'app/renderer/hud/overlay.css',
      'app/renderer/hud/overlay.js',
      'app/renderer/settings/settings.html',
      'app/renderer/settings/settings.css',
      'app/renderer/settings/settings.js',
      'app/preload/index.cjs',
      'assets/icon.png',
      'build/icon.ico',
      'build/icon.png'
    ];

    for (const f of files) {
      const fullPath = path.resolve(__dirname, f);
      assert.strictEqual(fs.existsSync(fullPath), true, `Missing required file: ${f}`);
      const stats = fs.statSync(fullPath);
      assert.ok(stats.size > 0, `File is empty: ${f}`);
    }
  })();

  // Clean up sandbox temp file
  try {
    if (testDb) testDb.close();
    if (fs.existsSync(tempTestDbPath)) fs.unlinkSync(tempTestDbPath);
  } catch {}

  console.log('\n----------------------------------------');
  console.log(`Test Results: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test suite uncaught error:', err);
  process.exit(1);
});
