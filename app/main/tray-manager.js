import { Tray, Menu, app } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import logger from '../shared/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class TrayManager {
  constructor(onToggleDictation, onOpenSettings) {
    this.tray = null;
    this.onToggleDictation = onToggleDictation;
    this.onOpenSettings = onOpenSettings;
  }

  createTray() {
    const iconPath = path.resolve(__dirname, '../../assets/icon.png');
    this.tray = new Tray(iconPath);

    const contextMenu = Menu.buildFromTemplate([
      { label: 'VeoFlow Active', enabled: false },
      { type: 'separator' },
      {
        label: 'Start / Stop Dictation',
        click: () => this.onToggleDictation && this.onToggleDictation()
      },
      {
        label: 'Settings & History',
        click: () => this.onOpenSettings && this.onOpenSettings()
      },
      { type: 'separator' },
      {
        label: 'Quit VeoFlow',
        click: () => app.quit()
      }
    ]);

    this.tray.setToolTip('VeoFlow - Intelligent Voice Typing');
    this.tray.setContextMenu(contextMenu);
    this.tray.on('double-click', () => this.onOpenSettings && this.onOpenSettings());

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

