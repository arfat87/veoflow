import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import EventEmitter from 'node:events';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import logger from '../shared/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class HelperClient extends EventEmitter {
  constructor() {
    super();
    this.process = null;
    this.pendingRequests = new Map();
    this.helperPath = path.resolve(__dirname, '../../helper/bin/VeoFlowHelper.exe');
    this.isReady = false;
    this.isStopped = false;
  }

  start() {
    this.isStopped = false;
    if (!fs.existsSync(this.helperPath)) {
      const err = new Error(`Helper executable not found at ${this.helperPath}`);
      logger.error('Helper binary missing:', err.message);
      this.emit('error', err);
      return;
    }

    logger.info(`Spawning native helper from ${this.helperPath}`);
    this.process = spawn(this.helperPath, [], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let buffer = '';

    this.process.stdout.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep unfinished trailing chunk

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const msg = JSON.parse(trimmed);
          this.handleMessage(msg);
        } catch (err) {
          logger.warn('Non-JSON stdout from helper:', trimmed);
        }
      }
    });

    this.process.stderr.on('data', (data) => {
      logger.warn('Helper stderr:', data.toString());
    });

    this.process.on('close', (code) => {
      logger.warn(`Helper process exited with code ${code}`);
      this.isReady = false;
      this.emit('closed', code);

      for (const [id, req] of this.pendingRequests.entries()) {
        this.pendingRequests.delete(id);
        req.reject(new Error('Helper process closed'));
      }

      // Auto-restart after 2 seconds only if not stopped
      if (!this.isStopped) {
        setTimeout(() => {
          if (!this.isStopped && (!this.process || this.process.killed)) {
            this.start();
          }
        }, 2000);
      }
    });

    this.process.on('error', (err) => {
      logger.error('Helper process error:', err.message);
      this.emit('error', err);
    });
  }

  handleMessage(msg) {
    if (msg.type === 'status' && msg.status === 'ready') {
      this.isReady = true;
      logger.info(`Helper is ready (PID: ${msg.pid})`);
      this.emit('ready', msg);
    } else if (msg.type === 'event') {
      if (msg.event === 'hotkey_down') {
        this.emit('hotkey-down', msg);
      } else if (msg.event === 'hotkey_up') {
        this.emit('hotkey-up', msg);
      } else if (msg.event === 'cancel') {
        logger.info(`Helper hotkey canceled: ${msg.reason || 'escape'}`);
        this.emit('hotkey-cancel', msg);
      }
    } else if (msg.type === 'log') {
      logger.info(`[HelperNative] ${msg.message}`);
      this.emit('log', msg);
    } else if (msg.type === 'response' && msg.id) {
      const resolver = this.pendingRequests.get(msg.id);
      if (resolver) {
        this.pendingRequests.delete(msg.id);
        resolver.resolve(msg);
      }
    } else if (msg.type === 'error' && msg.id) {
      const resolver = this.pendingRequests.get(msg.id);
      if (resolver) {
        this.pendingRequests.delete(msg.id);
        resolver.reject(new Error(msg.error || msg.message || 'Unknown helper error'));
      }
    }
  }

  sendCommand(action, payload = {}) {
    return new Promise((resolve, reject) => {
      if (!this.process || !this.process.stdin.writable) {
        return reject(new Error('Helper process is not running'));
      }

      const id = crypto.randomUUID();
      const msg = { action, id, ...payload };

      const timeout = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Command '${action}' timed out`));
        }
      }, 5000);

      this.pendingRequests.set(id, {
        resolve: (data) => {
          clearTimeout(timeout);
          resolve(data);
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        }
      });

      this.process.stdin.write(JSON.stringify(msg) + '\n');
    });
  }

  async getContext() {
    try {
      const res = await this.sendCommand('get_context');
      return res.context || {
        appName: 'Unknown',
        windowTitle: '',
        url: '',
        textbox: { contents: '', beforeText: '', selectedText: '', afterText: '' }
      };
    } catch (err) {
      logger.error('getContext error:', err.message);
      return {
        appName: 'Unknown',
        windowTitle: '',
        url: '',
        textbox: { contents: '', beforeText: '', selectedText: '', afterText: '' }
      };
    }
  }

  async pasteText(text) {
    if (!text) return false;
    const res = await this.injectText(text);
    return res.success;
  }

  async injectText(text, options = {}) {
    if (!text) {
      return { success: false, status: 'failed', error: 'Empty text payload' };
    }
    try {
      const payload = {
        text,
        targetHwnd: options.targetHwnd || '',
        strategy: options.strategy || 'auto',
        transactionId: options.transactionId || ''
      };
      const res = await this.sendCommand('inject_text', payload);
      return {
        success: !!res.success,
        status: res.status || (res.success ? 'inserted' : 'failed'),
        strategy: res.strategy || 'clipboard_paste',
        verified: !!res.verified,
        targetHwnd: res.targetHwnd || options.targetHwnd || '',
        clipboardRestored: !!res.clipboardRestored,
        transactionId: res.transactionId || options.transactionId || '',
        error: res.error || null
      };
    } catch (err) {
      logger.error('injectText error:', err.message);
      return {
        success: false,
        status: 'failed',
        error: err.message,
        strategy: options.strategy || 'auto',
        verified: false,
        clipboardRestored: false,
        transactionId: options.transactionId || ''
      };
    }
  }

  async setHotkey(modifiers, key) {
    try {
      return await this.sendCommand('set_hotkey', { modifiers, key });
    } catch (err) {
      logger.error('setHotkey error:', err.message);
      return null;
    }
  }

  stop() {
    this.isStopped = true;
    for (const [id, req] of this.pendingRequests.entries()) {
      this.pendingRequests.delete(id);
      req.resolve({ type: 'response', id, status: 'stopped' });
    }

    if (this.process) {
      try {
        if (this.process.stdin.writable) {
          this.process.stdin.write(JSON.stringify({ action: 'exit' }) + '\n');
        }
        this.process.kill();
      } catch {}
      this.process = null;
    }
  }
}

export const helperClient = new HelperClient();
export default helperClient;

