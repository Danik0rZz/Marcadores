import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import Database from 'better-sqlite3';
import { db, initDb } from '../db.js';
import router from '../routes.js';
import {
  getItemTags,
  setItemTags,
  removeItemTags,
  getRelatedNotesForBookmark,
  getRelatedBookmarksForNote,
  getAllCrossRelations
} from '../matchingService.js';
import { buildTaxonomyPayload } from '../taxonomyService.js';
import {
  resolveBookmarkInput,
  resolveNoteInput,
  normalizeImportBookmark,
  normalizeImportNote
} from '../itemValidation.js';
import { localOnly } from '../localOnly.js';

test('Database and seed items exist', () => {
  const bookmarks = db.prepare('SELECT COUNT(*) as count FROM bookmarks').get();
  const notes = db.prepare('SELECT COUNT(*) as count FROM notes').get();
  assert.ok(bookmarks.count > 0, 'Debe haber marcadores iniciales');
  assert.ok(notes.count > 0, 'Debe haber notas iniciales');
});

test('Taxonomy schema uses theme columns after migration', () => {
  const bookmarkColumns = db.prepare('PRAGMA table_info(bookmarks)').all().map(c => c.name);
  const noteColumns = db.prepare('PRAGMA table_info(notes)').all().map(c => c.name);
  assert.ok(bookmarkColumns.includes('theme'), 'Bookmarks debe tener columna theme');
  assert.ok(noteColumns.includes('theme'), 'Notes debe tener columna theme');
});

test('Tags synchronization and item_tags junction', () => {
  const now = new Date().toISOString();
  const res = db.prepare(`
    INSERT INTO bookmarks (title, url, category, subcategory, theme, created_at, updated_at)
    VALUES ('Test BM', 'https://test.com', 'Testing', 'Unit', 'Verificación', ?, ?)
  `).run(now, now);

  const bmId = res.lastInsertRowid;
  const tags = setItemTags('bookmark', bmId, ['alpha', 'BETA', 'alpha']);
  assert.deepEqual(tags, ['alpha', 'beta'], 'Debe normalizar tags a minúsculas y sin duplicados');

  const retrieved = getItemTags('bookmark', bmId);
  assert.deepEqual(retrieved, ['alpha', 'beta'], 'Debe recuperar los tags ordenados');

  // Clean up
  removeItemTags('bookmark', bmId);
  db.prepare('DELETE FROM bookmarks WHERE id = ?').run(bmId);
});

test('Permanent removal drops the item tag links', () => {
  const now = new Date().toISOString();
  const bmId = db.prepare(`
    INSERT INTO bookmarks (title, url, category, subcategory, theme, created_at, updated_at)
    VALUES ('Permanent BM', 'https://permanent-bm.test', 'Testing', 'Removal', 'Tags', ?, ?)
  `).run(now, now).lastInsertRowid;
  const noteId = db.prepare(`
    INSERT INTO notes (title, content, category, subcategory, theme, created_at, updated_at)
    VALUES ('Permanent Note', 'Contenido', 'Testing', 'Removal', 'Tags', ?, ?)
  `).run(now, now).lastInsertRowid;

  try {
    setItemTags('bookmark', bmId, ['permanent-bm-tag']);
    setItemTags('note', noteId, ['permanent-note-tag']);
    assert.equal(getItemTags('bookmark', bmId).length, 1);
    assert.equal(getItemTags('note', noteId).length, 1);

    // Route-independent permanent removal path: the shared helper drops the links,
    // then the parent row is deleted (the REST routes do exactly this).
    removeItemTags('bookmark', bmId);
    db.prepare('DELETE FROM bookmarks WHERE id = ?').run(bmId);
    removeItemTags('note', noteId);
    db.prepare('DELETE FROM notes WHERE id = ?').run(noteId);

    assert.equal(
      db.prepare("SELECT COUNT(*) as c FROM item_tags WHERE item_type = 'bookmark' AND item_id = ?").get(bmId).c,
      0,
      'Los links de tags del marcador deben desaparecer'
    );
    assert.equal(
      db.prepare("SELECT COUNT(*) as c FROM item_tags WHERE item_type = 'note' AND item_id = ?").get(noteId).c,
      0,
      'Los links de tags de la nota deben desaparecer'
    );
  } finally {
    removeItemTags('bookmark', bmId);
    removeItemTags('note', noteId);
    db.prepare('DELETE FROM bookmarks WHERE id = ?').run(bmId);
    db.prepare('DELETE FROM notes WHERE id = ?').run(noteId);
    db.prepare('DELETE FROM tags WHERE name IN (?, ?)').run('permanent-bm-tag', 'permanent-note-tag');
  }
});

