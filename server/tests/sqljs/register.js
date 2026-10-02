// Runs the server test suite against the browser database (sql.js +
// client/src/backend/sqliteAdapter.js) instead of better-sqlite3, proving
// both storage engines behave the same. See "test:browser-db" in package.json.
import { register } from 'node:module';

register('./hooks.js', import.meta.url);
