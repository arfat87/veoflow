import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

class StructuredLogger {
  constructor(component = 'VeoFlow') {
    this.component = component;
    this.logDir = path.join(os.homedir(), '.veoflow', 'logs');
    this.logFile = path.join(this.logDir, 'veoflow.log');
    this.initLogDir();
  }

  initLogDir() {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
    } catch {}
  }

  log(level, message, data = null) {
    const entry = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      component: this.component,
      message,
      ...(data ? { data } : {})
    };

    const line = JSON.stringify(entry);

    // Stdout output with formatting
    if (level === 'error') {
      console.error(`[${entry.timestamp}] [${entry.level}] [${entry.component}] ${message}`, data || '');
    } else if (level === 'warn') {
      console.warn(`[${entry.timestamp}] [${entry.level}] [${entry.component}] ${message}`, data || '');
    } else {
      console.log(`[${entry.timestamp}] [${entry.level}] [${entry.component}] ${message}`, data || '');
    }

    // Append to file asynchronously
    try {
      fs.appendFile(this.logFile, line + '\n', () => {});
    } catch {}

    return entry;
  }

  info(message, data) {
    return this.log('info', message, data);
  }

  warn(message, data) {
    return this.log('warn', message, data);
  }

  error(message, data) {
    return this.log('error', message, data);
  }

  debug(message, data) {
    if (process.env.NODE_ENV === 'development' || process.env.VEOFLOW_DEBUG) {
      return this.log('debug', message, data);
    }
  }

  forComponent(childComponent) {
    return new StructuredLogger(childComponent);
  }
}

export const logger = new StructuredLogger();
export default logger;