test('Soft-deleted (trashed) parent keeps its tag links', () => {
  const now = new Date().toISOString();
  const bmId = db.prepare(`
    INSERT INTO bookmarks (title, url, category, subcategory, theme, created_at, updated_at)
    VALUES ('Trashed BM', 'https://trashed-keep.test', 'Testing', 'Trash', 'Tags', ?, ?)
  `).run(now, now).lastInsertRowid;

  try {
    setItemTags('bookmark', bmId, ['trash-keep-tag']);
    db.prepare('UPDATE bookmarks SET deleted_at = ? WHERE id = ?').run(now, bmId);

    assert.equal(
      db.prepare("SELECT COUNT(*) as c FROM item_tags WHERE item_type = 'bookmark' AND item_id = ?").get(bmId).c,
      1,
      'Mover a la papelera no debe borrar los links de tags'
    );
    assert.deepEqual(getItemTags('bookmark', bmId), ['trash-keep-tag']);
  } finally {
    removeItemTags('bookmark', bmId);
    db.prepare('DELETE FROM bookmarks WHERE id = ?').run(bmId);
    db.prepare('DELETE FROM tags WHERE name = ?').run('trash-keep-tag');
  }
});

test('Orphan cleanup removes dangling item_tags rows and keeps valid ones', () => {
  const now = new Date().toISOString();
  const bmId = db.prepare(`
    INSERT INTO bookmarks (title, url, category, subcategory, theme, created_at, updated_at)
    VALUES ('Valid Parent', 'https://valid-parent.test', 'Testing', 'Cleanup', 'Tags', ?, ?)
  `).run(now, now).lastInsertRowid;
  const orphanItemId = 987654321;

  try {
    setItemTags('bookmark', bmId, ['valid-keep-tag']);
    db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)').run('orphan-only-tag');
    const orphanTagId = db.prepare('SELECT id FROM tags WHERE name = ?').get('orphan-only-tag').id;
    db.prepare('INSERT OR IGNORE INTO item_tags (item_type, item_id, tag_id) VALUES (?, ?, ?)')
      .run('bookmark', orphanItemId, orphanTagId);

    assert.equal(
      db.prepare("SELECT COUNT(*) as c FROM item_tags WHERE item_type = 'bookmark' AND item_id = ?").get(orphanItemId).c,
      1,
      'El link huérfano debe existir antes de la limpieza'
    );

    // initDb() re-runs runMigrations(), which owns the idempotent orphan cleanup.
    initDb();

    assert.equal(
      db.prepare("SELECT COUNT(*) as c FROM item_tags WHERE item_type = 'bookmark' AND item_id = ?").get(orphanItemId).c,
      0,
      'La limpieza debe eliminar el link huérfano'
    );
    assert.deepEqual(getItemTags('bookmark', bmId), ['valid-keep-tag'], 'El link válido no debe tocarse');
  } finally {
    removeItemTags('bookmark', bmId);
    db.prepare('DELETE FROM bookmarks WHERE id = ?').run(bmId);
    db.prepare("DELETE FROM item_tags WHERE item_type = 'bookmark' AND item_id = ?").run(orphanItemId);
    db.prepare('DELETE FROM tags WHERE name = ?').run('orphan-only-tag');
    db.prepare('DELETE FROM tags WHERE name = ?').run('valid-keep-tag');
  }
});

test('Cross-relationship matching by category, subcategory, theme and tags', () => {
  const now = new Date().toISOString();

  // Create bookmark in special category
  const bmRes = db.prepare(`
    INSERT INTO bookmarks (title, url, category, subcategory, theme, created_at, updated_at)
    VALUES ('BM Coincidente', 'https://coincidente.com', 'Arquitectura', 'Microservicios', 'Resiliencia', ?, ?)
  `).run(now, now);
  const bmId = bmRes.lastInsertRowid;
  setItemTags('bookmark', bmId, ['docker', 'kubernetes', 'circuit-breaker']);

  // Create matching note
  const noteRes = db.prepare(`
    INSERT INTO notes (title, content, category, subcategory, theme, created_at, updated_at)
    VALUES ('Nota Coincidente', 'Patrón Circuit Breaker con Envoy', 'Arquitectura', 'Microservicios', 'Resiliencia', ?, ?)
  `).run(now, now);
  const noteId = noteRes.lastInsertRowid;
  setItemTags('note', noteId, ['kubernetes', 'envoy', 'circuit-breaker']);

  // Check matching from Bookmark perspective
  const relatedNotes = getRelatedNotesForBookmark(bmId);
  const match = relatedNotes.find(r => r.note.id === noteId);

  assert.ok(match, 'La nota debe aparecer como relacionada');
  assert.equal(match.relationship.matchedCategory, true, 'Debe coincidir en categoría');
  assert.equal(match.relationship.matchedSubcategory, true, 'Debe coincidir en subcategoría');
  assert.equal(match.relationship.matchedTheme, true, 'Debe coincidir en tema');
  assert.deepEqual(match.relationship.sharedTags.sort(), ['circuit-breaker', 'kubernetes'], 'Debe compartir los 2 tags');
  assert.ok(match.relationship.score >= 100, 'Score de afinidad debe ser alto');

  // Check matching from Note perspective
  const relatedBookmarks = getRelatedBookmarksForNote(noteId);
  const bmMatch = relatedBookmarks.find(r => r.bookmark.id === bmId);
  assert.ok(bmMatch, 'El marcador debe aparecer como relacionado desde la nota');

  // Test manual link
  db.prepare(`
    INSERT INTO manual_relations (bookmark_id, note_id, notes, created_at)
    VALUES (?, ?, 'Vínculo explícito para testing', ?)
  `).run(bmId, noteId, now);

  const updatedNotes = getRelatedNotesForBookmark(bmId);
  const manualMatch = updatedNotes.find(r => r.note.id === noteId);
  assert.equal(manualMatch.relationship.isManual, true, 'Debe registrarse como vínculo manual');

  // Clean up
  db.prepare('DELETE FROM manual_relations WHERE bookmark_id = ? AND note_id = ?').run(bmId, noteId);
  removeItemTags('bookmark', bmId);
  removeItemTags('note', noteId);
  db.prepare('DELETE FROM bookmarks WHERE id = ?').run(bmId);
  db.prepare('DELETE FROM notes WHERE id = ?').run(noteId);
});

