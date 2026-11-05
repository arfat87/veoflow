/**
 * VeoFlow SQLite WASM Driver (ESM)
 * Robust wrapper around official SQLite WebAssembly (sql.js) providing
 * synchronous execution, prepared statements, transactions, and atomic disk persistence.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const initSqlJs = require('sql.js');

let cachedSqlJs = null;

export async function getSqlJsEngine() {
  if (!cachedSqlJs) {
    cachedSqlJs = await initSqlJs();
  }
  return cachedSqlJs;
}

export class SqliteDriver {
  constructor(filePath, SQL) {
    this.filePath = filePath;
    this.SQL = SQL;
    this.db = null;
    this.inTransaction = false;
    this.load();
  }

  load() {
    if (this.filePath && this.filePath !== ':memory:' && fs.existsSync(this.filePath)) {
      try {
        const buffer = fs.readFileSync(this.filePath);
        this.db = new this.SQL.Database(buffer);
      } catch (err) {
        console.warn('[SqliteDriver] Failed to read database from disk, starting fresh:', err.message);
        this.db = new this.SQL.Database();
      }
    } else {
      this.db = new this.SQL.Database();
    }

    try {
      this.db.run('PRAGMA foreign_keys = ON;');
    } catch {}
  }

  save() {
    if (!this.filePath || this.filePath === ':memory:' || this.inTransaction) return;
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const data = this.db.export();
      const buffer = Buffer.from(data);
      const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
      
      try {
        fs.writeFileSync(tempPath, buffer);
        try {
          fs.renameSync(tempPath, this.filePath);
        } catch (renameErr) {
          // On Windows, renameSync can throw EPERM/EBUSY if target is briefly locked or across filesystem boundaries
          try {
            fs.copyFileSync(tempPath, this.filePath);
            try { fs.unlinkSync(tempPath); } catch {}
          } catch (copyErr) {
            // Target is temporarily locked by concurrent worker on Windows; temp file cleaned up
            try { fs.unlinkSync(tempPath); } catch {}
          }
        }
      } catch (writeErr) {
        // Fallback to direct write if temp file creation fails
        fs.writeFileSync(this.filePath, buffer);
      }
    } catch (err) {
      console.error('[SqliteDriver] Failed to save database to disk:', err.message);
    }
  }

  run(sql, params = []) {
    if (!this.db) throw new Error('Database is not initialized.');
    if (!params || params.length === 0) {
      this.db.run(sql);
    } else {
      const stmt = this.db.prepare(sql);
      stmt.run(params);
      stmt.free();
    }
    this.save();
  }

  query(sql, params = []) {
    if (!this.db) throw new Error('Database is not initialized.');
    const stmt = this.db.prepare(sql);
    if (params && params.length > 0) {
      stmt.bind(params);
    }
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  }

  queryOne(sql, params = []) {
    const rows = this.query(sql, params);
    return rows.length > 0 ? rows[0] : null;
  }

  transaction(callback) {
    if (!this.db) throw new Error('Database is not initialized.');
    if (this.inTransaction) {
      return callback(this);
    }
    this.inTransaction = true;
    this.db.run('BEGIN TRANSACTION;');
    try {
      const result = callback(this);
      this.db.run('COMMIT;');
      this.inTransaction = false;
      this.save();
      return result;
    } catch (err) {
      this.inTransaction = false;
      try {
        this.db.run('ROLLBACK;');
      } catch {}
      throw err;
    }
  }

  exportBinary() {
    if (!this.db) throw new Error('Database is not initialized.');
    return Buffer.from(this.db.export());
  }

  importBinary(buffer) {
    if (this.db) {
      try { this.db.close(); } catch {}
    }
    this.db = new this.SQL.Database(buffer);
    this.db.run('PRAGMA foreign_keys = ON;');
    this.save();
  }

  close() {
    if (this.db) {
      this.save();
      try {
        this.db.close();
      } catch {}
      this.db = null;
    }
  }
}

export default { SqliteDriver, getSqlJsEngine };
