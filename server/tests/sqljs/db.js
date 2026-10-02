// Stand-in for server/db.js built exactly like the GitHub Pages database:
// sql.js (SQLite/WebAssembly) behind the better-sqlite3-compatible adapter.
import initSqlJs from '../../../client/node_modules/sql.js/dist/sql-wasm.js';
import { createSqliteAdapter } from '../../../client/src/backend/sqliteAdapter.js';
import { initSchema } from '../../schema.js';

const SQL = await initSqlJs();

export const dbPath = process.env.DB_PATH;
export const db = createSqliteAdapter(new SQL.Database());
db.exec('PRAGMA foreign_keys = ON');

export function initDb() {
  initSchema(db);
}

initDb();

