import express from 'express';
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
import { parseNetscapeBookmarks, decodeHtmlEntities } from './netscapeParser.js';
import {
  resolveBookmarkInput,
  resolveNoteInput,
  normalizeImportBookmark,
  normalizeImportNote,
  isWebUrl
} from './itemValidation.js';

const router = express.Router();

// Escapes LIKE wildcards so a search for "100%" or "snake_case" is literal.
// Paired with ESCAPE '\\' in the queries below.
function likeTerm(q) {
  return `%${q.trim().replace(/[\\%_]/g, ch => `\\${ch}`)}%`;
}

function googleFavicon(url) {
  try {
    return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`;
  } catch {
    return '';
  }
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

/* =========================================================================
   TAXONOMY & STATS
   ========================================================================= */

router.get('/taxonomy', (req, res) => {
  try {
    res.json(buildTaxonomyPayload());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/stats', (req, res) => {
  try {
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

    res.json({
      totalBookmarks,
      totalNotes,
      totalCategories,
      totalTags,
      totalManualRelations,
      trashCount,
      recentActivity,
      categoryBreakdown
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =========================================================================
   BOOKMARKS CRUD
   ========================================================================= */

router.get('/bookmarks', (req, res) => {
  try {
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
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/bookmarks/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM bookmarks WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Marcador no encontrado' });
    res.json(enrichBookmark(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/bookmarks/:id/related', (req, res) => {
  try {
    const related = getRelatedNotesForBookmark(req.params.id);
    res.json(related);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/bookmarks', (req, res) => {
  try {
    const { tags } = req.body;
    const resolved = resolveBookmarkInput(req.body);
    if (!resolved.ok) {
      return res.status(400).json({ error: resolved.error });
    }
    const { title, url, description, category, subcategory, theme, favicon, color, icon } = resolved.values;

    const now = new Date().toISOString();
    const autoFavicon = favicon || googleFavicon(url);

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
        autoFavicon,
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
    res.status(201).json(enrichBookmark(created));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/bookmarks/:id', (req, res) => {
  try {
    const { tags } = req.body;
    const existing = db.prepare('SELECT * FROM bookmarks WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Marcador no encontrado' });

    const resolved = resolveBookmarkInput(req.body, existing);
    if (!resolved.ok) {
      return res.status(400).json({ error: resolved.error });
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
    res.json(enrichBookmark(updated));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/bookmarks/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT id FROM bookmarks WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Marcador no encontrado' });

    // One transaction: a failure must never leave the item alive without its tags,
    // nor a tag link pointing at an item that no longer exists.
    db.transaction(() => {
      removeItemTags('bookmark', req.params.id);
      db.prepare('DELETE FROM bookmarks WHERE id = ?').run(req.params.id);
    })();
    res.json({ success: true, message: 'Marcador eliminado definitivamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/bookmarks/:id/trash', (req, res) => {
  try {
    const existing = db.prepare('SELECT id FROM bookmarks WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Marcador no encontrado' });

    const now = new Date().toISOString();
    db.prepare('UPDATE bookmarks SET deleted_at = ? WHERE id = ?').run(now, req.params.id);
    res.json({ success: true, message: 'Marcador movido a la papelera' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =========================================================================
   NOTES CRUD
   ========================================================================= */

router.get('/notes', (req, res) => {
  try {
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
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/notes/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Nota no encontrada' });
    res.json(enrichNote(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/notes/:id/related', (req, res) => {
  try {
    const related = getRelatedBookmarksForNote(req.params.id);
    res.json(related);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/notes', (req, res) => {
  try {
    const { tags } = req.body;
    const resolved = resolveNoteInput(req.body);
    if (!resolved.ok) {
      return res.status(400).json({ error: resolved.error });
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
    res.status(201).json(enrichNote(created));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/notes/:id', (req, res) => {
  try {
    const { tags } = req.body;
    const existing = db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Nota no encontrada' });

    const resolved = resolveNoteInput(req.body, existing);
    if (!resolved.ok) {
      return res.status(400).json({ error: resolved.error });
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
    res.json(enrichNote(updated));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/notes/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT id FROM notes WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Nota no encontrada' });

    // One transaction: a failure must never leave the item alive without its tags,
    // nor a tag link pointing at an item that no longer exists.
    db.transaction(() => {
      removeItemTags('note', req.params.id);
      db.prepare('DELETE FROM notes WHERE id = ?').run(req.params.id);
    })();
    res.json({ success: true, message: 'Nota eliminada definitivamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/notes/:id/trash', (req, res) => {
  try {
    const existing = db.prepare('SELECT id FROM notes WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Nota no encontrada' });

    const now = new Date().toISOString();
    db.prepare('UPDATE notes SET deleted_at = ? WHERE id = ?').run(now, req.params.id);
    res.json({ success: true, message: 'Nota movida a la papelera' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =========================================================================
   TRASH & RECYCLE BIN
   ========================================================================= */

// Whitelist: the table name is interpolated into SQL, never taken from input.
const TRASH_TABLES = { bookmark: 'bookmarks', note: 'notes' };

router.get('/trash', (req, res) => {
  try {
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
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/trash/:type/:id/restore', (req, res) => {
  try {
    const { type, id } = req.params;
    const table = TRASH_TABLES[type];
    if (!table) return res.status(400).json({ error: 'Tipo inválido' });

    const { changes } = db
      .prepare(`UPDATE ${table} SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL`)
      .run(id);
    if (changes === 0) return res.status(404).json({ error: 'Elemento no encontrado en la papelera' });
    res.json({ success: true, message: 'Elemento restaurado con éxito' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/trash/:type/:id', (req, res) => {
  try {
    const { type, id } = req.params;
    const table = TRASH_TABLES[type];
    if (!table) return res.status(400).json({ error: 'Tipo inválido' });

    const changes = db.transaction(() => {
      const result = db.prepare(`DELETE FROM ${table} WHERE id = ? AND deleted_at IS NOT NULL`).run(id);
      if (result.changes > 0) removeItemTags(type, id);
      return result.changes;
    })();
    if (changes === 0) return res.status(404).json({ error: 'Elemento no encontrado en la papelera' });
    res.json({ success: true, message: 'Elemento eliminado definitivamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/trash', (req, res) => {
  try {
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
    res.json({ success: true, message: 'Papelera vaciada por completo' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =========================================================================
   MANUAL RELATIONS & CROSS MATRIX
   ========================================================================= */

router.get('/relations/matrix', (req, res) => {
  try {
    const relations = getAllCrossRelations();
    res.json(relations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/relations/link', (req, res) => {
  try {
    const { bookmarkId, noteId, notes } = req.body;
    if (!bookmarkId || !noteId) {
      return res.status(400).json({ error: 'bookmarkId y noteId son requeridos' });
    }

    const bookmarkExists = db.prepare('SELECT 1 FROM bookmarks WHERE id = ?').get(bookmarkId);
    const noteExists = db.prepare('SELECT 1 FROM notes WHERE id = ?').get(noteId);
    if (!bookmarkExists || !noteExists) {
      return res.status(404).json({ error: 'Marcador o nota no encontrados' });
    }

    const now = new Date().toISOString();
    const stmt = db.prepare(`
      INSERT INTO manual_relations (bookmark_id, note_id, notes, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(bookmark_id, note_id) DO UPDATE SET notes = excluded.notes
    `);

    stmt.run(bookmarkId, noteId, typeof notes === 'string' ? notes.trim() : '', now);
    res.json({ success: true, message: 'Vínculo establecido con éxito' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/relations/unlink', (req, res) => {
  try {
    const { bookmarkId, noteId } = req.body;
    if (!bookmarkId || !noteId) {
      return res.status(400).json({ error: 'bookmarkId y noteId son requeridos' });
    }

    db.prepare('DELETE FROM manual_relations WHERE bookmark_id = ? AND note_id = ?').run(bookmarkId, noteId);
    res.json({ success: true, message: 'Vínculo eliminado con éxito' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =========================================================================
   BACKUP: EXPORT & IMPORT JSON
   ========================================================================= */

router.get('/backup/export', (req, res) => {
  try {
    const bookmarks = enrichBookmarksBatch(db.prepare('SELECT * FROM bookmarks ORDER BY id ASC').all());
    const notes = enrichNotesBatch(db.prepare('SELECT * FROM notes ORDER BY id ASC').all());
    const manualRelations = db.prepare('SELECT * FROM manual_relations').all();
    const tags = db.prepare('SELECT * FROM tags').all();

    const backupData = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      bookmarks,
      notes,
      manualRelations,
      tags
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="marcadores_y_notas_backup_${Date.now()}.json"`);
    res.send(JSON.stringify(backupData, null, 2));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/backup/import', (req, res) => {
  try {
    const { bookmarks, notes, manualRelations, mode = 'append' } = req.body;

    if (!Array.isArray(bookmarks) && !Array.isArray(notes)) {
      return res.status(400).json({ error: 'Formato inválido de archivo JSON de backup' });
    }
    if (mode !== 'append' && mode !== 'overwrite') {
      return res.status(400).json({ error: 'Modo de importación inválido' });
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

    res.json({
      success: true,
      ...counts,
      message: `Importación completada con éxito (${counts.bookmarks} marcadores, ${counts.notes} notas, ${counts.relations} vínculos)`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =========================================================================
   METADATA EXTRACTOR (OPENGRAPH & TITLE)
   ========================================================================= */

// Title and description live in <head>; reading the first 512 KB is plenty and
// stops a link to a huge file from being loaded into memory.
const METADATA_MAX_BYTES = 512 * 1024;

async function readTextUpTo(response, maxBytes) {
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  while (received < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
  }
  await reader.cancel().catch(() => {});
  return new TextDecoder().decode(Buffer.concat(chunks).subarray(0, maxBytes));
}

router.post('/bookmarks/metadata', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL es requerida' });

    if (!isWebUrl(url)) {
      return res.status(400).json({ error: 'URL inválida' });
    }
    const parsedUrl = new URL(url);

    let title = '';
    let description = '';
    const favicon = googleFavicon(url);

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(5000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });

      const contentType = response.headers.get('content-type') || '';
      if (response.ok && contentType.includes('html')) {
        const html = await readTextUpTo(response, METADATA_MAX_BYTES);

        // Extract title
        const ogTitleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i) ||
                             html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:title["']/i);
        if (ogTitleMatch) {
          title = ogTitleMatch[1];
        } else {
          const titleTagMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
          if (titleTagMatch) title = titleTagMatch[1];
        }

        // Extract description
        const ogDescMatch = html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i) ||
                            html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:description["']/i) ||
                            html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i);
        if (ogDescMatch) {
          description = ogDescMatch[1];
        }
      }
    } catch {
      // Fallback if fetch times out or blocked by CORS
    }

    // Fallback title to hostname if empty
    if (!title) {
      title = parsedUrl.hostname.replace(/^www\./, '');
    }

    res.json({
      title: decodeHtmlEntities(title).trim(),
      description: decodeHtmlEntities(description).trim(),
      favicon
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =========================================================================
   HEALTH CHECK FOR URL
   ========================================================================= */

router.post('/bookmarks/check-health', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL requerida' });
    if (!isWebUrl(url)) return res.status(400).json({ error: 'URL inválida' });

    const startTime = Date.now();
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000),
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const latency = Date.now() - startTime;
      res.json({
        alive: response.ok || response.status < 400,
        status: response.status,
        statusText: response.statusText,
        latencyMs: latency
      });
    } catch {
      // Retry with GET if HEAD was rejected
      try {
        const getRes = await fetch(url, {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const latency = Date.now() - startTime;
        res.json({
          alive: getRes.ok || getRes.status < 400,
          status: getRes.status,
          statusText: getRes.statusText,
          latencyMs: latency
        });
      } catch (e) {
        res.json({
          alive: false,
          status: 0,
          statusText: e.message || 'Error de conexión / Timeout',
          latencyMs: Date.now() - startTime
        });
      }
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =========================================================================
   IMPORT STANDARD BROWSER HTML BOOKMARKS (NETSCAPE FORMAT)
   ========================================================================= */

router.post('/backup/import-html', (req, res) => {
  try {
    const { htmlContent, defaultCategory = 'Navegador' } = req.body;
    if (typeof htmlContent !== 'string' || !htmlContent) {
      return res.status(400).json({ error: 'Contenido HTML requerido' });
    }

    const resolvedCategory = typeof defaultCategory === 'string' ? defaultCategory.trim() : '';
    if (!resolvedCategory) {
      return res.status(400).json({ error: 'La categoría por defecto es requerida' });
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
          googleFavicon(bm.url),
          '#10b981',
          'bookmark',
          bm.addedAt || now,
          now
        );
        imported++;
      }
    })();

    res.json({
      success: true,
      count: imported,
      skipped,
      message: `Se importaron ${imported} marcadores exitosamente` +
        (skipped ? ` (${skipped} omitidos por duplicados o URL no válida).` : '.')
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
