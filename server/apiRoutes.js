/**
 * The API as a transport-free route table.
 *
 * Every handler is a plain synchronous function of { params, query, body }
 * that returns the response payload or throws an HttpError. The same table
 * is mounted by Express (routes.js, local server) and by the in-browser
 * backend of the GitHub Pages build, so both modes share one implementation
 * of the rules: validation, matching, trash, imports and backups.
 *
 * Nothing in here may touch the network, the file system or Node-only APIs.
 */
import { db } from './db.js';
import {
  getItemTags,
  getItemTagsBatch,
  setItemTags,
  removeItemTags,
  getRelatedNotesForBookmark,
  getRelatedBookmarksForNote,
  getAllCrossRelations
} from './matchingService.js';
import { buildTaxonomyPayload } from './taxonomyService.js';
import { parseNetscapeBookmarks } from './netscapeParser.js';
import {
  resolveBookmarkInput,
  resolveNoteInput,
  normalizeImportBookmark,
  normalizeImportNote,
  isWebUrl
} from './itemValidation.js';

// Escapes LIKE wildcards so a search for "100%" or "snake_case" is literal.
// Paired with ESCAPE '\\' in the queries below.
function likeTerm(q) {
  return `%${q.trim().replace(/[\\%_]/g, ch => `\\${ch}`)}%`;
}

// Backup timestamps are trusted only if they parse as dates.
function importTimestamp(value, fallback) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : fallback;
}

function withThemeAlias(item) {
  if (!item) return null;
  const theme = item.theme ?? item.reason ?? '';
  return {
    ...item,
    theme,
    // Compatibility alias for legacy backup/API clients. New clients should use theme.
    reason: theme
  };
}

// Helper to attach tags to bookmarks
function enrichBookmark(b) {
  if (!b) return null;
  return {
    ...withThemeAlias(b),
    tags: getItemTags('bookmark', b.id)
  };
}

// Batch helper: attaches tags to multiple bookmarks in a SINGLE query
function enrichBookmarksBatch(bookmarks = []) {
  if (!bookmarks || bookmarks.length === 0) return [];
  const ids = bookmarks.map(b => b.id);
  const tagsMap = getItemTagsBatch('bookmark', ids);
  return bookmarks.map(b => ({
    ...withThemeAlias(b),
    tags: tagsMap.get(b.id) || []
  }));
}

// Helper to attach tags to notes
function enrichNote(n) {
  if (!n) return null;
  return {
    ...withThemeAlias(n),
    tags: getItemTags('note', n.id)
  };
}

