import { Tray, Menu, app } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import logger from '../shared/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class TrayManager {
  constructor(handlers = {}) {
    this.tray = null;
    this.handlers = typeof handlers === 'function'
      ? { onToggleDictation: handlers }
      : (handlers || {});
  }

  createTray() {
    const iconPath = path.resolve(__dirname, '../../assets/icon.png');
    this.tray = new Tray(iconPath);

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Open VeoFlow',
        click: () => this.handlers.onOpenVeoFlow && this.handlers.onOpenVeoFlow()
      },
      { type: 'separator' },
      {
        label: 'Start Dictation',
        click: () => this.handlers.onStartDictation && this.handlers.onStartDictation()
      },
      {
        label: 'Stop Dictation',
        click: () => this.handlers.onStopDictation && this.handlers.onStopDictation()
      },
      { type: 'separator' },
      {
        label: 'Settings & Dashboard',
        click: () => this.handlers.onOpenSettings && this.handlers.onOpenSettings()
      },
      { type: 'separator' },
      {
        label: 'Exit VeoFlow',
        click: () => (this.handlers.onExit ? this.handlers.onExit() : app.quit())
      }
    ]);

    this.tray.setToolTip('VeoFlow - Intelligent Voice Typing');
    this.tray.setContextMenu(contextMenu);
    this.tray.on('click', () => this.handlers.onOpenVeoFlow && this.handlers.onOpenVeoFlow());
    this.tray.on('double-click', () => this.handlers.onOpenSettings && this.handlers.onOpenSettings());

    logger.info('System tray initialized');
    return this.tray;
  }

  destroy() {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}

export default TrayManager;
