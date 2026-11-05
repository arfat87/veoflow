/**
 * VeoFlow Application Classifier (ESM)
 * Classifies active target applications into semantic categories.
 */
import { APP_CATEGORIES } from '../../shared/constants.js';

export class AppClassifier {
  constructor(customRulesGetter = null) {
    this.customRulesGetter = typeof customRulesGetter === 'function' ? customRulesGetter : () => [];
  }

  /**
   * Classify an application by process executable, window title, and active URL.
   * @param {Object} rawContext
   * @param {string} rawContext.appName - e.g. "Code.exe", "slack.exe", "chrome.exe"
   * @param {string} [rawContext.windowTitle]
   * @param {string} [rawContext.url]
   * @returns {{ category: string, displayName: string, matchedRule: string }}
   */
  classify(rawContext = {}) {
    const appName = (rawContext.appName || '').trim();
    const exeLower = appName.toLowerCase().replace(/\.exe$/, '');
    const titleLower = (rawContext.windowTitle || '').toLowerCase();
    const urlLower = (rawContext.url || '').toLowerCase();

    // 1. Check user-defined rules first
    const customRules = this.customRulesGetter() || [];
    for (const rule of customRules) {
      if (rule.process_name) {
        const ruleProc = rule.process_name.toLowerCase().replace(/\.exe$/, '');
        if (ruleProc === exeLower) {
          return {
            category: rule.category || APP_CATEGORIES.UNKNOWN,
            displayName: this.formatDisplayName(appName),
            matchedRule: `custom_rule:${rule.process_name}`
          };
        }
      }
    }

    // 2. Code Editors & IDEs
    if (this.isCodeEditor(exeLower, titleLower)) {
      return {
        category: APP_CATEGORIES.CODE_EDITOR,
        displayName: this.formatDisplayName(appName),
        matchedRule: 'builtin:code_editor'
      };
    }

    // 3. Terminals & Shells
    if (this.isTerminal(exeLower)) {
      return {
        category: APP_CATEGORIES.TERMINAL,
        displayName: this.formatDisplayName(appName),
        matchedRule: 'builtin:terminal'
      };
    }

    // 4. Chat & Messaging
    if (this.isChat(exeLower, titleLower, urlLower)) {
      return {
        category: APP_CATEGORIES.CHAT,
        displayName: this.formatDisplayName(appName),
        matchedRule: 'builtin:chat'
      };
    }

    // 5. Email & Correspondence
    if (this.isEmail(exeLower, titleLower, urlLower)) {
      return {
        category: APP_CATEGORIES.EMAIL,
        displayName: this.formatDisplayName(appName),
        matchedRule: 'builtin:email'
      };
    }

    // 6. Documents & Note-taking
    if (this.isDocument(exeLower, titleLower, urlLower)) {
      return {
        category: APP_CATEGORIES.DOCUMENT,
        displayName: this.formatDisplayName(appName),
        matchedRule: 'builtin:document'
      };
    }

    // 7. Web Browsers (Forms)
    if (this.isBrowser(exeLower)) {
      return {
        category: APP_CATEGORIES.BROWSER_FORM,
        displayName: this.formatDisplayName(appName),
        matchedRule: 'builtin:browser_form'
      };
    }

    // 8. General Unknown
    return {
      category: APP_CATEGORIES.UNKNOWN,
      displayName: this.formatDisplayName(appName),
      matchedRule: 'fallback:unknown'
    };
  }

  isCodeEditor(exe, title) {
    const editors = [
      'code', 'cursor', 'devenv', 'sublime_text', 'notepad++',
      'idea64', 'pycharm64', 'webstorm64', 'clion64', 'rider64',
      'atom', 'vscodium', 'zed', 'neovim', 'gvim', 'windsurf'
    ];
    if (editors.includes(exe)) return true;
    if (title.includes('visual studio code') || title.includes(' - code')) return true;
    return false;
  }

  isTerminal(exe) {
    const terminals = [
      'windowsterminal', 'powershell', 'pwsh', 'cmd', 'mintty',
      'conhost', 'wezterm-gui', 'alacritty', 'wt', 'bash',
      'warp', 'hyper', 'putty'
    ];
    return terminals.includes(exe);
  }

  isChat(exe, title, url) {
    const chats = [
      'slack', 'teams', 'ms-teams', 'discord', 'whatsapp', 'telegram',
      'signal', 'element', 'skype', 'mattermost', 'viber'
    ];
    if (chats.includes(exe)) return true;

    // Browser-based chat
    if (url.includes('slack.com') || url.includes('discord.com') ||
        url.includes('web.whatsapp.com') || url.includes('teams.microsoft.com') ||
        url.includes('web.telegram.org')) {
      return true;
    }
    if (title.includes('slack |') || title.includes('discord |') || title.includes('whatsapp')) {
      return true;
    }
    return false;
  }

  isEmail(exe, title, url) {
    const emailClients = ['outlook', 'thunderbird', 'mailspring', 'mail', 'hiri', 'postbox', 'emclient'];
    if (emailClients.includes(exe)) return true;

    // Browser-based email
    if (url.includes('mail.google.com') || url.includes('outlook.live.com') ||
        url.includes('outlook.office.com') || url.includes('fastmail.com')) {
      return true;
    }
    if (title.includes('gmail') || title.includes('outlook') || title.includes('inbox')) {
      return true;
    }
    return false;
  }

  isDocument(exe, title, url) {
    const docApps = [
      'winword', 'wordpad', 'notepad', 'notion', 'obsidian', 'onenote',
      'acrobat', 'acrord32', 'typora', 'logseq', 'libreoffice', 'soffice.bin'
    ];
    if (docApps.includes(exe)) return true;

    // Browser-based docs
    if (url.includes('docs.google.com') || url.includes('notion.so') ||
        url.includes('confluence') || url.includes('coda.io')) {
      return true;
    }
    if (title.includes('google docs') || title.includes('notion') || title.includes('word')) {
      return true;
    }
    return false;
  }

  isBrowser(exe) {
    const browsers = ['chrome', 'msedge', 'brave', 'firefox', 'opera', 'vivaldi', 'arc'];
    return browsers.includes(exe);
  }

  formatDisplayName(appName) {
    if (!appName || appName === 'Unknown') return 'Active Application';
    const clean = appName.replace(/\.exe$/i, '');
    const map = {
      code: 'Visual Studio Code',
      cursor: 'Cursor',
      windowsterminal: 'Windows Terminal',
      notepad: 'Notepad',
      slack: 'Slack',
      teams: 'Microsoft Teams',
      discord: 'Discord',
      chrome: 'Google Chrome',
      msedge: 'Microsoft Edge',
      firefox: 'Mozilla Firefox',
      winword: 'Microsoft Word',
      outlook: 'Microsoft Outlook'
    };
    return map[clean.toLowerCase()] || clean;
  }
}

export default AppClassifier;
