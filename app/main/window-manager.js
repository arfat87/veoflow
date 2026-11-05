import { BrowserWindow, screen } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import logger from '../shared/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class WindowManager {
  constructor() {
    this.overlayWindow = null;
    this.settingsWindow = null;
    this.preloadPath = path.resolve(__dirname, '../preload/index.cjs');
  }

  createOverlayWindow() {
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      return this.overlayWindow;
    }

    const primaryDisplay = screen.getPrimaryDisplay();
    const { x: workX, y: workY, width, height } = primaryDisplay.workArea;

    const winWidth = 360;
    const winHeight = 72;
    const x = Math.round(workX + (width - winWidth) / 2);
    const y = Math.round(workY + height - winHeight - 50);

    this.overlayWindow = new BrowserWindow({
      width: winWidth,
      height: winHeight,
      x,
      y,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      focusable: false, // Prevents stealing keyboard/window focus from target apps!
      show: false,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: this.preloadPath,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true
      }
    });

    this.overlayWindow.setAlwaysOnTop(true, 'status');
    const overlayHtmlPath = path.resolve(__dirname, '../renderer/hud/overlay.html');
    this.overlayWindow.loadFile(overlayHtmlPath);

    this.overlayWindow.once('ready-to-show', () => {
      this.overlayWindow.showInactive();
      logger.info('Overlay window initialized and displayed inactive');
    });

    this.overlayWindow.on('closed', () => {
      this.overlayWindow = null;
    });

    // Restrict navigation
    this.overlayWindow.webContents.on('will-navigate', (e) => e.preventDefault());
    this.overlayWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

    return this.overlayWindow;
  }

  createSettingsWindow() {
    if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
      if (this.settingsWindow.isMinimized()) this.settingsWindow.restore();
      this.settingsWindow.focus();
      return this.settingsWindow;
    }

    this.settingsWindow = new BrowserWindow({
      width: 860,
      height: 680,
      minWidth: 700,
      minHeight: 500,
      title: 'VeoFlow Settings & History',
      autoHideMenuBar: true,
      backgroundColor: '#0f172a',
      webPreferences: {
        preload: this.preloadPath,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true
      }
    });

    const settingsHtmlPath = path.resolve(__dirname, '../renderer/settings/settings.html');
    this.settingsWindow.loadFile(settingsHtmlPath);

    this.settingsWindow.once('ready-to-show', () => {
      this.settingsWindow.show();
      logger.info('Settings window displayed');
    });

    this.settingsWindow.on('closed', () => {
      this.settingsWindow = null;
    });

    // Restrict navigation
    this.settingsWindow.webContents.on('will-navigate', (e) => e.preventDefault());
    this.settingsWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

    return this.settingsWindow;
  }

  sendToOverlay(channel, payload) {
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      this.overlayWindow.webContents.send(channel, payload);
    }
  }

  sendToSettings(channel, payload) {
    if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
      this.settingsWindow.webContents.send(channel, payload);
    }
  }
}

export const windowManager = new WindowManager();
export default windowManager;

