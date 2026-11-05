import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const SENSITIVE_KEY_REGEX = /^(api_?key|secret|password|auth|authorization|token|credentials|encrypted_key|key)$/i;
const PATTERNS_TO_REDACT = [
  /AIza[0-9A-Za-z-_]{20,}/g,
  /gsk_[a-zA-Z0-9_\-]{20,}/g,
  /sk-(?:proj-)?[a-zA-Z0-9_\-]{20,}/g,
  /sk-ant-[a-zA-Z0-9_\-]{20,}/g,
  /Bearer\s+[a-zA-Z0-9_\-\.]+/gi,
  /dpapi:[A-Za-z0-9+/=]+/g,
  /aes:[0-9a-fA-F:]+/g
];

export function redactSecrets(data) {
  if (data === null || data === undefined) return data;
  if (typeof data === 'string') {
    let sanitized = data;
    for (const pattern of PATTERNS_TO_REDACT) {
      sanitized = sanitized.replace(pattern, '[REDACTED_SECRET]');
    }
    return sanitized;
  }
  if (typeof data !== 'object') return data;

  try {
    const seen = new WeakSet();
    const sanitizeRecursive = (val) => {
      if (val === null || val === undefined) return val;
      if (typeof val === 'string') {
        let str = val;
        for (const pattern of PATTERNS_TO_REDACT) {
          str = str.replace(pattern, '[REDACTED_SECRET]');
        }
        return str;
      }
      if (typeof val !== 'object') return val;
      if (seen.has(val)) return '[Circular]';
      seen.add(val);

      if (Array.isArray(val)) {
        return val.map(sanitizeRecursive);
      }
      if (val instanceof Error) {
        return {
          name: val.name,
          message: sanitizeRecursive(val.message),
          stack: sanitizeRecursive(val.stack)
        };
      }

      const out = {};
      for (const [k, v] of Object.entries(val)) {
        if (SENSITIVE_KEY_REGEX.test(k) && typeof v === 'string') {
          out[k] = '[REDACTED_SECRET]';
        } else {
          out[k] = sanitizeRecursive(v);
        }
      }
      return out;
    };
    return sanitizeRecursive(data);
  } catch {
    return '[Unserializable Data]';
  }
}

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
    const cleanMessage = redactSecrets(message);
    const cleanData = data !== null ? redactSecrets(data) : null;

    const entry = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      component: this.component,
      message: cleanMessage,
      ...(cleanData ? { data: cleanData } : {})
    };

    const line = JSON.stringify(entry);

    // Stdout output with formatting
    if (level === 'error') {
      console.error(`[${entry.timestamp}] [${entry.level}] [${entry.component}] ${cleanMessage}`, cleanData || '');
    } else if (level === 'warn') {
      console.warn(`[${entry.timestamp}] [${entry.level}] [${entry.component}] ${cleanMessage}`, cleanData || '');
    } else {
      console.log(`[${entry.timestamp}] [${entry.level}] [${entry.component}] ${cleanMessage}`, cleanData || '');
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