test('Cross relations matrix returns all pairs', () => {
  const matrix = getAllCrossRelations();
  assert.ok(Array.isArray(matrix), 'La matriz debe ser un array');
  assert.ok(matrix.length > 0, 'Debe haber pares de relaciones');
  const first = matrix[0];
  assert.ok(first.bookmarkId && first.noteId && first.relationship, 'Cada relación debe tener campos completos');
});

test('HTML Bookmark Netscape format parsing test', () => {
  const htmlSample = `
    <!DOCTYPE NETSCAPE-Bookmark-file-1>
    <HTML>
    <META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
    <Title>Bookmarks</Title>
    <H1>Bookmarks</H1>
    <DL><p>
      <DT><A HREF="https://nodejs.org" ADD_DATE="1600000000">Node.js Official</A>
      <DT><A HREF="https://github.com" ADD_DATE="1600000001">GitHub Code</A>
    </DL><p>
    </HTML>
  `;

  const regex = /<A\s+HREF=["']([^"']+)["'][^>]*>(.*?)<\/A>/gi;
  const matches = [];
  let m;
  while ((m = regex.exec(htmlSample)) !== null) {
    matches.push({ url: m[1], title: m[2] });
  }

  assert.equal(matches.length, 2, 'Debe extraer 2 marcadores');
  assert.equal(matches[0].url, 'https://nodejs.org');
  assert.equal(matches[0].title, 'Node.js Official');
  assert.equal(matches[1].url, 'https://github.com');
  assert.equal(matches[1].title, 'GitHub Code');
});

test('Color, icon and soft-delete/trash cycle', () => {
  const now = new Date().toISOString();
  // Insert bookmark with custom color and icon
  const ins = db.prepare(`
    INSERT INTO bookmarks (title, url, category, subcategory, theme, color, icon, created_at, updated_at)
    VALUES ('Custom BM', 'https://example.com', 'Design', 'UI', 'Test', '#3b82f6', 'palette', ?, ?)
  `).run(now, now);
  const bmId = ins.lastInsertRowid;

  const row = db.prepare('SELECT color, icon, deleted_at FROM bookmarks WHERE id = ?').get(bmId);
  assert.equal(row.color, '#3b82f6');
  assert.equal(row.icon, 'palette');
  assert.equal(row.deleted_at, null);

  // Soft delete (trash)
  db.prepare('UPDATE bookmarks SET deleted_at = ? WHERE id = ?').run(now, bmId);
  const trashed = db.prepare('SELECT deleted_at FROM bookmarks WHERE id = ?').get(bmId);
  assert.ok(trashed.deleted_at !== null, 'Debe tener fecha de borrado');

  // Verify active query ignores trashed item
  const activeCheck = db.prepare('SELECT id FROM bookmarks WHERE id = ? AND deleted_at IS NULL').get(bmId);
  assert.equal(activeCheck, undefined, 'No debe aparecer en consultas activas');

  // Restore
  db.prepare('UPDATE bookmarks SET deleted_at = NULL WHERE id = ?').run(bmId);
  const restored = db.prepare('SELECT deleted_at FROM bookmarks WHERE id = ?').get(bmId);
  assert.equal(restored.deleted_at, null, 'Debe estar restaurado');

  // Clean up
  removeItemTags('bookmark', bmId);
  db.prepare('DELETE FROM bookmarks WHERE id = ?').run(bmId);
});

