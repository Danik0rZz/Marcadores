// Local server mode: the real Express server (serving client/dist) on a
// throwaway database, driven through the UI.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { launchBrowser, startLocalServer, instrumentPage, ui } from './lib.mjs';

let browser;
let server;
let page;
let state;
let nav, dialog, toast;
let BASE;

before(async () => {
  server = await startLocalServer(3998);
  BASE = server.base;
  browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  page = await context.newPage();
  state = instrumentPage(page);
  ({ nav, dialog, toast } = ui(page));
  await page.goto(BASE);
});

after(async () => {
  await browser?.close();
  await server?.stop();
});

// Every test starts with no dialog open, whatever the previous one left.
beforeEach(async () => {
  state.acceptDialogs = true;
  await ui(page).closeDialogs();
});

test('home loads with stats', async () => {
  await page.getByText('Apuntes sobre React 19', { exact: false }).first().waitFor({ timeout: 5000 });
});

test('dashboard note opens with full content', async () => {
  await page.locator('.recent-item', { hasText: 'Apuntes sobre React 19' }).click();
  await dialog().getByText('useActionState').first().waitFor({ timeout: 10000 });
  // highlight-free note; tags visible
  await dialog().getByText('#react').waitFor();
  await page.keyboard.press('Escape');
  assert.ok(await dialog().count() === 0, 'Escape should close the detail');
});

test('bookmarks page lists seed bookmarks', async () => {
  await nav('Marcadores');
  await page.locator('.item-card').first().waitFor();
  assert.ok(await page.locator('.item-card').count() === 4, `expected 4 cards, got ${await page.locator('.item-card').count()}`);
});

test('search filters without losing the rest of the app', async () => {
  await page.getByRole('searchbox', { name: 'Búsqueda global' }).fill('sqlite');
  await page.waitForFunction(() => document.querySelectorAll('.item-card').length === 1, null, { timeout: 10000 });
  await page.getByRole('searchbox', { name: 'Búsqueda global' }).fill('');
  await page.waitForFunction(() => document.querySelectorAll('.item-card').length === 4, null, { timeout: 10000 });
});

test('manual link: modal lists notes and creates the link', async () => {
  const card = page.locator('.item-card', { hasText: 'Tailwind CSS Docs v4' });
  await card.getByRole('button', { name: 'Vincular con una nota' }).click();
  const d = dialog();
  await d.waitFor();
  const options = await d.locator('select option').count();
  assert.ok(options === 3, `expected 3 notes to link, got ${options}`);
  // focus moved into the dialog
  assert.ok(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')), 'focus should be inside the dialog');
  const value = await d.locator('option', { hasText: 'Distribución de Cartera' }).getAttribute('value');
  await d.locator('select').selectOption(value);
  await d.getByRole('button', { name: 'Confirmar Vínculo' }).click();
  await toast('Vínculo creado').waitFor({ timeout: 10000 });
  assert.ok(await dialog().count() === 0, 'modal should close after linking');
});

test('related drawer: unlink works and stacked Escape closes only the top dialog', async () => {
  const card = page.locator('.item-card', { hasText: 'Tailwind CSS Docs v4' });
  await card.getByRole('button', { name: 'Ver notas relacionadas' }).click();
  const drawer = dialog();
  await drawer.getByText('Vínculo Manual').first().waitFor({ timeout: 10000 });

  // open the link picker on top, Escape closes only it
  await drawer.getByRole('button', { name: /Vincular Nota manualmente/ }).click();
  await page.waitForFunction(() => document.querySelectorAll('[role="dialog"]').length === 2);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelectorAll('[role="dialog"]').length === 1);

  await page.getByRole('button', { name: /Eliminar vínculo manual con Distribución/ }).click();
  await toast('Vínculo eliminado').waitFor({ timeout: 10000 });
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]')?.textContent.includes('Vínculo Manual'), null, { timeout: 10000 });
  await page.keyboard.press('Escape');
});

test('bookmark form: half-typed URL does not crash, dirty close asks first', async () => {
  await page.getByRole('button', { name: /Nuevo marcador/ }).first().click();
  const d = dialog();
  await d.waitFor();
  await d.getByLabel('URL / Enlace web *').fill('https://');
  await d.getByLabel('URL / Enlace web *').fill('https://x');
  assert.ok(await d.count() === 1, 'form should still be open');

  state.acceptDialogs = false;
  await page.keyboard.press('Escape');
  assert.ok(state.dialogs.at(-1)?.includes('sin guardar'), 'should ask before discarding');
  assert.ok(await dialog().count() === 1, 'dismissing the confirm keeps the form');
  state.acceptDialogs = true;
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
});

