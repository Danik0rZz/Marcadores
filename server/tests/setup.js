// Preloaded before the test files (see "test" in package.json) so db.js opens a
// throwaway database instead of the user's data/app.db.
import fs from 'fs';
import os from 'os';
import path from 'path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'marcadores-test-'));
process.env.DB_PATH = path.join(dir, 'test.db');

process.on('exit', () => {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows may still hold the SQLite file open; the OS temp dir cleans up later.
  }
});
