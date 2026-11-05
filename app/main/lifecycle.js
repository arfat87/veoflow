import { app, session } from 'electron';
import logger from '../shared/logger.js';

export class LifecycleManager {
  constructor(windowManager) {
    this.windowManager = windowManager;
  }

  ensureSingleInstance() {
    const gotTheLock = app.requestSingleInstanceLock();
    if (!gotTheLock) {
      logger.warn('Another instance of VeoFlow is already running. Terminating second instance.');
      app.quit();
      process.exit(0);
    }

    app.on('second-instance', () => {
      logger.info('Second instance launch attempt detected. Focusing existing window.');
      this.windowManager.createSettingsWindow();
    });
  }

  configureSecurityPolicies() {
    // 1. Strict Permission Handling: Approve only microphone media permissions for local file:// origins
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
      const url = webContents?.getURL() || '';
      if (permission === 'media' && url.startsWith('file://')) {
        return callback(true);
      }
      logger.warn(`[Security] Denied permission request '${permission}' for origin: ${url}`);
      callback(false);
    });

    session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
      if (permission === 'media' && (requestingOrigin?.startsWith('file://') || webContents?.getURL()?.startsWith('file://'))) {
        return true;
      }
      return false;
    });

    // 2. Strict Content Security Policy (CSP) headers injection: connect-src 'none' blocks unauthorized outbound network calls from renderer
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none';"
          ]
        }
      });
    });

    // 3. Prevent <webview> tag attachment across all WebContents
    app.on('web-contents-created', (event, contents) => {
      contents.on('will-attach-webview', (e) => {
        logger.warn('[Security] Prevented webview attachment attempt');
        e.preventDefault();
      });
    });

    logger.info('Strict security policies and Content-Security-Policy configured');
  }

  /**
   * Synchronizes Windows login startup registration with user preference.
   * @param {boolean} enabled
   */
  syncLaunchOnStartup(enabled) {
    try {
      if (app && app.isPackaged) {
        app.setLoginItemSettings({
          openAtLogin: Boolean(enabled),
          path: process.execPath,
          args: ['--hidden']
        });
        logger.info(`Startup login item updated: openAtLogin=${Boolean(enabled)}`);
      } else {
        logger.info(`[DevMode] Startup login item simulated: openAtLogin=${Boolean(enabled)}`);
      }
    } catch (err) {
      logger.warn('Failed to update login item settings:', err.message);
    }
  }
}