test('buildTaxonomyPayload returns taxonomy arrays plus flat items excluding trashed rows', () => {
  const now = new Date().toISOString();

  const activeRes = db.prepare(`
    INSERT INTO bookmarks (title, url, category, subcategory, theme, created_at, updated_at)
    VALUES ('Taxonomy Active Bookmark', 'https://taxonomy-active.test', 'TestingTaxonomia', 'UnitTree', 'TreeTheme', ?, ?)
  `).run(now, now);
  const activeId = activeRes.lastInsertRowid;

  const trashedRes = db.prepare(`
    INSERT INTO bookmarks (title, url, category, subcategory, theme, created_at, updated_at, deleted_at)
    VALUES ('Taxonomy Trashed Bookmark', 'https://taxonomy-trashed.test', 'TestingTaxonomia', 'UnitTree', 'TreeTheme', ?, ?, ?)
  `).run(now, now, now);
  const trashedId = trashedRes.lastInsertRowid;

  try {
    const payload = buildTaxonomyPayload();

    assert.ok(Array.isArray(payload.categories), 'categories debe ser un array');
    assert.ok(Array.isArray(payload.subcategories), 'subcategories debe ser un array');
    assert.ok(Array.isArray(payload.themes), 'themes debe ser un array');
    assert.ok(Array.isArray(payload.items), 'items debe ser un array');

    payload.items.forEach(item => {
      assert.ok(item.type === 'bookmark' || item.type === 'note', 'type debe ser bookmark o note');
      assert.ok(item.id !== undefined && item.id !== null, 'id debe estar presente');
      assert.equal(typeof item.title, 'string', 'title debe ser string');
      assert.equal(typeof item.category, 'string', 'category debe ser string');
      assert.equal(typeof item.subcategory, 'string', 'subcategory debe ser string');
      assert.equal(typeof item.theme, 'string', 'theme debe ser string');
    });

    const active = payload.items.find(item => item.type === 'bookmark' && item.id === activeId);
    assert.ok(active, 'El marcador activo debe aparecer en items');
    assert.ok(active.url && active.url.length > 0, 'El marcador debe exponer una url no vacía');

    const trashed = payload.items.find(item => item.type === 'bookmark' && item.id === trashedId);
    assert.equal(trashed, undefined, 'El elemento en papelera no debe aparecer en items');
  } finally {
    removeItemTags('bookmark', activeId);
    removeItemTags('bookmark', trashedId);
    db.prepare('DELETE FROM bookmarks WHERE id = ?').run(activeId);
    db.prepare('DELETE FROM bookmarks WHERE id = ?').run(trashedId);
  }
});

const existingBookmark = {
  title: 'Marcador existente',
  url: 'https://existing.test',
  description: 'Descripción previa',
  category: 'Categoría previa',
  subcategory: 'Subcategoría previa',
  theme: 'Tema previo',
  favicon: 'https://existing.test/favicon.ico',
  color: '#3b82f6',
  icon: 'star'
};

test('resolveBookmarkInput trims valid create input', () => {
  const result = resolveBookmarkInput({
    title: '  Mi Marcador  ',
    url: '  https://example.com  ',
    description: '  Una descripción  ',
    category: '  Diseño  ',
    subcategory: '  UI  ',
    theme: '  Tema  '
  });

  assert.equal(result.ok, true);
  assert.equal(result.values.title, 'Mi Marcador');
  assert.equal(result.values.url, 'https://example.com');
  assert.equal(result.values.description, 'Una descripción');
  assert.equal(result.values.category, 'Diseño');
  assert.equal(result.values.subcategory, 'UI');
  assert.equal(result.values.theme, 'Tema');
});

test('resolveBookmarkInput rejects whitespace-only category on create', () => {
  const result = resolveBookmarkInput({ title: 'X', url: 'https://x.test', category: '   ' });

  assert.equal(result.ok, false);
  assert.equal(result.error, 'Título, URL y Categoría son requeridos');
});

test('resolveBookmarkInput rejects empty category on update', () => {
  const result = resolveBookmarkInput({ category: '' }, existingBookmark);

  assert.equal(result.ok, false);
  assert.equal(result.error, 'Título, URL y Categoría son requeridos');
});

test('resolveBookmarkInput keeps existing values when fields are omitted on update', () => {
  const result = resolveBookmarkInput({ title: 'Nuevo título' }, existingBookmark);

  assert.equal(result.ok, true);
  assert.equal(result.values.title, 'Nuevo título');
  assert.equal(result.values.category, 'Categoría previa');
  assert.equal(result.values.url, 'https://existing.test');
  assert.equal(result.values.subcategory, 'Subcategoría previa');
  assert.equal(result.values.theme, 'Tema previo');
  assert.equal(result.values.color, '#3b82f6');
  assert.equal(result.values.icon, 'star');
});

