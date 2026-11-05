import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseManager } from '../../app/database/database.js';
import { AppClassifier } from '../../app/core/context/app-classifier.js';
import { PromptEngine } from '../../app/core/formatting/prompt-engine.js';
import { InjectionManager } from '../../app/core/injection/injection-manager.js';
import { TransactionTracker } from '../../app/core/injection/transaction-tracker.js';
import { APP_CATEGORIES } from '../../app/shared/constants.js';

describe('Phase 11: Task 3 - Application Compatibility Matrix', () => {
  let tempDir;
  let db;
  let tracker;
  let classifier;
  let injectionManager;
  let fakeHelper;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'veoflow-compat-test-'));
    const dbPath = path.join(tempDir, 'compat.sqlite');
    db = new DatabaseManager(dbPath);
    tracker = new TransactionTracker(db);

    fakeHelper = {
      currentHwnd: '0x12345',
      currentApp: 'notepad.exe',
      getContext: vi.fn(async () => ({
        hwnd: fakeHelper.currentHwnd,
        appName: fakeHelper.currentApp,
        processId: 1234,
        windowTitle: 'Untitled'
      })),
      injectText: vi.fn(async (text, opts) => ({
        success: true,
        status: 'verified',
        verified: true,
        method: opts?.strategy === 'clipboard' ? 'clipboard' : 'uia_value',
        transactionId: opts?.transactionId
      }))
    };

    classifier = new AppClassifier(() => db.getAppRules());
    injectionManager = new InjectionManager(fakeHelper, tracker);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup error
    }
    vi.restoreAllMocks();
  });

  const TARGET_APPS = [
    {
      name: 'Windows Notepad',
      appName: 'notepad.exe',
      windowTitle: 'Untitled - Notepad',
      expectedCategory: APP_CATEGORIES.DOCUMENT,
      sampleDictation: 'Meeting notes for Monday morning discussion with team',
      verificationDirective: 'document'
    },
    {
      name: 'Visual Studio Code',
      appName: 'Code.exe',
      windowTitle: 'index.ts - veoflow - Visual Studio Code',
      expectedCategory: APP_CATEGORIES.CODE_EDITOR,
      sampleDictation: 'export async function handlePayload request payload return true',
      verificationDirective: 'code_editor'
    },
    {
      name: 'Google Chrome',
      appName: 'chrome.exe',
      windowTitle: 'Search - Google Chrome',
      url: 'https://www.google.com',
      expectedCategory: APP_CATEGORIES.BROWSER_FORM,
      sampleDictation: 'best practices for web audio api streaming',
      verificationDirective: 'browser_form'
    },
    {
      name: 'Microsoft Edge',
      appName: 'msedge.exe',
      windowTitle: 'Documentation - Microsoft Edge',
      url: 'https://learn.microsoft.com',
      expectedCategory: APP_CATEGORIES.BROWSER_FORM,
      sampleDictation: 'how to configure windows ui automation accessibility',
      verificationDirective: 'browser_form'
    },
    {
      name: 'Slack',
      appName: 'slack.exe',
      windowTitle: 'Slack | general | Acme Corp',
      expectedCategory: APP_CATEGORIES.CHAT,
      sampleDictation: 'hey team just pushed the latest build let me know if tests pass',
      verificationDirective: 'chat'
    },
    {
      name: 'Gmail (Webmail)',
      appName: 'chrome.exe',
      windowTitle: 'Inbox (5) - user@acme.com - Gmail',
      url: 'https://mail.google.com/mail/u/0/#inbox',
      expectedCategory: APP_CATEGORIES.EMAIL,
      sampleDictation: 'Hi Sarah, please find the quarterly compliance review attached. Best regards, Alex',
      verificationDirective: 'email'
    },
    {
      name: 'Microsoft Word',
      appName: 'WINWORD.EXE',
      windowTitle: 'Executive_Summary.docx - Word',
      expectedCategory: APP_CATEGORIES.DOCUMENT,
      sampleDictation: 'Quarterly Financial Executive Summary. Revenue increased by fifteen percent year over year.',
      verificationDirective: 'document'
    },
    {
      name: 'Windows Terminal',
      appName: 'WindowsTerminal.exe',
      windowTitle: 'PowerShell 7',
      expectedCategory: APP_CATEGORIES.TERMINAL,
      sampleDictation: 'git status and git commit minus m update docs',
      verificationDirective: 'terminal'
    }
  ];

  TARGET_APPS.forEach((target) => {
    describe(`Compatibility Profile: ${target.name} (${target.appName})`, () => {
      it(`accurately classifies ${target.name} as ${target.expectedCategory}`, () => {
        const classified = classifier.classify({
          appName: target.appName,
          windowTitle: target.windowTitle,
          url: target.url
        });

        expect(classified.category).toBe(target.expectedCategory);
      });

      it(`constructs prompt with category-specific instructions for ${target.name}`, () => {
        const contextEnvelope = {
          application: {
            name: target.appName,
            displayName: target.name,
            category: target.expectedCategory
          },
          window: {
            title: target.windowTitle,
            url: target.url || ''
          },
          input: {
            controlType: 'Edit'
          }
        };

        const prompt = PromptEngine.buildPrompt(contextEnvelope, 'contextual');
        expect(prompt).toContain(`Category: "${target.expectedCategory}"`);

        // Check category-specific directive rules
        if (target.expectedCategory === APP_CATEGORIES.CODE_EDITOR) {
          expect(prompt).toContain('code_editor (IDE)');
          expect(prompt).toContain('camelCase');
        } else if (target.expectedCategory === APP_CATEGORIES.TERMINAL) {
          expect(prompt).toContain('TERMINAL SAFETY');
          expect(prompt).toContain('terminal (Shell/CLI)');
        } else if (target.expectedCategory === APP_CATEGORIES.CHAT) {
          expect(prompt).toContain('chat (Messaging)');
        } else if (target.expectedCategory === APP_CATEGORIES.EMAIL) {
          expect(prompt).toContain('email (Correspondence)');
        } else if (target.expectedCategory === APP_CATEGORIES.DOCUMENT) {
          expect(prompt).toContain('document (Docs/Notes)');
        } else if (target.expectedCategory === APP_CATEGORIES.BROWSER_FORM) {
          expect(prompt).toContain('browser_form');
        }
      });

      it(`completes verified text insertion into ${target.name} with transaction tracking`, async () => {
        const hwnd = '0x' + (0x5000 + Math.floor(Math.random() * 1000)).toString(16);
        fakeHelper.currentHwnd = hwnd;
        fakeHelper.currentApp = target.appName;

        const targetContext = {
          hwnd,
          appName: target.appName,
          processId: 10200,
          windowTitle: target.windowTitle
        };

        const result = await injectionManager.inject(target.sampleDictation, targetContext, {
          strategy: 'auto'
        });

        expect(result.success).toBe(true);
        expect(result.verified).toBe(true);
        expect(result.transaction).toBeDefined();
        expect(result.transaction.status).toBe('verified');
        expect(result.transaction.targetProcess.name).toBe(target.appName);

        // Verify transaction is recorded in database
        const txList = tracker.getRecentTransactions(10);
        const savedTx = txList.find((t) => t.id === result.transaction.id);
        expect(savedTx).toBeDefined();
        expect(savedTx.targetProcess.name).toBe(target.appName);
      });
    });
  });

  describe('User-Defined Custom Application Rules', () => {
    it('allows user rules to override built-in classification', () => {
      // Add custom rule to database
      db.addAppRule('chrome.exe', 'chat', 'contextual');
      db.addAppRule('special_tool.exe', 'code_editor', 'contextual');

      const customClassifier = new AppClassifier(() => db.getAppRules());

      const chromeResult = customClassifier.classify({ appName: 'chrome.exe' });
      expect(chromeResult.category).toBe(APP_CATEGORIES.CHAT);
      expect(chromeResult.matchedRule).toContain('custom_rule:chrome.exe');

      const specialResult = customClassifier.classify({ appName: 'special_tool.exe' });
      expect(specialResult.category).toBe(APP_CATEGORIES.CODE_EDITOR);
      expect(specialResult.matchedRule).toContain('custom_rule:special_tool.exe');
    });
  });

  describe('Target Revalidation & Active Window Guard', () => {
    it('aborts injection if target window changes before text insertion', async () => {
      const originalTarget = {
        hwnd: '0x12345',
        appName: 'notepad.exe',
        processId: 1001,
        windowTitle: 'Original.txt - Notepad'
      };

      // Target switched to another window unexpectedly
      fakeHelper.currentHwnd = '0x99999';
      fakeHelper.currentApp = 'other.exe';

      const result = await injectionManager.inject('This should not be injected', originalTarget, {
        strategy: 'auto'
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('cancelled');
      expect(result.error).toContain('Foreground window changed');
      expect(fakeHelper.injectText).not.toHaveBeenCalled();
    });
  });
});
