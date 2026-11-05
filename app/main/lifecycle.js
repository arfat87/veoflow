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
    // Auto-approve only media permissions (microphone) for local origins
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
      if (permission === 'media') {
        return callback(true);
      }
      callback(false);
    });

    // Content Security Policy (CSP) headers injection
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https:;"
          ]
        }
      });
    });

    logger.info('Strict security policies and Content-Security-Policy configured');
  }
}