test('bookmark form: rejects javascript: URL, double submit creates one bookmark', async () => {
  await page.getByRole('button', { name: /Nuevo marcador/ }).first().click();
  const d = dialog();
  await d.getByLabel('Título del marcador *').fill('Prueba E2E');
  await d.getByLabel('URL / Enlace web *').fill('javascript:alert(1)');
  await d.getByLabel('Categoría *').fill('Pruebas');
  // type=url input blocks submit natively for invalid URLs; bypass to hit our check
  await d.locator('form').evaluate(f => { f.noValidate = true; });
  await d.getByRole('button', { name: 'Crear Marcador' }).click();
  await d.getByRole('alert').getByText('http://').waitFor();

  await d.getByLabel('URL / Enlace web *').fill('https://e2e.test/');
  const submit = d.getByRole('button', { name: 'Crear Marcador' });
  await submit.dblclick();
  await toast('Marcador creado').first().waitFor({ timeout: 10000 });
  const all = await (await fetch(`${BASE}/api/bookmarks?q=e2e.test`)).json();
  assert.ok(all.length === 1, `expected 1 bookmark, got ${all.length}`);
});

test('Alt+N does nothing while typing in the search box', async () => {
  await page.getByRole('searchbox', { name: 'Búsqueda global' }).focus();
  await page.keyboard.press('Alt+KeyN');
  assert.ok(await dialog().count() === 0, 'no form should open while typing');
  await page.locator('body').click({ position: { x: 5, y: 890 } });
  await page.keyboard.press('Alt+KeyN');
  await dialog().waitFor({ timeout: 10000 });
  await page.keyboard.press('Escape');
});

test('note with code renders escaped + highlighted, wikilink in code stays text', async () => {
  await page.getByRole('button', { name: /Nueva nota/ }).first().click();
  const d = dialog();
  await d.getByLabel('Título de la nota *').fill('Nota E2E');
  await d.getByLabel('Categoría *').fill('Pruebas');
  const body = '# Hola\n\nVer [[Apuntes sobre React 19]]\n\n```html\n<b>negrita</b>\n```\n\n```bash\nif [[ -f x ]]; then echo ok; fi\n```\n\n[enlace](https://example.com)';
  await d.getByLabel('Contenido de la nota en Markdown').fill(body);
  await d.getByRole('button', { name: 'Guardar Nota' }).click();
  await toast('Nota guardada').waitFor({ timeout: 10000 });

  await nav('Notas');
  const card = page.locator('.item-card', { hasText: 'Nota E2E' });
  await card.getByRole('button', { name: 'Nota E2E' }).click();
  const detail = dialog();
  await detail.waitFor();
  assert.ok(await detail.locator('pre code b').count() === 0, '<b> inside code must not become an element');
  assert.ok((await detail.locator('pre code').first().textContent()).includes('<b>negrita</b>'), 'code text should show the raw HTML');
  assert.ok(await detail.locator('pre code .hljs-tag, pre code .hljs-name').count() > 0, 'html should be highlighted');
  assert.ok(await detail.locator('.wikilink-pill').count() === 1, 'only the prose wikilink becomes a pill');
  assert.ok(await detail.locator('a[href="https://example.com"][target="_blank"]').count() === 1, 'links open in a new tab');

  await detail.locator('.wikilink-pill').click();
  await page.getByRole('dialog').getByText('useActionState').first().waitFor({ timeout: 10000 });
  await page.keyboard.press('Escape');
});

test('wikilink ignores the active filter', async () => {
  await page.getByRole('searchbox', { name: 'Búsqueda global' }).fill('Nota E2E');
  await page.waitForFunction(() => document.querySelectorAll('.item-card').length === 1, null, { timeout: 10000 });
  await page.locator('.item-card', { hasText: 'Nota E2E' }).getByRole('button', { name: 'Nota E2E' }).click();
  await dialog().locator('.wikilink-pill').click();
  await page.getByRole('dialog').getByText('useActionState').first().waitFor({ timeout: 10000 });
  await page.keyboard.press('Escape');
  await page.getByRole('searchbox', { name: 'Búsqueda global' }).fill('');
});

test('graph and matrix render', async () => {
  await nav('Grafo de Red');
  await page.locator('canvas').first().waitFor({ timeout: 10000 });
  await nav('Matriz Cruzada');
  await page.getByText('pts de afinidad').first().waitFor({ timeout: 10000 });
});

test('settings: trash restore round trip', async () => {
  await nav('Marcadores');
  const card = page.locator('.item-card', { hasText: 'Prueba E2E' });
  await card.getByRole('button', { name: 'Mover a la papelera' }).click();
  await toast('Movido a papelera').first().waitFor({ timeout: 10000 });
  await nav('Ajustes y Backups');
  await page.getByRole('button', { name: 'Restaurar Prueba E2E' }).click();
  await toast('Elemento restaurado').waitFor({ timeout: 10000 });
});

test('no console errors and no third-party requests', async () => {
  assert.deepEqual(state.consoleErrors, []);
  // Fonts are bundled and favicons go through the local proxy
  assert.deepEqual([...state.externalHosts], []);
});
