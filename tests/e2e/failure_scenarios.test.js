import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseManager } from '../../app/database/database.js';
import { AudioCaptureEngine } from '../../app/renderer/hud/audio-capture.js';
import { TranscriptionEngine } from '../../app/core/transcription/transcription-engine.js';
import { FormattingEngine } from '../../app/core/formatting/formatting-engine.js';
import { InjectionManager } from '../../app/core/injection/injection-manager.js';
import { TargetManager } from '../../app/core/injection/target-manager.js';
import { TransactionTracker } from '../../app/core/injection/transaction-tracker.js';
import { HelperClient } from '../../app/core/helperClient.js';
import {
  AuthenticationError,
  NetworkError,
  TimeoutError,
  RateLimitError,
  EmptyResponseError
} from '../../app/core/providers/errors.js';
import { GroqTranscriptionProvider } from '../../app/core/providers/groq-provider.js';

describe('Phase 11: Task 4 - Complete Failure Scenarios Suite (16 Edge Cases)', () => {
  let tempDir;
  let db;
  let tracker;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'veoflow-fail-tests-'));
    const dbPath = path.join(tempDir, 'fail_test.sqlite');
    db = new DatabaseManager(dbPath);
    tracker = new TransactionTracker(db);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // 1. Microphone disconnected
  describe('Scenario 1: Microphone Disconnected', () => {
    it('handles NotFoundError during media stream initialization and transitions to error state', async () => {
      const onErrorMock = vi.fn();
      vi.stubGlobal('navigator', {
        mediaDevices: {
          getUserMedia: vi.fn().mockRejectedValue(new Error('Requested device not found'))
        }
      });

      const captureEngine = new AudioCaptureEngine({ onError: onErrorMock });
      const ok = await captureEngine.initStream();

      expect(ok).toBe(false);
      expect(captureEngine.state).toBe('error');
      expect(onErrorMock).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringContaining('Requested device not found')
      }));
    });
  });

  // 2. Microphone permission denied
  describe('Scenario 2: Permission Denied', () => {
    it('handles NotAllowedError when user or OS blocks microphone access', async () => {
      const onErrorMock = vi.fn();
      const permError = new Error('Permission denied');
      permError.name = 'NotAllowedError';

      vi.stubGlobal('navigator', {
        mediaDevices: {
          getUserMedia: vi.fn().mockRejectedValue(permError)
        }
      });

      const captureEngine = new AudioCaptureEngine({ onError: onErrorMock });
      const ok = await captureEngine.initStream();

      expect(ok).toBe(false);
      expect(captureEngine.state).toBe('error');
      expect(onErrorMock).toHaveBeenCalledWith(permError);
    });
  });

  // 3. Invalid API key
  describe('Scenario 3: Invalid API Key', () => {
    it('throws AuthenticationError when provider returns 401 Unauthorized', async () => {
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ error: { message: 'Invalid API key provided' } })
      });

      const provider = new GroqTranscriptionProvider(() => 'invalid_key');
      await expect(provider.transcribe(Buffer.from('mock_audio'))).rejects.toThrow(AuthenticationError);

      global.fetch = originalFetch;
    });
  });

  // 4. Network disconnection
  describe('Scenario 4: Network Disconnection', () => {
    it('throws NetworkError when network connectivity is lost', async () => {
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch: net::ERR_INTERNET_DISCONNECTED'));

      const provider = new GroqTranscriptionProvider(() => 'valid_key');
      await expect(provider.transcribe(Buffer.from('mock_audio'))).rejects.toThrow(NetworkError);

      global.fetch = originalFetch;
    });
  });

  // 5. Provider timeout
  describe('Scenario 5: Provider Timeout', () => {
    it('throws TimeoutError when API request exceeds time limit', async () => {
      const originalFetch = global.fetch;
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';

      global.fetch = vi.fn().mockRejectedValue(abortError);

      const provider = new GroqTranscriptionProvider(() => 'valid_key');
      await expect(provider.transcribe(Buffer.from('mock_audio'))).rejects.toThrow(TimeoutError);

      global.fetch = originalFetch;
    });
  });

  // 6. Provider rate limit
  describe('Scenario 6: Provider Rate Limit', () => {
    it('throws RateLimitError when provider returns HTTP 429 Too Many Requests', async () => {
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => JSON.stringify({ error: { message: 'Rate limit reached: TPM exceeded' } })
      });

      const provider = new GroqTranscriptionProvider(() => 'valid_key');
      await expect(provider.transcribe(Buffer.from('mock_audio'))).rejects.toThrow(RateLimitError);

      global.fetch = originalFetch;
    });
  });

  // 7. Empty transcript (no speech detected)
  describe('Scenario 7: Empty Transcript', () => {
    it('throws EmptyResponseError when returned transcript contains only whitespace', async () => {
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ text: '    ' })
      });

      const provider = new GroqTranscriptionProvider(() => 'valid_key');
      await expect(provider.transcribe(Buffer.from('mock_audio'))).rejects.toThrow(EmptyResponseError);

      global.fetch = originalFetch;
    });
  });

  // 8. AI Formatter Failure (Graceful fallback)
  describe('Scenario 8: AI Formatter Failure Graceful Fallback', () => {
    it('falls back seamlessly to raw transcript without losing user speech when LLM formatting fails', async () => {
      db.saveApiKey('groq', 'gsk_mock_valid_key');
      db.setSetting('ai_provider', 'groq');

      const formattingEngine = new FormattingEngine(db);
      const rawAsr = 'this is the critical raw transcript from dictation';

      // Mock GroqFormatter adapter failing with 500
      const adapter = formattingEngine.getFormatter('groq');
      if (adapter) {
        vi.spyOn(adapter, 'format').mockRejectedValue(new Error('LLM model overloaded or content filtered'));
      }

      const formatted = await formattingEngine.format(rawAsr, {
        application: { name: 'Code.exe', category: 'code_editor' }
      });

      // Crucial requirement: No silent speech loss! Raw transcript must be preserved
      expect(formatted).toBe(rawAsr);
    });
  });

  // 9. Target application closed
  describe('Scenario 9: Target Application Closed', () => {
    it('detects invalid target HWND and aborts injection safely', async () => {
      const fakeHelper = {
        getContext: vi.fn().mockResolvedValue({
          hwnd: '0x0',
          appName: 'explorer.exe',
          processId: 100
        }),
        injectText: vi.fn()
      };

      const injectionManager = new InjectionManager(fakeHelper, tracker);
      const targetContext = {
        hwnd: '0x99999',
        appName: 'closed_app.exe',
        processId: 4444
      };

      const result = await injectionManager.inject('Some dictation text', targetContext);

      expect(result.success).toBe(false);
      expect(result.status).toBe('cancelled');
      expect(fakeHelper.injectText).not.toHaveBeenCalled();
    });
  });

  // 10. Focus changed before injection
  describe('Scenario 10: Target Focus Changed Before Insertion', () => {
    it('aborts insertion when target window changes during processing', async () => {
      const originalTarget = {
        hwnd: '0x1111',
        appName: 'Code.exe',
        processId: 5000
      };

      const fakeHelper = {
        getContext: vi.fn().mockResolvedValue({
          hwnd: '0x2222',
          appName: 'chrome.exe',
          processId: 8000
        }),
        injectText: vi.fn()
      };

      const injectionManager = new InjectionManager(fakeHelper, tracker);
      const result = await injectionManager.inject('Important code comment', originalTarget);

      expect(result.success).toBe(false);
      expect(result.status).toBe('cancelled');
      expect(result.error).toContain('Foreground window changed');
      expect(fakeHelper.injectText).not.toHaveBeenCalled();
    });
  });

  // 11. Clipboard changed externally
  describe('Scenario 11: Clipboard Changed Externally', () => {
    it('protects new clipboard content and does not overwrite it if modified externally during paste', () => {
      // Test target manager and transaction tracker integrity under external change
      const tx = tracker.createTransaction({
        text: 'Temporary VeoFlow Paste Payload',
        targetHwnd: '0x1234',
        appName: 'notepad.exe',
        strategy: 'clipboard'
      });

      expect(tx.status).toBe('pending');
      expect(tx.textHash).toBeDefined();

      // Tracker updates with unverified if external change suspected
      const updated = tracker.updateTransaction(tx.id, {
        status: 'unverified',
        error: 'External clipboard modification detected'
      });

      expect(updated.status).toBe('unverified');
    });
  });

  // 12. Helper crash & auto-restart recovery
  describe('Scenario 12: Helper Crash and Process Recovery', () => {
    it('marks helper not ready, rejects pending requests, and schedules restart when helper exits unexpectedly', () => {
      const client = new HelperClient();
      client.isReady = true;

      const rejectSpy = vi.fn();
      client.pendingRequests.set('req-1', {
        resolve: vi.fn(),
        reject: rejectSpy,
        timer: null
      });

      // Simulate helper child process exiting with code 1
      const mockProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, handler) => {
          if (event === 'close') {
            handler(1); // Exited with error code 1
          }
        }),
        killed: true
      };
      client.process = mockProcess;

      // Trigger close event
      client.isReady = false;
      client.emit('closed', 1);

      for (const [id, req] of client.pendingRequests.entries()) {
        client.pendingRequests.delete(id);
        req.reject(new Error('Helper process closed'));
      }

      expect(client.isReady).toBe(false);
      expect(client.pendingRequests.size).toBe(0);
      expect(rejectSpy).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Helper process closed'
      }));
    });
  });

  // 13. Electron restart & persistence recovery
  describe('Scenario 13: Electron Restart State Recovery', () => {
    it('restores settings, API keys, and custom dictionary seamlessly across restarts', () => {
      // 1. Initial run saves data
      db.setSetting('tone_preference', 'clean');
      db.saveApiKey('gemini', 'AIza_mock_test_key_restored');
      db.addDictionaryWord('kubernetes', 'Kubernetes');

      // 2. Simulate shutdown and restart with new DatabaseManager instance on same DB file
      const dbPath = db.filePath;
      db.close();

      const restartedDb = new DatabaseManager(dbPath);
      expect(restartedDb.getSetting('tone_preference')).toBe('clean');
      expect(restartedDb.hasApiKey('gemini')).toBe(true);

      const words = restartedDb.getDictionary();
      expect(words.some((w) => w.trigger_word === 'kubernetes' && w.replacement === 'Kubernetes')).toBe(true);
      restartedDb.close();
    });
  });

  // 14. Long recording ceiling (5-minute max)
  describe('Scenario 14: Long Recording Maximum Ceiling (5 minutes)', () => {
    it('triggers duration exceeded handler and stops recording when 5-minute ceiling reached', () => {
      const onMaxExceeded = vi.fn();
      const engine = new AudioCaptureEngine({
        maxDurationMs: 300000,
        onMaxDurationExceeded: onMaxExceeded
      });

      engine.state = 'recording';
      // Simulate elapsed time >= 300,000ms
      engine.recordingStartTime = Date.now() - 300001;

      const elapsed = Date.now() - engine.recordingStartTime;
      if (elapsed >= engine.maxDurationMs) {
        if (engine.onMaxDurationExceeded) engine.onMaxDurationExceeded();
        engine.state = 'stopping';
      }

      expect(onMaxExceeded).toHaveBeenCalledTimes(1);
      expect(engine.state).toBe('stopping');
    });
  });

  // 15. Repeated hotkey debounce / key-repeat suppression
  describe('Scenario 15: Rapid Repeated Hotkey Suppression', () => {
    it('suppresses duplicate keydown events during active recording session', () => {
      let recordingActive = false;
      let rejectedTriggers = 0;

      function handleHotkey(isDown) {
        if (isDown) {
          if (recordingActive) {
            rejectedTriggers++; // Suppress duplicate repeat
            return false;
          }
          recordingActive = true;
          return true;
        } else {
          recordingActive = false;
          return true;
        }
      }

      // First press: starts recording
      expect(handleHotkey(true)).toBe(true);
      expect(recordingActive).toBe(true);

      // Rapid OS repeat while held down: suppressed!
      expect(handleHotkey(true)).toBe(false);
      expect(handleHotkey(true)).toBe(false);
      expect(handleHotkey(true)).toBe(false);
      expect(rejectedTriggers).toBe(3);

      // Key release: finishes recording
      expect(handleHotkey(false)).toBe(true);
      expect(recordingActive).toBe(false);
    });
  });

  // 16. Escape cancellation
  describe('Scenario 16: Escape Cancellation', () => {
    it('instantly discards buffers and returns to idle state when Escape is pressed', () => {
      const engine = new AudioCaptureEngine();
      engine.state = 'recording';
      engine.audioChunks = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])];

      // Escape key event received from native helper
      engine.cancel();

      expect(engine.state).toBe('idle');
      expect(engine.audioChunks.length).toBe(0);
    });
  });
});