test('resolveBookmarkInput rejects non-string category without throwing', () => {
  let result;
  assert.doesNotThrow(() => {
    result = resolveBookmarkInput({ category: null }, existingBookmark);
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, 'El campo Categoría debe ser un texto');
});

test('resolveBookmarkInput accepts reason as the theme alias', () => {
  const withReason = resolveBookmarkInput({
    title: 'X',
    url: 'https://x.test',
    category: 'Cat',
    reason: 'Tema legado'
  });
  assert.equal(withReason.ok, true);
  assert.equal(withReason.values.theme, 'Tema legado');

  const withBoth = resolveBookmarkInput({
    title: 'X',
    url: 'https://x.test',
    category: 'Cat',
    theme: 'Tema canónico',
    reason: 'Tema legado'
  });
  assert.equal(withBoth.values.theme, 'Tema canónico');
});

test('resolveBookmarkInput falls back to default color and icon when empty or absent', () => {
  const absent = resolveBookmarkInput({ title: 'X', url: 'https://x.test', category: 'Cat' });
  assert.equal(absent.ok, true);
  assert.equal(absent.values.color, '#10b981');
  assert.equal(absent.values.icon, 'bookmark');

  const empty = resolveBookmarkInput({
    title: 'X',
    url: 'https://x.test',
    category: 'Cat',
    color: '',
    icon: ''
  });
  assert.equal(empty.ok, true);
  assert.equal(empty.values.color, '#10b981');
  assert.equal(empty.values.icon, 'bookmark');
});

test('resolveNoteInput rejects whitespace-only category on create', () => {
  const result = resolveNoteInput({ title: 'Nota', content: 'Contenido', category: '   ' });

  assert.equal(result.ok, false);
  assert.equal(result.error, 'Título, Contenido y Categoría son requeridos');
});

test('resolveNoteInput trims valid input and accepts reason as theme alias', () => {
  const result = resolveNoteInput({
    title: '  Nota  ',
    content: '  Contenido  ',
    category: '  Cat  ',
    reason: '  Tema  '
  });

  assert.equal(result.ok, true);
  assert.equal(result.values.title, 'Nota');
  assert.equal(result.values.content, 'Contenido');
  assert.equal(result.values.category, 'Cat');
  assert.equal(result.values.theme, 'Tema');
});

test('normalizeImportBookmark falls back to General for blank or whitespace-only category', () => {
  assert.equal(normalizeImportBookmark({ title: 'X', category: '' }).category, 'General');
  assert.equal(normalizeImportBookmark({ title: 'X', category: '   ' }).category, 'General');
  assert.equal(normalizeImportBookmark({ title: 'X' }).category, 'General');
});

test('normalizeImportNote falls back to General for blank or whitespace-only category', () => {
  assert.equal(normalizeImportNote({ title: 'N', category: '' }).category, 'General');
  assert.equal(normalizeImportNote({ title: 'N', category: '   ' }).category, 'General');
  assert.equal(normalizeImportNote({ title: 'N' }).category, 'General');
});

test('normalizeImportBookmark falls back to Sin título for blank or missing title', () => {
  assert.equal(normalizeImportBookmark({ title: '   ' }).title, 'Sin título');
  assert.equal(normalizeImportBookmark({ title: '' }).title, 'Sin título');
  assert.equal(normalizeImportBookmark({}).title, 'Sin título');
});

test('normalizeImportNote falls back to Sin título for blank or missing title', () => {
  assert.equal(normalizeImportNote({ title: '   ' }).title, 'Sin título');
  assert.equal(normalizeImportNote({}).title, 'Sin título');
});

test('normalizeImportBookmark trims present string values', () => {
  const values = normalizeImportBookmark({
    title: '  Marcador  ',
    url: '  https://example.com  ',
    description: '  Descripción  ',
    category: '  Diseño  ',
    subcategory: '  UI  ',
    theme: '  Tema  ',
    favicon: '  https://example.com/favicon.ico  ',
    color: '  #3b82f6  ',
    icon: '  star  '
  });

  assert.equal(values.title, 'Marcador');
  assert.equal(values.url, 'https://example.com');
  assert.equal(values.description, 'Descripción');
  assert.equal(values.category, 'Diseño');
  assert.equal(values.subcategory, 'UI');
  assert.equal(values.theme, 'Tema');
  assert.equal(values.favicon, 'https://example.com/favicon.ico');
  assert.equal(values.color, '#3b82f6');
  assert.equal(values.icon, 'star');
});

test('normalizeImportNote trims present string values', () => {
  const values = normalizeImportNote({
    title: '  Nota  ',
    content: '  Contenido  ',
    category: '  Categoría  ',
    subcategory: '  Sub  ',
    theme: '  Tema  '
  });

  assert.equal(values.title, 'Nota');
  assert.equal(values.content, 'Contenido');
  assert.equal(values.category, 'Categoría');
  assert.equal(values.subcategory, 'Sub');
  assert.equal(values.theme, 'Tema');
});

test('normalizeImportBookmark falls back to default color and icon when empty or absent', () => {
  const absent = normalizeImportBookmark({ title: 'X', category: 'Cat' });
  assert.equal(absent.color, '#10b981');
  assert.equal(absent.icon, 'bookmark');

  const empty = normalizeImportBookmark({ title: 'X', category: 'Cat', color: '', icon: '   ' });
  assert.equal(empty.color, '#10b981');
  assert.equal(empty.icon, 'bookmark');
});

test('normalizeImportBookmark treats non-string values as absent without throwing', () => {
  let values;
  assert.doesNotThrow(() => {
    values = normalizeImportBookmark({
      title: 42,
      url: null,
      description: { nested: true },
      category: undefined,
      subcategory: 7,
      theme: [],
      favicon: false,
      color: 0,
      icon: null
    });
  });

  assert.equal(values.title, 'Sin título');
  assert.equal(values.url, '');
  assert.equal(values.description, '');
  assert.equal(values.category, 'General');
  assert.equal(values.subcategory, '');
  assert.equal(values.theme, '');
  assert.equal(values.favicon, '');
  assert.equal(values.color, '#10b981');
  assert.equal(values.icon, 'bookmark');
});

test('normalizeImportNote treats non-string values as absent without throwing', () => {
  let values;
  assert.doesNotThrow(() => {
    values = normalizeImportNote({ title: 12, content: null, category: {}, subcategory: 3, theme: false });
  });

  assert.equal(values.title, 'Sin título');
  assert.equal(values.content, '');
  assert.equal(values.category, 'General');
  assert.equal(values.subcategory, '');
  assert.equal(values.theme, '');
});

test('normalizeImportBookmark accepts reason as the theme alias', () => {
  const withReason = normalizeImportBookmark({ title: 'X', category: 'Cat', reason: '  Tema legado  ' });
  assert.equal(withReason.theme, 'Tema legado');

  const withBoth = normalizeImportBookmark({
    title: 'X',
    category: 'Cat',
    theme: 'Tema canónico',
    reason: 'Tema legado'
  });
  assert.equal(withBoth.theme, 'Tema canónico');
});

test('normalizeImportNote accepts reason as the theme alias', () => {
  const withReason = normalizeImportNote({ title: 'N', category: 'Cat', reason: '  Tema legado  ' });
  assert.equal(withReason.theme, 'Tema legado');

  const withBoth = normalizeImportNote({
    title: 'N',
    category: 'Cat',
    theme: 'Tema canónico',
    reason: 'Tema legado'
  });
  assert.equal(withBoth.theme, 'Tema canónico');
});

test('normalizeImportNote keeps empty content but guarantees a non-blank category', () => {
  const values = normalizeImportNote({ title: 'Nota vacía', content: '   ', category: '   ' });
  assert.equal(values.content, '');
  assert.notEqual(values.category, '');
  assert.equal(values.category, 'General');
});

/* =========================================================================
   HTTP ROUTE REGRESSION COVERAGE
   The real router is mounted in-process on an ephemeral port and driven over
   HTTP with the global fetch, so a route that stops removing tag links fails.
   ========================================================================= */

let httpServer;
let apiBaseUrl;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api', router);
  await new Promise(resolve => {
    httpServer = app.listen(0, '127.0.0.1', resolve);
  });
  apiBaseUrl = `http://127.0.0.1:${httpServer.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    httpServer.close(err => (err ? reject(err) : resolve()));
    // fetch keeps sockets alive: drop idle connections so the runner can exit.
    httpServer.closeIdleConnections();
  });
  // Release the file so tests/setup.js can delete the throwaway database.
  db.close();
});

function insertRouteBookmark(title, url) {
  const now = new Date().toISOString();
  return db.prepare(`
    INSERT INTO bookmarks (title, url, category, subcategory, theme, created_at, updated_at)
    VALUES (?, ?, 'Testing', 'Routes', 'Tags', ?, ?)
  `).run(title, url, now, now).lastInsertRowid;
}

function insertRouteNote(title) {
  const now = new Date().toISOString();
  return db.prepare(`
    INSERT INTO notes (title, content, category, subcategory, theme, created_at, updated_at)
    VALUES (?, 'Contenido de prueba', 'Testing', 'Routes', 'Tags', ?, ?)
  `).run(title, now, now).lastInsertRowid;
}

// Counts the tag links that belong to one item, straight from the join table.
function countItemTagsFor(itemType, itemId) {
  return db
    .prepare('SELECT COUNT(*) as c FROM item_tags WHERE item_type = ? AND item_id = ?')
    .get(itemType, itemId).c;
}

// Row-count neutrality: removes everything a route test created, including the
// `tags` vocabulary rows that setItemTags() inserts and never deletes by itself.
function cleanupRouteRows({ bookmarkIds = [], noteIds = [], tagNames = [] } = {}) {
  for (const id of bookmarkIds) {
    db.prepare("DELETE FROM item_tags WHERE item_type = 'bookmark' AND item_id = ?").run(id);
    db.prepare('DELETE FROM bookmarks WHERE id = ?').run(id);
  }
  for (const id of noteIds) {
    db.prepare("DELETE FROM item_tags WHERE item_type = 'note' AND item_id = ?").run(id);
    db.prepare('DELETE FROM notes WHERE id = ?').run(id);
  }
  if (tagNames.length > 0) {
    const placeholders = tagNames.map(() => '?').join(', ');
    db.prepare(`DELETE FROM tags WHERE name IN (${placeholders})`).run(...tagNames);
  }
}

test('DELETE /api/bookmarks/:id removes the bookmark and its tag links', async () => {
  const tagName = 'route-delete-bookmark-tag';
  const bmId = insertRouteBookmark('Route Delete BM', 'https://route-delete-bm.test');

  try {
    setItemTags('bookmark', bmId, [tagName]);
    assert.equal(countItemTagsFor('bookmark', bmId), 1, 'El link de tag debe existir antes de la petición');

    const response = await fetch(`${apiBaseUrl}/api/bookmarks/${bmId}`, { method: 'DELETE' });
    const body = await response.json();

    assert.equal(response.status, 200, 'DELETE /api/bookmarks/:id debe responder 200');
    assert.equal(body.success, true);
    assert.equal(body.message, 'Marcador eliminado definitivamente');

    assert.equal(
      db.prepare('SELECT COUNT(*) as c FROM bookmarks WHERE id = ?').get(bmId).c,
      0,
      'La fila padre debe desaparecer'
    );
    assert.equal(countItemTagsFor('bookmark', bmId), 0, 'La ruta debe borrar los item_tags del marcador');
    assert.deepEqual(getItemTags('bookmark', bmId), [], 'No deben quedar tags asociados al marcador');
  } finally {
    cleanupRouteRows({ bookmarkIds: [bmId], tagNames: [tagName] });
  }
});

test('DELETE /api/notes/:id removes the note and its tag links', async () => {
  const tagName = 'route-delete-note-tag';
  const noteId = insertRouteNote('Route Delete Note');

  try {
    setItemTags('note', noteId, [tagName]);
    assert.equal(countItemTagsFor('note', noteId), 1, 'El link de tag debe existir antes de la petición');

    const response = await fetch(`${apiBaseUrl}/api/notes/${noteId}`, { method: 'DELETE' });
    const body = await response.json();

    assert.equal(response.status, 200, 'DELETE /api/notes/:id debe responder 200');
    assert.equal(body.success, true);
    assert.equal(body.message, 'Nota eliminada definitivamente');

    assert.equal(
      db.prepare('SELECT COUNT(*) as c FROM notes WHERE id = ?').get(noteId).c,
      0,
      'La fila padre debe desaparecer'
    );
    assert.equal(countItemTagsFor('note', noteId), 0, 'La ruta debe borrar los item_tags de la nota');
    assert.deepEqual(getItemTags('note', noteId), [], 'No deben quedar tags asociados a la nota');
  } finally {
    cleanupRouteRows({ noteIds: [noteId], tagNames: [tagName] });
  }
});

test('DELETE /api/trash/:type/:id destroys the trashed item and its tag links', async () => {
  const bookmarkTag = 'route-trash-destroy-bookmark-tag';
  const noteTag = 'route-trash-destroy-note-tag';
  const bmId = insertRouteBookmark('Route Trash Destroy BM', 'https://route-trash-destroy-bm.test');
  const noteId = insertRouteNote('Route Trash Destroy Note');

  try {
    setItemTags('bookmark', bmId, [bookmarkTag]);
    setItemTags('note', noteId, [noteTag]);

    // Soft delete first, through the real route: the trash must keep the tag links.
    const trashBookmark = await fetch(`${apiBaseUrl}/api/bookmarks/${bmId}/trash`, { method: 'POST' });
    const trashBookmarkBody = await trashBookmark.json();
    assert.equal(trashBookmark.status, 200);
    assert.equal(trashBookmarkBody.message, 'Marcador movido a la papelera');

    const trashNote = await fetch(`${apiBaseUrl}/api/notes/${noteId}/trash`, { method: 'POST' });
    const trashNoteBody = await trashNote.json();
    assert.equal(trashNote.status, 200);
    assert.equal(trashNoteBody.message, 'Nota movida a la papelera');

    assert.equal(countItemTagsFor('bookmark', bmId), 1, 'La papelera no debe borrar los links del marcador');
    assert.equal(countItemTagsFor('note', noteId), 1, 'La papelera no debe borrar los links de la nota');

    // Permanent destruction from the trash must drop both the row and its links.
    const destroyBookmark = await fetch(`${apiBaseUrl}/api/trash/bookmark/${bmId}`, { method: 'DELETE' });
    const destroyBookmarkBody = await destroyBookmark.json();
    assert.equal(destroyBookmark.status, 200, 'DELETE /api/trash/bookmark/:id debe responder 200');
    assert.equal(destroyBookmarkBody.message, 'Elemento eliminado definitivamente');

    const destroyNote = await fetch(`${apiBaseUrl}/api/trash/note/${noteId}`, { method: 'DELETE' });
    const destroyNoteBody = await destroyNote.json();
    assert.equal(destroyNote.status, 200, 'DELETE /api/trash/note/:id debe responder 200');
    assert.equal(destroyNoteBody.message, 'Elemento eliminado definitivamente');

    assert.equal(
      db.prepare('SELECT COUNT(*) as c FROM bookmarks WHERE id = ?').get(bmId).c,
      0,
      'El marcador destruido debe desaparecer'
    );
    assert.equal(
      db.prepare('SELECT COUNT(*) as c FROM notes WHERE id = ?').get(noteId).c,
      0,
      'La nota destruida debe desaparecer'
    );
    assert.equal(countItemTagsFor('bookmark', bmId), 0, 'La destrucción debe borrar los links del marcador');
    assert.equal(countItemTagsFor('note', noteId), 0, 'La destrucción debe borrar los links de la nota');
  } finally {
    cleanupRouteRows({
      bookmarkIds: [bmId],
      noteIds: [noteId],
      tagNames: [bookmarkTag, noteTag]
    });
  }
});

test('DELETE /api/trash empties the bin, dropping trashed links and keeping live ones', async () => {
  const trashedBookmarkTag = 'route-empty-bin-bookmark-tag';
  const trashedNoteTag = 'route-empty-bin-note-tag';
  const liveBookmarkTag = 'route-empty-bin-live-tag';
  const trashedBmId = insertRouteBookmark('Route Empty Bin BM', 'https://route-empty-bin-bm.test');
  const trashedNoteId = insertRouteNote('Route Empty Bin Note');
  const liveBmId = insertRouteBookmark('Route Empty Bin Live BM', 'https://route-empty-bin-live-bm.test');

  try {
    setItemTags('bookmark', trashedBmId, [trashedBookmarkTag]);
    setItemTags('note', trashedNoteId, [trashedNoteTag]);
    setItemTags('bookmark', liveBmId, [liveBookmarkTag]);

    const trashBookmark = await fetch(`${apiBaseUrl}/api/bookmarks/${trashedBmId}/trash`, { method: 'POST' });
    assert.equal(trashBookmark.status, 200);
    const trashNote = await fetch(`${apiBaseUrl}/api/notes/${trashedNoteId}/trash`, { method: 'POST' });
    assert.equal(trashNote.status, 200);

    assert.equal(countItemTagsFor('bookmark', trashedBmId), 1);
    assert.equal(countItemTagsFor('note', trashedNoteId), 1);
    assert.equal(countItemTagsFor('bookmark', liveBmId), 1);

    const response = await fetch(`${apiBaseUrl}/api/trash`, { method: 'DELETE' });
    const body = await response.json();

    assert.equal(response.status, 200, 'DELETE /api/trash debe responder 200');
    assert.equal(body.success, true);
    assert.equal(body.message, 'Papelera vaciada por completo');

    assert.equal(
      db.prepare('SELECT COUNT(*) as c FROM bookmarks WHERE id = ?').get(trashedBmId).c,
      0,
      'El marcador en papelera debe destruirse'
    );
    assert.equal(
      db.prepare('SELECT COUNT(*) as c FROM notes WHERE id = ?').get(trashedNoteId).c,
      0,
      'La nota en papelera debe destruirse'
    );
    assert.equal(countItemTagsFor('bookmark', trashedBmId), 0, 'Vaciar la papelera debe borrar los links del marcador');
    assert.equal(countItemTagsFor('note', trashedNoteId), 0, 'Vaciar la papelera debe borrar los links de la nota');

    assert.equal(
      db.prepare('SELECT COUNT(*) as c FROM bookmarks WHERE id = ?').get(liveBmId).c,
      1,
      'El item vivo no debe tocarse'
    );
    assert.equal(countItemTagsFor('bookmark', liveBmId), 1, 'El item vivo conserva sus links de tags');
    assert.deepEqual(getItemTags('bookmark', liveBmId), [liveBookmarkTag]);
  } finally {
    cleanupRouteRows({
      bookmarkIds: [trashedBmId, liveBmId],
      noteIds: [trashedNoteId],
      tagNames: [trashedBookmarkTag, trashedNoteTag, liveBookmarkTag]
    });
  }
});

/* =========================================================================
   URL SAFETY, LOCAL-ONLY GUARD AND ONE-TIME SEED
   ========================================================================= */

test('resolveBookmarkInput rejects non-http(s) URLs', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,<b>x</b>', 'file:///etc/passwd', 'not a url']) {
    const result = resolveBookmarkInput({ title: 'X', url, category: 'Y' });
    assert.equal(result.ok, false, `Debe rechazar ${url}`);
  }
  assert.equal(resolveBookmarkInput({ title: 'X', url: 'http://ok.test', category: 'Y' }).ok, true);
});

test('normalizeImportBookmark clears unsafe URLs instead of dropping the row', () => {
  assert.equal(normalizeImportBookmark({ title: 'X', url: 'javascript:alert(1)' }).url, '');
  assert.equal(normalizeImportBookmark({ title: 'X', url: ' https://ok.test ' }).url, 'https://ok.test');
});

test('URL-fetching routes reject non-http(s) URLs', async () => {
  for (const route of ['/api/bookmarks/metadata', '/api/bookmarks/check-health']) {
    const res = await fetch(`${apiBaseUrl}${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'file:///etc/passwd' })
    });
    assert.equal(res.status, 400, `${route} debe responder 400`);
  }
});

