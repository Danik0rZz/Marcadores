// GitHub Pages build: the API runs in the page on SQLite stored in IndexedDB.
// Focus: data survives reloads, and a backup exported here restores the exact
// same library in a fresh browser, in this mode and in the local server.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  launchBrowser,
  startPagesServer,
  startLocalServer,
  instrumentPage,
  ui,
  normalizeBackup,
  tempDir,
  removeDir
} from './lib.mjs';

let browser;
let pages;
let downloadsDir;
let exportedFile; // backup produced by the first browser profile

before(async () => {
  pages = await startPagesServer(4175);
  browser = await launchBrowser();
  downloadsDir = tempDir('nexus-e2e-downloads-');
});

after(async () => {
  await browser?.close();
  await pages?.stop();
  removeDir(downloadsDir);
});

/** A fresh browser profile: empty IndexedDB, like a first visit. */
async function openProfile() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  const state = instrumentPage(page);
  await page.goto(pages.url);
  await page.locator('.recent-item').first().waitFor({ timeout: 15000 });
  return { context, page, state, ...ui(page) };
}

async function exportBackup(p, name) {
  await p.nav('Ajustes y Backups');
  const [download] = await Promise.all([
    p.page.waitForEvent('download'),
    p.page.getByRole('button', { name: 'Exportar JSON Completo' }).click()
  ]);
  assert.match(download.suggestedFilename(), /^marcadores_y_notas_backup_\d+\.json$/);
  const file = path.join(downloadsDir, name);
  await download.saveAs(file);
  return file;
}

