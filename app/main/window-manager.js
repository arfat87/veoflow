import { BrowserWindow, screen, app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import defaultDb from '../database/database.js';
import logger from '../shared/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function resolveViewHtml(relativeViewPath) {
  // 1. Packaged or compiled Vite production build
  const distCandidate = path.resolve(__dirname, '../../dist/renderer', relativeViewPath);
  if (fs.existsSync(distCandidate)) {
    return distCandidate;
  }
  // 2. Unpackaged development source
  const devCandidate = path.resolve(__dirname, '../renderer', relativeViewPath);
  if (fs.existsSync(devCandidate)) {
    return devCandidate;
  }
  return devCandidate;
}

export function resolveApplicationIcon() {
  const icoPath = path.resolve(__dirname, '../../build/icon.ico');
  if (fs.existsSync(icoPath)) return icoPath;
  const pngPath = path.resolve(__dirname, '../../build/icon.png');
  if (fs.existsSync(pngPath)) return pngPath;
  const assetPng = path.resolve(__dirname, '../../assets/icon.png');
  if (fs.existsSync(assetPng)) return assetPng;
  return null;
}

export class WindowManager {
  constructor(databaseInstance = null) {
    this.db = databaseInstance || defaultDb;
    this.overlayWindow = null;
    this.settingsWindow = null;
    this.preloadPath = path.resolve(__dirname, '../preload/index.cjs');
  }

  /**
   * Calculates persistent coordinates with multi-monitor boundary validation.
   */
  calculateInitialPosition(winWidth, winHeight) {
    try {
      const savedX = this.db.getSetting('hud_x');
      const savedY = this.db.getSetting('hud_y');

      if (savedX !== null && savedY !== null && !isNaN(Number(savedX)) && !isNaN(Number(savedY))) {
        const targetX = Number(savedX);
        const targetY = Number(savedY);

        // Multi-monitor support: Verify coordinates are inside any connected display
        const allDisplays = screen.getAllDisplays();
        const isVisibleOnAnyDisplay = allDisplays.some((disp) => {
          const { x, y, width, height } = disp.workArea;
          return (
            targetX >= x - 50 &&
            targetX + winWidth <= x + width + 50 &&
            targetY >= y - 50 &&
            targetY + winHeight <= y + height + 50
          );
        });

        if (isVisibleOnAnyDisplay) {
          return { x: targetX, y: targetY };
        }
      }
    } catch (e) {
      logger.warn('Could not read saved HUD position:', e.message);
    }

    // Default: Center bottom on primary display
    const primaryDisplay = screen.getPrimaryDisplay();
    const { x: workX, y: workY, width, height } = primaryDisplay.workArea;
    const defX = Math.round(workX + (width - winWidth) / 2);
    const defY = Math.round(workY + height - winHeight - 50);
    return { x: defX, y: defY };
  }

  createOverlayWindow() {
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      return this.overlayWindow;
    }

    const winWidth = 360;
    const winHeight = 72;
    const { x, y } = this.calculateInitialPosition(winWidth, winHeight);

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
    const overlayHtmlPath = resolveViewHtml('hud/overlay.html');
    this.overlayWindow.loadFile(overlayHtmlPath);

    this.overlayWindow.once('ready-to-show', () => {
      this.overlayWindow.showInactive();
      logger.info(`Overlay window initialized at (${x}, ${y}) and displayed inactive`);
    });

    // Save persistent position when dragged
    this.overlayWindow.on('moved', () => {
      if (!this.overlayWindow || this.overlayWindow.isDestroyed()) return;
      try {
        const [newX, newY] = this.overlayWindow.getPosition();
        this.db.setSetting('hud_x', String(newX));
        this.db.setSetting('hud_y', String(newY));
      } catch (err) {
        logger.warn('Failed to save HUD position:', err.message);
      }
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

    const appIcon = resolveApplicationIcon();
    this.settingsWindow = new BrowserWindow({
      width: 960,
      height: 720,
      minWidth: 780,
      minHeight: 560,
      title: 'VeoFlow Settings & Dashboard',
      icon: appIcon || undefined,
      autoHideMenuBar: true,
      backgroundColor: '#0b0f17',
      webPreferences: {
        preload: this.preloadPath,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true
      }
    });

    const settingsHtmlPath = resolveViewHtml('settings/settings.html');
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

  getOverlayWindow() {
    return this.overlayWindow;
  }

  getSettingsWindow() {
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
