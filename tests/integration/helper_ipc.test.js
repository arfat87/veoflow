import { describe, it, expect, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline';

const HELPER_EXE = path.resolve(import.meta.dirname, '../../helper/bin/VeoFlowHelper.exe');

describe('VeoFlow Native Helper IPC Integration', () => {
  let helperProcess = null;
  let rl = null;

  function spawnHelper() {
    const proc = spawn(HELPER_EXE, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    });
    const reader = readline.createInterface({ input: proc.stdout });
    return { proc, reader };
  }

  afterAll(() => {
    if (helperProcess && !helperProcess.killed) {
      try {
        helperProcess.stdin.end();
        helperProcess.kill();
      } catch {}
    }
  });

  it('starts and emits ready event with PID and version', async () => {
    const { proc, reader } = spawnHelper();
    helperProcess = proc;
    rl = reader;

    const readyEvent = await new Promise((resolve) => {
      rl.once('line', (line) => {
        resolve(JSON.parse(line));
      });
    });

    expect(readyEvent.type).toBe('status');
    expect(readyEvent.status).toBe('ready');
    expect(readyEvent.version).toBe('1.0.0');
    expect(typeof readyEvent.pid).toBe('number');
    expect(readyEvent.pid).toBeGreaterThan(0);
  });

  it('responds to ping with matching request ID and pong status', async () => {
    const reqId = 'test-ping-101';
    const pingPromise = new Promise((resolve) => {
      const handler = (line) => {
        const msg = JSON.parse(line);
        if (msg.id === reqId) {
          rl.removeListener('line', handler);
          resolve(msg);
        }
      };
      rl.on('line', handler);
    });

    helperProcess.stdin.write(JSON.stringify({ id: reqId, action: 'ping' }) + '\n');
    const response = await pingPromise;

    expect(response.type).toBe('response');
    expect(response.id).toBe(reqId);
    expect(response.status).toBe('pong');
    expect(response.version).toBe('1.0.0');
  });

  it('responds to get_context with active window details and bounded textbox context', async () => {
    const reqId = 'test-ctx-102';
    const ctxPromise = new Promise((resolve) => {
      const handler = (line) => {
        const msg = JSON.parse(line);
        if (msg.id === reqId) {
          rl.removeListener('line', handler);
          resolve(msg);
        }
      };
      rl.on('line', handler);
    });

    helperProcess.stdin.write(JSON.stringify({ id: reqId, action: 'get_context' }) + '\n');
    const response = await ctxPromise;

    expect(response.type).toBe('response');
    expect(response.id).toBe(reqId);
    expect(response.context).toBeDefined();
    expect(typeof response.context.hwnd).toBe('string');
    expect(typeof response.context.appName).toBe('string');
    expect(response.context.textbox).toBeDefined();
  });

  it('responds to set_hotkey by updating active hotkey configuration', async () => {
    const reqId = 'test-hotkey-103';
    const hotkeyPromise = new Promise((resolve) => {
      const handler = (line) => {
        const msg = JSON.parse(line);
        if (msg.id === reqId) {
          rl.removeListener('line', handler);
          resolve(msg);
        }
      };
      rl.on('line', handler);
    });

    helperProcess.stdin.write(JSON.stringify({
      id: reqId,
      action: 'set_hotkey',
      modifiers: 'Ctrl,Shift',
      key: 'Space'
    }) + '\n');
    const response = await hotkeyPromise;

    expect(response.type).toBe('response');
    expect(response.id).toBe(reqId);
    expect(response.status).toBe('updated');
  });

  it('returns structured error for unknown commands', async () => {
    const reqId = 'test-unknown-104';
    const errorPromise = new Promise((resolve) => {
      const handler = (line) => {
        const msg = JSON.parse(line);
        if (msg.id === reqId) {
          rl.removeListener('line', handler);
          resolve(msg);
        }
      };
      rl.on('line', handler);
    });

    helperProcess.stdin.write(JSON.stringify({ id: reqId, action: 'invalid_action_foo' }) + '\n');
    const response = await errorPromise;

    expect(response.type).toBe('error');
    expect(response.id).toBe(reqId);
    expect(response.message).toContain('Method not found');
  });

  it('exits cleanly upon exit command', async () => {
    const reqId = 'test-exit-105';
    const exitResponsePromise = new Promise((resolve) => {
      const handler = (line) => {
        const msg = JSON.parse(line);
        if (msg.id === reqId) {
          rl.removeListener('line', handler);
          resolve(msg);
        }
      };
      rl.on('line', handler);
    });

    const exitCodePromise = new Promise((resolve) => {
      helperProcess.on('exit', (code) => resolve(code));
    });

    helperProcess.stdin.write(JSON.stringify({ id: reqId, action: 'exit' }) + '\n');
    const response = await exitResponsePromise;
    const code = await exitCodePromise;

    expect(response.status).toBe('exiting');
    expect(code === 0 || code === null).toBe(true);
  });

  it('automatically shuts down when parent stdin disconnects', async () => {
    const { proc, reader } = spawnHelper();
    await new Promise((resolve) => {
      reader.once('line', () => resolve());
    });

    const exitPromise = new Promise((resolve) => {
      proc.on('exit', (code) => resolve(code));
    });

    // Close stdin (simulating Electron crashing or quitting)
    proc.stdin.end();
    const code = await exitPromise;
    expect(code === 0 || code === null).toBe(true);
  }, 10000);
});