async function importBackup(p, file, mode) {
  await p.nav('Ajustes y Backups');
  const label = mode === 'overwrite' ? 'Reemplazar todo desde JSON' : 'Restaurar desde JSON';
  await p.page.locator('label', { hasText: label }).locator('input[type=file]').setInputFiles(file);
  await p.toast('Copia importada').waitFor({ timeout: 10000 });
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

test('first visit: sample library, no server, no third-party requests', async () => {
  const p = await openProfile();
  try {
    await p.nav('Marcadores');
    await p.page.waitForFunction(() => document.querySelectorAll('.item-card').length === 4);
    assert.ok(await p.page.getByText('Versión web: tus datos se guardan solo en este navegador').isVisible());
    // Features that need to reach other websites are hidden
    assert.equal(await p.page.getByRole('button', { name: 'Comprobar enlace' }).count(), 0);
    assert.deepEqual([...p.state.externalHosts], []);
    assert.deepEqual(p.state.consoleErrors, []);
  } finally {
    await p.context.close();
  }
});

test('changes persist across reloads, then export a backup', async () => {
  const p = await openProfile();
  try {
    // New bookmark with tags
    await p.page.getByRole('button', { name: /Nuevo marcador/ }).first().click();
    const form = p.dialog();
    await form.getByLabel('Título del marcador *').fill('Backup BM');
    await form.getByLabel('URL / Enlace web *').fill('https://backup.test/?a=1&b=2');
    await form.getByLabel('Categoría *').fill('Pruebas');
    await form.getByLabel('Etiquetas (Tags)').fill('respaldo');
    await form.getByLabel('Etiquetas (Tags)').press('Enter');
    assert.equal(await form.getByRole('button', { name: 'Autodetectar' }).count(), 0, 'no metadata fetch on the web');
    await form.getByRole('button', { name: 'Crear Marcador' }).click();
    await p.toast('Marcador creado').waitFor();

    // New note
    await p.page.getByRole('button', { name: /Nueva nota/ }).first().click();
    const noteForm = p.dialog();
    await noteForm.getByLabel('Título de la nota *').fill('Backup Nota');
    await noteForm.getByLabel('Categoría *').fill('Pruebas');
    await noteForm.getByLabel('Contenido de la nota en Markdown').fill('Ver [[Backup BM]]\n\n```js\nconst x = "<b>";\n```');
    await noteForm.getByRole('button', { name: 'Guardar Nota' }).click();
    await p.toast('Nota guardada').waitFor();

    // Manual link between them
    await p.nav('Marcadores');
    await p.page.locator('.item-card', { hasText: 'Backup BM' }).getByRole('button', { name: 'Vincular con una nota' }).click();
    const value = await p.dialog().locator('option', { hasText: 'Backup Nota' }).getAttribute('value');
    await p.dialog().locator('select').selectOption(value);
    await p.dialog().getByRole('textbox', { name: /Tema o descripción/ }).fill('vínculo de prueba');
    await p.dialog().getByRole('button', { name: 'Confirmar Vínculo' }).click();
    await p.toast('Vínculo creado').waitFor();

    // A trashed note must stay trashed through the backup
    await p.nav('Notas');
    await p.page.locator('.item-card', { hasText: 'Distribución de Cartera' }).getByRole('button', { name: 'Mover a la papelera' }).click();
    await p.toast('Movido a papelera').waitFor();

    // Reload: everything comes back from IndexedDB
    await p.page.reload();
    await p.page.locator('.recent-item').first().waitFor();
    await p.nav('Marcadores');
    await p.page.locator('.item-card', { hasText: 'Backup BM' }).waitFor();
    await p.nav('Ajustes y Backups');
    await p.page.getByRole('button', { name: 'Restaurar Distribución de Cartera Boglehead (80/20)' }).waitFor();

    exportedFile = await exportBackup(p, 'profile-a.json');
    const backup = readJson(exportedFile);
    const bm = backup.bookmarks.find(b => b.title === 'Backup BM');
    assert.equal(bm.url, 'https://backup.test/?a=1&b=2');
    assert.deepEqual(bm.tags, ['respaldo']);
    assert.ok(backup.notes.find(n => n.title === 'Distribución de Cartera Boglehead (80/20)').deleted_at, 'trashed note keeps deleted_at');
    assert.equal(normalizeBackup(backup).relations.filter(r => r.includes('Backup BM <-> Backup Nota : vínculo de prueba')).length, 1);
    assert.deepEqual(p.state.consoleErrors, []);
  } finally {
    await p.context.close();
  }
});

test('"replace all" restore in a fresh browser rebuilds the exact same library', async () => {
  assert.ok(exportedFile, 'needs the backup from the previous test');
  const p = await openProfile();
  try {
    await importBackup(p, exportedFile, 'overwrite');

    // Visible in the UI
    await p.nav('Marcadores');
    await p.page.locator('.item-card', { hasText: 'Backup BM' }).waitFor();
    await p.nav('Ajustes y Backups');
    await p.page.getByRole('button', { name: 'Restaurar Distribución de Cartera Boglehead (80/20)' }).waitFor();

    // Survives a reload of the restored data
    await p.page.reload();
    await p.page.locator('.recent-item').first().waitFor();

    // Byte-for-byte the same library (ignoring ids and export time)
    const reExported = readJson(await exportBackup(p, 'profile-b.json'));
    assert.deepEqual(normalizeBackup(reExported), normalizeBackup(readJson(exportedFile)));
    assert.deepEqual(p.state.consoleErrors, []);
  } finally {
    await p.context.close();
  }
});

test('"append" restore adds the backup on top of existing data', async () => {
  const p = await openProfile();
  try {
    const before = readJson(await exportBackup(p, 'profile-c-before.json'));
    await importBackup(p, exportedFile, 'append');
    const afterImport = readJson(await exportBackup(p, 'profile-c-after.json'));
    const source = readJson(exportedFile);
    assert.equal(afterImport.bookmarks.length, before.bookmarks.length + source.bookmarks.length);
    assert.equal(afterImport.notes.length, before.notes.length + source.notes.length);
    assert.equal(afterImport.manualRelations.length, before.manualRelations.length + source.manualRelations.length);
  } finally {
    await p.context.close();
  }
});

test('backups move between the web version and the local server in both directions', async () => {
  const server = await startLocalServer(3996);
  try {
    // Web -> local server
    const webBackup = readJson(exportedFile);
    const imported = await fetch(`${server.base}/api/backup/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...webBackup, mode: 'overwrite' })
    });
    assert.equal(imported.status, 200);
    const serverBackup = await (await fetch(`${server.base}/api/backup/export`)).json();
    assert.deepEqual(normalizeBackup(serverBackup), normalizeBackup(webBackup));

    // Local server -> web: add something on the server first
    await fetch(`${server.base}/api/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Nota del servidor', content: 'creada en local', category: 'Local', tags: ['srv'] })
    });
    const fromServer = await (await fetch(`${server.base}/api/backup/export`)).json();
    const serverFile = path.join(downloadsDir, 'from-server.json');
    fs.writeFileSync(serverFile, JSON.stringify(fromServer));

    const p = await openProfile();
    try {
      await importBackup(p, serverFile, 'overwrite');
      const webCopy = readJson(await exportBackup(p, 'web-from-server.json'));
      assert.deepEqual(normalizeBackup(webCopy), normalizeBackup(fromServer));
    } finally {
      await p.context.close();
    }
  } finally {
    await server.stop();
  }
});

test('two open tabs do not overwrite each other', async () => {
  const context = await browser.newContext();
  try {
    const [a, b] = [await context.newPage(), await context.newPage()];
    for (const page of [a, b]) {
      await page.goto(pages.url);
      await page.locator('.recent-item').first().waitFor({ timeout: 15000 });
    }
    for (const [page, title] of [[a, 'Desde pestaña A'], [b, 'Desde pestaña B']]) {
      await page.getByRole('button', { name: /Nueva nota/ }).first().click();
      const form = page.getByRole('dialog');
      await form.getByLabel('Título de la nota *').fill(title);
      await form.getByLabel('Categoría *').fill('Pestañas');
      await form.getByLabel('Contenido de la nota en Markdown').fill('x');
      await form.getByRole('button', { name: 'Guardar Nota' }).click();
      await page.locator('.toast-stack').getByText('Nota guardada').first().waitFor();
    }
    await a.reload();
    await a.locator('aside').getByText('Notas', { exact: true }).first().click();
    await a.locator('.item-card', { hasText: 'Desde pestaña A' }).waitFor();
    await a.locator('.item-card', { hasText: 'Desde pestaña B' }).waitFor();
  } finally {
    await context.close();
  }
});