// Batch helper: attaches tags to multiple notes in a SINGLE query
function enrichNotesBatch(notes = []) {
  if (!notes || notes.length === 0) return [];
  const ids = notes.map(n => n.id);
  const tagsMap = getItemTagsBatch('note', ids);
  return notes.map(n => ({
    ...withThemeAlias(n),
    tags: tagsMap.get(n.id) || []
  }));
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** @type {{method: string, path: string, handler: Function, status?: number, download?: Function}[]} */
export const apiRoutes = [];

function route(method, path, handler, options = {}) {
  apiRoutes.push({ method, path, handler, ...options });
}

/* =========================================================================
   TAXONOMY & STATS
   ========================================================================= */

route('GET', '/taxonomy', (req) => {
  return buildTaxonomyPayload();
});

route('GET', '/stats', (req) => {
  const totalBookmarks = db.prepare('SELECT COUNT(*) as count FROM bookmarks WHERE deleted_at IS NULL').get().count;
  const totalNotes = db.prepare('SELECT COUNT(*) as count FROM notes WHERE deleted_at IS NULL').get().count;
  const totalTags = db.prepare('SELECT COUNT(*) as count FROM tags').get().count;
  const totalManualRelations = db.prepare('SELECT COUNT(*) as count FROM manual_relations').get().count;

  const totalCategories = db.prepare(`
    SELECT COUNT(DISTINCT category) as count FROM (
      SELECT category FROM bookmarks WHERE category != '' AND deleted_at IS NULL
      UNION
      SELECT category FROM notes WHERE category != '' AND deleted_at IS NULL
    )
  `).get().count;

  const trashBookmarks = db.prepare('SELECT COUNT(*) as count FROM bookmarks WHERE deleted_at IS NOT NULL').get().count;
  const trashNotes = db.prepare('SELECT COUNT(*) as count FROM notes WHERE deleted_at IS NOT NULL').get().count;
  const trashCount = trashBookmarks + trashNotes;

  // Recent activity (latest 8 created or updated items)
  const recentBookmarks = db.prepare(`
    SELECT id, 'bookmark' as type, title, url, category, subcategory, theme, color, icon, updated_at
    FROM bookmarks
    WHERE deleted_at IS NULL
    ORDER BY updated_at DESC
    LIMIT 8
  `).all();

  const recentNotes = db.prepare(`
    SELECT id, 'note' as type, title, '' as url, category, subcategory, theme, '#10b981' as color, 'note' as icon, updated_at
    FROM notes
    WHERE deleted_at IS NULL
    ORDER BY updated_at DESC
    LIMIT 8
  `).all();

  const recentActivity = [...recentBookmarks, ...recentNotes]
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
    .slice(0, 8);

  // Category breakdown for home stats
  const categoryBreakdown = db.prepare(`
    SELECT category, COUNT(*) as count FROM (
      SELECT category FROM bookmarks WHERE category != '' AND deleted_at IS NULL
      UNION ALL
      SELECT category FROM notes WHERE category != '' AND deleted_at IS NULL
    )
    GROUP BY category
    ORDER BY count DESC
    LIMIT 8
  `).all();

  return {
    totalBookmarks,
    totalNotes,
    totalCategories,
    totalTags,
    totalManualRelations,
    trashCount,
    recentActivity,
    categoryBreakdown
  };
});

/* =========================================================================
   BOOKMARKS CRUD
   ========================================================================= */

route('GET', '/bookmarks', (req) => {
  const { category, subcategory, tag, q } = req.query;
  const theme = req.query.theme ?? req.query.reason;

  let sql = `SELECT DISTINCT b.* FROM bookmarks b`;
  const params = [];
  const conditions = ['b.deleted_at IS NULL'];

  if (tag) {
    sql += `
      JOIN item_tags it ON it.item_type = 'bookmark' AND it.item_id = b.id
      JOIN tags t ON t.id = it.tag_id AND LOWER(t.name) = LOWER(?)
    `;
    params.push(tag.trim());
  }

  if (category) {
    conditions.push(`LOWER(b.category) = LOWER(?)`);
    params.push(category.trim());
  }

  if (subcategory) {
    conditions.push(`LOWER(b.subcategory) = LOWER(?)`);
    params.push(subcategory.trim());
  }

  if (theme) {
    conditions.push(`LOWER(b.theme) = LOWER(?)`);
    params.push(theme.trim());
  }

  if (q) {
    conditions.push(`(
      LOWER(b.title) LIKE LOWER(?) ESCAPE '\\' OR
      LOWER(b.url) LIKE LOWER(?) ESCAPE '\\' OR
      LOWER(b.description) LIKE LOWER(?) ESCAPE '\\' OR
      LOWER(b.category) LIKE LOWER(?) ESCAPE '\\' OR
      LOWER(b.subcategory) LIKE LOWER(?) ESCAPE '\\' OR
      LOWER(b.theme) LIKE LOWER(?) ESCAPE '\\'
    )`);
    const term = likeTerm(q);
    params.push(term, term, term, term, term, term);
  }

  if (conditions.length > 0) {
    sql += ` WHERE ` + conditions.join(' AND ');
  }

  sql += ` ORDER BY b.created_at DESC`;

  const rows = db.prepare(sql).all(...params);
  const enriched = enrichBookmarksBatch(rows);
  return enriched;
});

route('GET', '/bookmarks/:id', (req) => {
  const row = db.prepare('SELECT * FROM bookmarks WHERE id = ?').get(req.params.id);
  if (!row) throw new HttpError(404, 'Marcador no encontrado');
  return enrichBookmark(row);
});

route('GET', '/bookmarks/:id/related', (req) => {
  const related = getRelatedNotesForBookmark(req.params.id);
  return related;
});

route('POST', '/bookmarks', (req) => {
  const { tags } = req.body;
  const resolved = resolveBookmarkInput(req.body);
  if (!resolved.ok) {
    throw new HttpError(400, resolved.error);
  }
  const { title, url, description, category, subcategory, theme, favicon, color, icon } = resolved.values;

  const now = new Date().toISOString();

  const insert = db.prepare(`
    INSERT INTO bookmarks (title, url, description, category, subcategory, theme, favicon, color, icon, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Row and tags are written together or not at all.
  const newId = db.transaction(() => {
    const info = insert.run(
      title,
      url,
      description,
      category,
      subcategory,
      theme,
      favicon,
      color,
      icon,
      now,
      now
    );
    if (Array.isArray(tags)) {
      setItemTags('bookmark', info.lastInsertRowid, tags);
    }
    return info.lastInsertRowid;
  })();

  const created = db.prepare('SELECT * FROM bookmarks WHERE id = ?').get(newId);
  return enrichBookmark(created);
}, { status: 201 });

route('PUT', '/bookmarks/:id', (req) => {
  const { tags } = req.body;
  const existing = db.prepare('SELECT * FROM bookmarks WHERE id = ?').get(req.params.id);
  if (!existing) throw new HttpError(404, 'Marcador no encontrado');

  const resolved = resolveBookmarkInput(req.body, existing);
  if (!resolved.ok) {
    throw new HttpError(400, resolved.error);
  }
  const { title, url, description, category, subcategory, theme, favicon, color, icon } = resolved.values;

  const now = new Date().toISOString();
  const update = db.prepare(`
    UPDATE bookmarks
    SET title = ?, url = ?, description = ?, category = ?, subcategory = ?, theme = ?, favicon = ?, color = ?, icon = ?, updated_at = ?
    WHERE id = ?
  `);

  db.transaction(() => {
    update.run(
      title,
      url,
      description,
      category,
      subcategory,
      theme,
      favicon,
      color,
      icon,
      now,
      existing.id
    );
    if (Array.isArray(tags)) {
      setItemTags('bookmark', existing.id, tags);
    }
  })();

  const updated = db.prepare('SELECT * FROM bookmarks WHERE id = ?').get(req.params.id);
  return enrichBookmark(updated);
});

route('DELETE', '/bookmarks/:id', (req) => {
  const existing = db.prepare('SELECT id FROM bookmarks WHERE id = ?').get(req.params.id);
  if (!existing) throw new HttpError(404, 'Marcador no encontrado');

  // One transaction: a failure must never leave the item alive without its tags,
  // nor a tag link pointing at an item that no longer exists.
  db.transaction(() => {
    removeItemTags('bookmark', req.params.id);
    db.prepare('DELETE FROM bookmarks WHERE id = ?').run(req.params.id);
  })();
  return { success: true, message: 'Marcador eliminado definitivamente' };
});

route('POST', '/bookmarks/:id/trash', (req) => {
  const existing = db.prepare('SELECT id FROM bookmarks WHERE id = ?').get(req.params.id);
  if (!existing) throw new HttpError(404, 'Marcador no encontrado');

  const now = new Date().toISOString();
  db.prepare('UPDATE bookmarks SET deleted_at = ? WHERE id = ?').run(now, req.params.id);
  return { success: true, message: 'Marcador movido a la papelera' };
});

/* =========================================================================
   NOTES CRUD
   ========================================================================= */

route('GET', '/notes', (req) => {
  const { category, subcategory, tag, q } = req.query;
  const theme = req.query.theme ?? req.query.reason;

  let sql = `SELECT DISTINCT n.* FROM notes n`;
  const params = [];
  const conditions = ['n.deleted_at IS NULL'];

  if (tag) {
    sql += `
      JOIN item_tags it ON it.item_type = 'note' AND it.item_id = n.id
      JOIN tags t ON t.id = it.tag_id AND LOWER(t.name) = LOWER(?)
    `;
    params.push(tag.trim());
  }

  if (category) {
    conditions.push(`LOWER(n.category) = LOWER(?)`);
    params.push(category.trim());
  }

  if (subcategory) {
    conditions.push(`LOWER(n.subcategory) = LOWER(?)`);
    params.push(subcategory.trim());
  }

  if (theme) {
    conditions.push(`LOWER(n.theme) = LOWER(?)`);
    params.push(theme.trim());
  }

  if (q) {
    conditions.push(`(
      LOWER(n.title) LIKE LOWER(?) ESCAPE '\\' OR
      LOWER(n.content) LIKE LOWER(?) ESCAPE '\\' OR
      LOWER(n.category) LIKE LOWER(?) ESCAPE '\\' OR
      LOWER(n.subcategory) LIKE LOWER(?) ESCAPE '\\' OR
      LOWER(n.theme) LIKE LOWER(?) ESCAPE '\\'
    )`);
    const term = likeTerm(q);
    params.push(term, term, term, term, term);
  }

  if (conditions.length > 0) {
    sql += ` WHERE ` + conditions.join(' AND ');
  }

  sql += ` ORDER BY n.created_at DESC`;

  const rows = db.prepare(sql).all(...params);
  const enriched = enrichNotesBatch(rows);
  return enriched;
});

route('GET', '/notes/:id', (req) => {
  const row = db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id);
  if (!row) throw new HttpError(404, 'Nota no encontrada');
  return enrichNote(row);
});

route('GET', '/notes/:id/related', (req) => {
  const related = getRelatedBookmarksForNote(req.params.id);
  return related;
});

route('POST', '/notes', (req) => {
  const { tags } = req.body;
  const resolved = resolveNoteInput(req.body);
  if (!resolved.ok) {
    throw new HttpError(400, resolved.error);
  }
  const { title, content, category, subcategory, theme } = resolved.values;

  const now = new Date().toISOString();
  const insert = db.prepare(`
    INSERT INTO notes (title, content, category, subcategory, theme, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const newId = db.transaction(() => {
    const info = insert.run(title, content, category, subcategory, theme, now, now);
    if (Array.isArray(tags)) {
      setItemTags('note', info.lastInsertRowid, tags);
    }
    return info.lastInsertRowid;
  })();

  const created = db.prepare('SELECT * FROM notes WHERE id = ?').get(newId);
  return enrichNote(created);
}, { status: 201 });

route('PUT', '/notes/:id', (req) => {
  const { tags } = req.body;
  const existing = db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id);
  if (!existing) throw new HttpError(404, 'Nota no encontrada');

  const resolved = resolveNoteInput(req.body, existing);
  if (!resolved.ok) {
    throw new HttpError(400, resolved.error);
  }
  const { title, content, category, subcategory, theme } = resolved.values;

  const now = new Date().toISOString();
  const update = db.prepare(`
    UPDATE notes
    SET title = ?, content = ?, category = ?, subcategory = ?, theme = ?, updated_at = ?
    WHERE id = ?
  `);

  db.transaction(() => {
    update.run(title, content, category, subcategory, theme, now, existing.id);
    if (Array.isArray(tags)) {
      setItemTags('note', existing.id, tags);
    }
  })();

  const updated = db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id);
  return enrichNote(updated);
});

route('DELETE', '/notes/:id', (req) => {
  const existing = db.prepare('SELECT id FROM notes WHERE id = ?').get(req.params.id);
  if (!existing) throw new HttpError(404, 'Nota no encontrada');

  // One transaction: a failure must never leave the item alive without its tags,
  // nor a tag link pointing at an item that no longer exists.
  db.transaction(() => {
    removeItemTags('note', req.params.id);
    db.prepare('DELETE FROM notes WHERE id = ?').run(req.params.id);
  })();
  return { success: true, message: 'Nota eliminada definitivamente' };
});

route('POST', '/notes/:id/trash', (req) => {
  const existing = db.prepare('SELECT id FROM notes WHERE id = ?').get(req.params.id);
  if (!existing) throw new HttpError(404, 'Nota no encontrada');

  const now = new Date().toISOString();
  db.prepare('UPDATE notes SET deleted_at = ? WHERE id = ?').run(now, req.params.id);
  return { success: true, message: 'Nota movida a la papelera' };
});

/* =========================================================================
   TRASH & RECYCLE BIN
   ========================================================================= */

// Whitelist: the table name is interpolated into SQL, never taken from input.
const TRASH_TABLES = { bookmark: 'bookmarks', note: 'notes' };

route('GET', '/trash', (req) => {
  const bookmarks = db.prepare(`
    SELECT id, 'bookmark' as type, title, url, category, subcategory, theme, color, icon, deleted_at, updated_at
    FROM bookmarks
    WHERE deleted_at IS NOT NULL
    ORDER BY deleted_at DESC
  `).all();

  const notes = db.prepare(`
    SELECT id, 'note' as type, title, '' as url, category, subcategory, theme, '#10b981' as color, 'note' as icon, deleted_at, updated_at
    FROM notes
    WHERE deleted_at IS NOT NULL
    ORDER BY deleted_at DESC
  `).all();

  const items = [...bookmarks, ...notes].sort((a, b) => new Date(b.deleted_at) - new Date(a.deleted_at));
  return items;
});

route('POST', '/trash/:type/:id/restore', (req) => {
  const { type, id } = req.params;
  const table = TRASH_TABLES[type];
  if (!table) throw new HttpError(400, 'Tipo inválido');

  const { changes } = db
    .prepare(`UPDATE ${table} SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL`)
    .run(id);
  if (changes === 0) throw new HttpError(404, 'Elemento no encontrado en la papelera');
  return { success: true, message: 'Elemento restaurado con éxito' };
});

route('DELETE', '/trash/:type/:id', (req) => {
  const { type, id } = req.params;
  const table = TRASH_TABLES[type];
  if (!table) throw new HttpError(400, 'Tipo inválido');

  const changes = db.transaction(() => {
    const result = db.prepare(`DELETE FROM ${table} WHERE id = ? AND deleted_at IS NOT NULL`).run(id);
    if (result.changes > 0) removeItemTags(type, id);
    return result.changes;
  })();
  if (changes === 0) throw new HttpError(404, 'Elemento no encontrado en la papelera');
  return { success: true, message: 'Elemento eliminado definitivamente' };
});

route('DELETE', '/trash', (req) => {
  const tx = db.transaction(() => {
    // Collect the ids being destroyed first so tag links target the right rows.
    const bookmarkIds = db.prepare('SELECT id FROM bookmarks WHERE deleted_at IS NOT NULL').all();
    const noteIds = db.prepare('SELECT id FROM notes WHERE deleted_at IS NOT NULL').all();
    for (const row of bookmarkIds) removeItemTags('bookmark', row.id);
    for (const row of noteIds) removeItemTags('note', row.id);
    db.prepare('DELETE FROM bookmarks WHERE deleted_at IS NOT NULL').run();
    db.prepare('DELETE FROM notes WHERE deleted_at IS NOT NULL').run();
  });
  tx();
  return { success: true, message: 'Papelera vaciada por completo' };
});

/* =========================================================================
   MANUAL RELATIONS & CROSS MATRIX
   ========================================================================= */

route('GET', '/relations/matrix', (req) => {
  const relations = getAllCrossRelations();
  return relations;
});

route('POST', '/relations/link', (req) => {
  const { bookmarkId, noteId, notes } = req.body;
  if (!bookmarkId || !noteId) {
    throw new HttpError(400, 'bookmarkId y noteId son requeridos');
  }

  const bookmarkExists = db.prepare('SELECT 1 FROM bookmarks WHERE id = ?').get(bookmarkId);
  const noteExists = db.prepare('SELECT 1 FROM notes WHERE id = ?').get(noteId);
  if (!bookmarkExists || !noteExists) {
    throw new HttpError(404, 'Marcador o nota no encontrados');
  }

  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO manual_relations (bookmark_id, note_id, notes, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(bookmark_id, note_id) DO UPDATE SET notes = excluded.notes
  `);

  stmt.run(bookmarkId, noteId, typeof notes === 'string' ? notes.trim() : '', now);
  return { success: true, message: 'Vínculo establecido con éxito' };
});

route('DELETE', '/relations/unlink', (req) => {
  const { bookmarkId, noteId } = req.body;
  if (!bookmarkId || !noteId) {
    throw new HttpError(400, 'bookmarkId y noteId son requeridos');
  }

  db.prepare('DELETE FROM manual_relations WHERE bookmark_id = ? AND note_id = ?').run(bookmarkId, noteId);
  return { success: true, message: 'Vínculo eliminado con éxito' };
});

/* =========================================================================
   BACKUP: EXPORT & IMPORT JSON
   ========================================================================= */

route('GET', '/backup/export', () => ({
  version: '1.0.0',
  exportedAt: new Date().toISOString(),
  bookmarks: enrichBookmarksBatch(db.prepare('SELECT * FROM bookmarks ORDER BY id ASC').all()),
  notes: enrichNotesBatch(db.prepare('SELECT * FROM notes ORDER BY id ASC').all()),
  manualRelations: db.prepare('SELECT * FROM manual_relations').all(),
  tags: db.prepare('SELECT * FROM tags').all()
}), { download: () => `marcadores_y_notas_backup_${Date.now()}.json` });

route('POST', '/backup/import', (req) => {
  const { bookmarks, notes, manualRelations, mode = 'append' } = req.body;

  if (!Array.isArray(bookmarks) && !Array.isArray(notes)) {
    throw new HttpError(400, 'Formato inválido de archivo JSON de backup');
  }
  if (mode !== 'append' && mode !== 'overwrite') {
    throw new HttpError(400, 'Modo de importación inválido');
  }

  const now = new Date().toISOString();

  const insertBookmark = db.prepare(`
    INSERT INTO bookmarks (title, url, description, category, subcategory, theme, favicon, color, icon, deleted_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertNote = db.prepare(`
    INSERT INTO notes (title, content, category, subcategory, theme, deleted_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertRel = db.prepare(`
    INSERT OR IGNORE INTO manual_relations (bookmark_id, note_id, notes, created_at)
    VALUES (?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    if (mode === 'overwrite') {
      db.prepare('DELETE FROM manual_relations').run();
      db.prepare('DELETE FROM item_tags').run();
      db.prepare('DELETE FROM tags').run();
      db.prepare('DELETE FROM bookmarks').run();
      db.prepare('DELETE FROM notes').run();
    }

    // Backup ids -> new ids. Relations are restored ONLY through these maps:
    // a raw backup id may belong to an unrelated item already in the database.
    const oldBmToNewId = new Map();
    const oldNoteToNewId = new Map();
    let relationCount = 0;

    for (const b of Array.isArray(bookmarks) ? bookmarks : []) {
      const bookmark = normalizeImportBookmark(b);
      const info = insertBookmark.run(
        bookmark.title,
        bookmark.url,
        bookmark.description,
        bookmark.category,
        bookmark.subcategory,
        bookmark.theme,
        bookmark.favicon,
        bookmark.color,
        bookmark.icon,
        importTimestamp(b?.deleted_at, null), // keep trashed items in the trash
        importTimestamp(b?.created_at, now),
        importTimestamp(b?.updated_at, now)
      );
      if (b?.id != null) oldBmToNewId.set(b.id, info.lastInsertRowid);
      if (Array.isArray(b?.tags)) setItemTags('bookmark', info.lastInsertRowid, b.tags);
    }

    for (const n of Array.isArray(notes) ? notes : []) {
      const note = normalizeImportNote(n);
      const info = insertNote.run(
        note.title,
        note.content,
        note.category,
        note.subcategory,
        note.theme,
        importTimestamp(n?.deleted_at, null),
        importTimestamp(n?.created_at, now),
        importTimestamp(n?.updated_at, now)
      );
      if (n?.id != null) oldNoteToNewId.set(n.id, info.lastInsertRowid);
      if (Array.isArray(n?.tags)) setItemTags('note', info.lastInsertRowid, n.tags);
    }

    for (const mr of Array.isArray(manualRelations) ? manualRelations : []) {
      const bookmarkId = oldBmToNewId.get(mr?.bookmark_id);
      const noteId = oldNoteToNewId.get(mr?.note_id);
      if (bookmarkId === undefined || noteId === undefined) continue;
      const notesText = typeof mr.notes === 'string' ? mr.notes : '';
      relationCount += insertRel.run(bookmarkId, noteId, notesText, importTimestamp(mr.created_at, now)).changes;
    }

    return {
      bookmarks: Array.isArray(bookmarks) ? bookmarks.length : 0,
      notes: Array.isArray(notes) ? notes.length : 0,
      relations: relationCount
    };
  });

  const counts = tx();

  return {
    success: true,
    ...counts,
    message: `Importación completada con éxito (${counts.bookmarks} marcadores, ${counts.notes} notas, ${counts.relations} vínculos)`
  };
});

/* =========================================================================
   IMPORT STANDARD BROWSER HTML BOOKMARKS (NETSCAPE FORMAT)
   ========================================================================= */

route('POST', '/backup/import-html', (req) => {
  const { htmlContent, defaultCategory = 'Navegador' } = req.body;
  if (typeof htmlContent !== 'string' || !htmlContent) {
    throw new HttpError(400, 'Contenido HTML requerido');
  }

  const resolvedCategory = typeof defaultCategory === 'string' ? defaultCategory.trim() : '';
  if (!resolvedCategory) {
    throw new HttpError(400, 'La categoría por defecto es requerida');
  }

  const now = new Date().toISOString();
  const insert = db.prepare(`
    INSERT INTO bookmarks (title, url, description, category, subcategory, theme, favicon, color, icon, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Re-importing the same export must not duplicate what is already saved.
  const knownUrls = new Set(db.prepare('SELECT url FROM bookmarks').all().map(r => r.url));
  let imported = 0;
  let skipped = 0;

  db.transaction(() => {
    for (const bm of parseNetscapeBookmarks(htmlContent)) {
      if (!isWebUrl(bm.url) || knownUrls.has(bm.url)) {
        skipped++;
        continue;
      }
      knownUrls.add(bm.url);
      insert.run(
        bm.title || 'Sin título',
        bm.url,
        'Importado desde marcadores del navegador',
        resolvedCategory,
        bm.folder || 'Importados', // the browser folder becomes the subcategory
        'Referencia Web',
        '',
        '#10b981',
        'bookmark',
        bm.addedAt || now,
        now
      );
      imported++;
    }
  })();

  return {
    success: true,
    count: imported,
    skipped,
    message: `Se importaron ${imported} marcadores exitosamente` +
      (skipped ? ` (${skipped} omitidos por duplicados o URL no válida).` : '.')
  };
});