function runLocalOnly(headers) {
  let status = null;
  let nextCalled = false;
  const res = { status(code) { status = code; return { json() {} }; } };
  localOnly({ headers }, res, () => { nextCalled = true; });
  return { status, nextCalled };
}

test('localOnly accepts local host and origin, rejects foreign ones', () => {
  assert.equal(runLocalOnly({ host: '127.0.0.1:3001' }).nextCalled, true);
  assert.equal(runLocalOnly({ host: 'localhost:3001', origin: 'http://localhost:5173' }).nextCalled, true);
  assert.equal(runLocalOnly({ host: '[::1]:3001' }).nextCalled, true);
  assert.equal(runLocalOnly({ host: 'evil.example:3001' }).status, 403, 'DNS rebinding');
  assert.equal(runLocalOnly({ host: '127.0.0.1:3001', origin: 'https://evil.example' }).status, 403, 'Cross-site');
  assert.equal(runLocalOnly({ host: '127.0.0.1:3001', origin: 'null' }).status, 403, 'Opaque origin');
});

test('Sample data is seeded only once, never after the user empties the library', () => {
  assert.equal(db.pragma('user_version', { simple: true }), 1, 'initDb debe marcar la base como inicializada');
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM manual_relations').run();
    db.prepare('DELETE FROM bookmarks').run();
    db.prepare('DELETE FROM notes').run();
    initDb();
    assert.equal(db.prepare('SELECT COUNT(*) as c FROM bookmarks').get().c, 0, 'No debe volver a sembrar');
  } finally {
    db.exec('ROLLBACK');
  }
});
