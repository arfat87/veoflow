import { DatabaseManager } from '../app/database/database.js';

const db = new DatabaseManager();
const tables = db.driver.query("SELECT name FROM sqlite_master WHERE type = 'table';").map(r => r.name);
const migrations = db.driver.query("SELECT * FROM schema_migrations;");
const settings = db.driver.query("SELECT key, value FROM settings;");

console.log('TABLES_FOUND:', JSON.stringify(tables));
console.log('MIGRATIONS_FOUND:', JSON.stringify(migrations));
console.log('SETTINGS_COUNT:', settings.length);

db.close();
