import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { initSchema } from './schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// DB_PATH lets tests (and anyone else) point at a different database file.
export const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'app.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);

// Enable WAL mode, foreign keys and performance optimizations
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = -32000'); // 32MB cache in RAM
db.pragma('temp_store = MEMORY');

export function initDb() {
  initSchema(db);
}

// Auto-initialize DB and ensure migrations on import
initDb();
