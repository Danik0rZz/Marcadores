// Shared helpers for the end-to-end tests (node:test + playwright-core).
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Headless Chromium. Locally, E2E_BROWSER_CHANNEL=msedge (or chrome) uses an
 * installed browser; in CI the one from `npx playwright-core install chromium`.
 */
export function launchBrowser() {
  const channel = process.env.E2E_BROWSER_CHANNEL || undefined;
  return chromium.launch({ channel, headless: true });
}

export function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows may still hold a file for a moment; the OS temp dir cleans up.
  }
}

async function waitFor(url) {
  for (let i = 0; i < 75; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(`${url} did not start`);
}

/** The real local server (serving client/dist) on a throwaway database. */
export async function startLocalServer(port) {
  const dbDir = tempDir('nexus-e2e-db-');
  const child = spawn(process.execPath, ['index.js'], {
    cwd: path.join(ROOT, 'server'),
    env: { ...process.env, PORT: String(port), DB_PATH: path.join(dbDir, 'app.db') },
    stdio: 'ignore'
  });
  const base = `http://127.0.0.1:${port}`;
  await waitFor(`${base}/api/health`);
  return {
    base,
    async stop() {
      child.kill();
      await new Promise(r => setTimeout(r, 300));
      removeDir(dbDir);
    }
  };
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json'
};

/** Serves client/dist-pages under /<prefix>/ like GitHub Pages does. */
export async function startPagesServer(port, prefix = '/Marcadores/') {
  const dir = path.join(ROOT, 'client', 'dist-pages');
  if (!fs.existsSync(path.join(dir, 'index.html'))) {
    throw new Error('Missing client/dist-pages: run "npm run build:pages --prefix client" first');
  }
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (!url.pathname.startsWith(prefix)) {
      res.writeHead(404);
      return res.end();
    }
    let file = path.join(dir, decodeURIComponent(url.pathname.slice(prefix.length)) || 'index.html');
    if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(dir, 'index.html');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${port}${prefix}`,
    stop: () => new Promise(resolve => server.close(resolve))
  };
}

/**
 * Page wiring shared by the tests: collects console errors and third-party
 * requests, and answers confirm() dialogs (accept unless told otherwise).
 */
export function instrumentPage(page) {
  const state = { consoleErrors: [], externalHosts: new Set(), dialogs: [], acceptDialogs: true };
  page.on('pageerror', e => state.consoleErrors.push(`pageerror: ${e.message}`));
  page.on('console', m => {
    if (m.type() === 'error') state.consoleErrors.push(m.text());
  });
  page.on('request', r => {
    const { hostname, protocol } = new URL(r.url());
    if (protocol.startsWith('http') && !['127.0.0.1', 'localhost'].includes(hostname)) {
      state.externalHosts.add(hostname);
    }
  });
  page.on('dialog', d => {
    state.dialogs.push(d.message());
    (state.acceptDialogs ? d.accept() : d.dismiss()).catch(() => {});
  });
  return state;
}

export function ui(page) {
  return {
    nav: (label) => page.locator('aside').getByText(label, { exact: true }).first().click(),
    dialog: () => page.getByRole('dialog'),
    toast: (text) => page.locator('.toast-stack').getByText(text).first(),
    search: () => page.getByRole('searchbox', { name: 'Búsqueda global' }),
    async closeDialogs() {
      for (let i = 0; i < 4 && (await page.getByRole('dialog').count()) > 0; i++) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(100);
      }
    }
  };
}

/**
 * Backup content without volatile values (ids, export time), so two backups
 * of the same library compare equal whichever database produced them.
 */
export function normalizeBackup(backup) {
  const bookmarkTitle = new Map(backup.bookmarks.map(b => [b.id, b.title]));
  const noteTitle = new Map(backup.notes.map(n => [n.id, n.title]));
  const pick = (item, keys) => Object.fromEntries(keys.map(k => [k, item[k] ?? null]));
  const byTitle = (a, b) => a.title.localeCompare(b.title);
  return {
    bookmarks: backup.bookmarks
      .map(b => ({ ...pick(b, ['title', 'url', 'description', 'category', 'subcategory', 'theme', 'color', 'icon', 'deleted_at', 'created_at', 'updated_at']), tags: [...b.tags].sort() }))
      .sort(byTitle),
    notes: backup.notes
      .map(n => ({ ...pick(n, ['title', 'content', 'category', 'subcategory', 'theme', 'deleted_at', 'created_at', 'updated_at']), tags: [...n.tags].sort() }))
      .sort(byTitle),
    relations: backup.manualRelations
      .map(r => `${bookmarkTitle.get(r.bookmark_id)} <-> ${noteTitle.get(r.note_id)} : ${r.notes}`)
      .sort()
  };
}
