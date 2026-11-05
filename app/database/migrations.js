/**
 * VeoFlow Database Migrations (ESM)
 * Versioned SQLite database migrations with atomic execution and rollback safety.
 */

export const MIGRATIONS = [
  {
    version: 1,
    name: '001_initial_schema',
    up: (driver) => {
      driver.run(`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS dictations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT,
          timestamp TEXT NOT NULL,
          app_name TEXT NOT NULL,
          window_title TEXT,
          url TEXT,
          raw_asr TEXT NOT NULL,
          formatted_text TEXT NOT NULL,
          language TEXT DEFAULT 'auto',
          transcription_provider TEXT,
          formatting_provider TEXT,
          model_used TEXT,
          latency_ms INTEGER DEFAULT 0,
          status TEXT DEFAULT 'success',
          error_message TEXT,
          created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_dictations_timestamp ON dictations(timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_dictations_app ON dictations(app_name);
        CREATE INDEX IF NOT EXISTS idx_dictations_status ON dictations(status);

        CREATE TABLE IF NOT EXISTS insertion_transactions (
          transaction_id TEXT PRIMARY KEY,
          dictation_id INTEGER REFERENCES dictations(id) ON DELETE SET NULL,
          target_hwnd TEXT NOT NULL,
          target_process TEXT NOT NULL,
          strategy TEXT NOT NULL,
          text_hash TEXT NOT NULL,
          status TEXT NOT NULL,
          error_message TEXT,
          created_at TEXT NOT NULL,
          completed_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_transactions_status ON insertion_transactions(status);

        CREATE TABLE IF NOT EXISTS dictionary (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          trigger_word TEXT NOT NULL UNIQUE,
          replacement TEXT NOT NULL,
          case_sensitive INTEGER DEFAULT 0,
          is_enabled INTEGER DEFAULT 1,
          priority INTEGER DEFAULT 100,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_dictionary_trigger ON dictionary(trigger_word);

        CREATE TABLE IF NOT EXISTS snippets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          shortcut TEXT NOT NULL UNIQUE,
          expanded_text TEXT NOT NULL,
          is_enabled INTEGER DEFAULT 1,
          usage_count INTEGER DEFAULT 0,
          last_used_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_snippets_shortcut ON snippets(shortcut);

        CREATE TABLE IF NOT EXISTS provider_configs (
          provider_id TEXT PRIMARY KEY,
          stt_model TEXT NOT NULL,
          llm_model TEXT NOT NULL,
          api_key_encrypted TEXT,
          is_enabled INTEGER DEFAULT 1,
          custom_endpoint TEXT,
          timeout_ms INTEGER DEFAULT 15000,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS app_rules (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          process_name TEXT NOT NULL UNIQUE,
          category TEXT NOT NULL DEFAULT 'unknown',
          tone TEXT NOT NULL DEFAULT 'contextual',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
    }
  },
  {
    version: 2,
    name: '002_user_features_and_indexes',
    up: (driver) => {
      driver.run(`
        CREATE INDEX IF NOT EXISTS idx_dictations_latency ON dictations(latency_ms);
        CREATE INDEX IF NOT EXISTS idx_snippets_usage ON snippets(usage_count DESC);
      `);
    }
  }
];

export function runMigrations(driver) {
  driver.run(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedRows = driver.query('SELECT version FROM schema_migrations ORDER BY version ASC;');
  const appliedVersions = new Set(appliedRows.map(r => Number(r.version)));

  for (const migration of MIGRATIONS) {
    if (!appliedVersions.has(migration.version)) {
      driver.transaction((d) => {
        migration.up(d);
        d.run(
          'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?);',
          [migration.version, migration.name, new Date().toISOString()]
        );
      });
    }
  }
}

export default { MIGRATIONS, runMigrations };

