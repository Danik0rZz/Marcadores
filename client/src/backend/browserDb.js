/**
 * The database of the GitHub Pages build: SQLite (sql.js / WebAssembly) kept
 * in this browser's IndexedDB. The server modules import `db` from
 * './db.js'; the Vite config points that import here in the browser build.
 */
import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url';
import { initSchema } from '../../../server/schema.js';
import { createSqliteAdapter } from './sqliteAdapter.js';

const IDB_NAME = 'nexus';
const IDB_STORE = 'database';
const IDB_KEY = 'app.db';

function openStore() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(IDB_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idb(mode, action) {
  const store = await openStore();
  try {
    return await new Promise((resolve, reject) => {
      const tx = store.transaction(IDB_STORE, mode);
      const request = action(tx.objectStore(IDB_STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    store.close();
  }
}

const loadSavedBytes = () => idb('readonly', store => store.get(IDB_KEY));

/** Storage problems (private mode, quota, blocked site data) end up here. */
export const storageStatus = { persistent: true, error: null };

const SQL = await initSqlJs({ locateFile: () => wasmUrl });

let savedBytes = null;
try {
  savedBytes = await loadSavedBytes();
} catch (err) {
  storageStatus.persistent = false;
  storageStatus.error = err?.message || String(err);
}

export const db = createSqliteAdapter(new SQL.Database(savedBytes || undefined));
db.exec('PRAGMA foreign_keys = ON');
initSchema(db);

export const dbPath = 'indexeddb://nexus/app.db';

/** Writes the current database to IndexedDB. */
export async function persist() {
  if (!storageStatus.persistent) return;
  try {
    const bytes = db.export();
    await idb('readwrite', store => store.put(bytes, IDB_KEY));
  } catch (err) {
    storageStatus.persistent = false;
    storageStatus.error = err?.message || String(err);
    throw new Error(`No se pudo guardar en este navegador: ${storageStatus.error}`);
  }
}

/** Replaces the in-memory database with the latest saved copy (another tab wrote). */
export async function reloadFromStorage() {
  const bytes = await loadSavedBytes();
  if (bytes) db.replace(new SQL.Database(bytes));
}
