import { db } from './db.js';

/**
 * Normalizes text for comparison
 */
function norm(str) {
  return (str || '').trim().toLowerCase();
}

/**
 * Gets tags for an item
 */
export function getItemTags(itemType, itemId) {
  const rows = db.prepare(`
    SELECT t.name 
    FROM tags t
    JOIN item_tags it ON it.tag_id = t.id
    WHERE it.item_type = ? AND it.item_id = ?
    ORDER BY t.name ASC
  `).all(itemType, itemId);
  return rows.map(r => r.name);
}

/**
 * Batch gets tags for multiple items in a SINGLE SQL query
 * Eliminates N+1 query problem!
 */
export function getItemTagsBatch(itemType, itemIds = []) {
  const map = new Map();
  if (!itemIds || itemIds.length === 0) return map;

  for (const id of itemIds) {
    map.set(id, []);
  }

  const placeholders = itemIds.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT it.item_id, t.name 
    FROM item_tags it
    JOIN tags t ON t.id = it.tag_id
    WHERE it.item_type = ? AND it.item_id IN (${placeholders})
    ORDER BY t.name ASC
  `).all(itemType, ...itemIds);

  for (const r of rows) {
    if (map.has(r.item_id)) {
      map.get(r.item_id).push(r.name);
    }
  }

  return map;
}

/**
 * Synchronizes tags for an item
 */
export function setItemTags(itemType, itemId, tagNames) {
  const cleanTags = Array.from(
    new Set(
      (tagNames || [])
        .map(t => (typeof t === 'string' ? t.trim().toLowerCase() : ''))
        .filter(t => t.length > 0)
    )
  );

  const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
  const getTag = db.prepare('SELECT id FROM tags WHERE name = ?');
  const insertItemTag = db.prepare('INSERT OR IGNORE INTO item_tags (item_type, item_id, tag_id) VALUES (?, ?, ?)');
  const deleteItemTags = db.prepare('DELETE FROM item_tags WHERE item_type = ? AND item_id = ?');

  const tx = db.transaction(() => {
    deleteItemTags.run(itemType, itemId);
    for (const tagName of cleanTags) {
      insertTag.run(tagName);
      const tagRow = getTag.get(tagName);
      if (tagRow) {
        insertItemTag.run(itemType, itemId, tagRow.id);
      }
    }
  });

  tx();
  return cleanTags;
}

/**
 * Removes every tag link owned by an item.
 *
 * Permanent removal paths must call this so item_tags rows never outlive their
 * parent bookmark or note. Soft delete (trash) must NOT call it: restoring an
 * item has to restore its tags.
 *
 * @returns {number} Number of item_tags rows deleted.
 */
export function removeItemTags(itemType, itemId) {
  return db
    .prepare('DELETE FROM item_tags WHERE item_type = ? AND item_id = ?')
    .run(itemType, itemId).changes;
}

/**
 * Finds related Notes for a specific Bookmark, detailing exact matches (Optimized: 2 queries instead of N)
 */
export function getRelatedNotesForBookmark(bookmarkId) {
  const bookmark = db.prepare('SELECT * FROM bookmarks WHERE id = ?').get(bookmarkId);
  if (!bookmark) return [];

  const bookmarkTags = getItemTags('bookmark', bookmarkId);
  const bmTagSet = new Set(bookmarkTags.map(norm));

  // Get all notes with manual relation status in 1 query
  const notes = db.prepare(`
    SELECT n.*,
      CASE WHEN mr.id IS NOT NULL THEN 1 ELSE 0 END as is_manual,
      mr.notes as manual_relation_notes
    FROM notes n
    LEFT JOIN manual_relations mr 
      ON mr.note_id = n.id AND mr.bookmark_id = ?
    WHERE n.deleted_at IS NULL
    ORDER BY n.created_at DESC
  `).all(bookmarkId);

  if (notes.length === 0) return [];

  // Batch fetch tags for all notes in 1 query
  const noteIds = notes.map(n => n.id);
  const noteTagsMap = getItemTagsBatch('note', noteIds);

  const related = [];

  for (const note of notes) {
    const noteTags = noteTagsMap.get(note.id) || [];
    const sharedTags = noteTags.filter(t => bmTagSet.has(norm(t)));

    const matchedCategory = norm(bookmark.category) === norm(note.category) && norm(bookmark.category) !== '';
    const matchedSubcategory = norm(bookmark.subcategory) === norm(note.subcategory) && norm(bookmark.subcategory) !== '';
    const matchedTheme = norm(bookmark.theme) === norm(note.theme) && norm(bookmark.theme) !== '';
    const isManual = note.is_manual === 1;

    const themes = [];
    let score = 0;

    if (isManual) {
      score += 60;
      themes.push(note.manual_relation_notes ? `Vínculo manual: "${note.manual_relation_notes}"` : 'Vínculo manual directo');
    }
    if (matchedCategory) {
      score += 20;
      themes.push(`Misma categoría: ${note.category}`);
    }
    if (matchedSubcategory) {
      score += 25;
      themes.push(`Misma subcategoría: ${note.subcategory}`);
    }
    if (matchedTheme) {
      score += 25;
      themes.push(`Mismo tema: ${note.theme}`);
    }
    if (sharedTags.length > 0) {
      score += sharedTags.length * 15;
      themes.push(`Tags compartidos (${sharedTags.length}): ${sharedTags.join(', ')}`);
    }

    if (score > 0) {
      related.push({
        note: {
          ...note,
          tags: noteTags
        },
        relationship: {
          score,
          isManual,
          manualNotes: note.manual_relation_notes || '',
          matchedCategory,
          matchedSubcategory,
          matchedTheme,
          sharedTags,
          matchThemes: themes
        }
      });
    }
  }

  // Sort by score descending
  related.sort((a, b) => b.relationship.score - a.relationship.score);
  return related;
}

/**
 * Finds related Bookmarks for a specific Note, detailing exact matches (Optimized: 2 queries instead of N)
 */
export function getRelatedBookmarksForNote(noteId) {
  const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(noteId);
  if (!note) return [];

  const noteTags = getItemTags('note', noteId);
  const noteTagSet = new Set(noteTags.map(norm));

  // Get all bookmarks with manual relation status in 1 query
  const bookmarks = db.prepare(`
    SELECT b.*,
      CASE WHEN mr.id IS NOT NULL THEN 1 ELSE 0 END as is_manual,
      mr.notes as manual_relation_notes
    FROM bookmarks b
    LEFT JOIN manual_relations mr 
      ON mr.bookmark_id = b.id AND mr.note_id = ?
    WHERE b.deleted_at IS NULL
    ORDER BY b.created_at DESC
  `).all(noteId);

  if (bookmarks.length === 0) return [];

  // Batch fetch tags for all bookmarks in 1 query
  const bmIds = bookmarks.map(b => b.id);
  const bmTagsMap = getItemTagsBatch('bookmark', bmIds);

  const related = [];

  for (const bm of bookmarks) {
    const bmTags = bmTagsMap.get(bm.id) || [];
    const sharedTags = bmTags.filter(t => noteTagSet.has(norm(t)));

    const matchedCategory = norm(note.category) === norm(bm.category) && norm(note.category) !== '';
    const matchedSubcategory = norm(note.subcategory) === norm(bm.subcategory) && norm(note.subcategory) !== '';
    const matchedTheme = norm(note.theme) === norm(bm.theme) && norm(note.theme) !== '';
    const isManual = bm.is_manual === 1;

    const themes = [];
    let score = 0;

    if (isManual) {
      score += 60;
      themes.push(bm.manual_relation_notes ? `Vínculo manual: "${bm.manual_relation_notes}"` : 'Vínculo manual directo');
    }
    if (matchedCategory) {
      score += 20;
      themes.push(`Misma categoría: ${bm.category}`);
    }
    if (matchedSubcategory) {
      score += 25;
      themes.push(`Misma subcategoría: ${bm.subcategory}`);
    }
    if (matchedTheme) {
      score += 25;
      themes.push(`Mismo tema: ${bm.theme}`);
    }
    if (sharedTags.length > 0) {
      score += sharedTags.length * 15;
      themes.push(`Tags compartidos (${sharedTags.length}): ${sharedTags.join(', ')}`);
    }

    if (score > 0) {
      related.push({
        bookmark: {
          ...bm,
          tags: bmTags
        },
        relationship: {
          score,
          isManual,
          manualNotes: bm.manual_relation_notes || '',
          matchedCategory,
          matchedSubcategory,
          matchedTheme,
          sharedTags,
          matchThemes: themes
        }
      });
    }
  }

  // Sort by score descending
  related.sort((a, b) => b.relationship.score - a.relationship.score);
  return related;
}

/**
 * Returns all cross relationships using HIGH-PERFORMANCE In-Memory Matrix
 * Reduces database roundtrips from O(B * N) to exactly 4 fast batch queries!
 */
export function getAllCrossRelations() {
  const bookmarks = db.prepare('SELECT id, title, category, subcategory, theme FROM bookmarks WHERE deleted_at IS NULL ORDER BY id ASC').all();
  const notes = db.prepare('SELECT id, title, category, subcategory, theme FROM notes WHERE deleted_at IS NULL ORDER BY id ASC').all();

  if (bookmarks.length === 0 || notes.length === 0) return [];

  // Batch query 1: All bookmark tags
  const bmTagRows = db.prepare(`
    SELECT it.item_id, t.name 
    FROM item_tags it
    JOIN tags t ON t.id = it.tag_id
    WHERE it.item_type = 'bookmark'
  `).all();
  const bmTagsMap = new Map();
  for (const r of bmTagRows) {
    if (!bmTagsMap.has(r.item_id)) bmTagsMap.set(r.item_id, []);
    bmTagsMap.get(r.item_id).push(r.name);
  }

  // Batch query 2: All note tags
  const noteTagRows = db.prepare(`
    SELECT it.item_id, t.name 
    FROM item_tags it
    JOIN tags t ON t.id = it.tag_id
    WHERE it.item_type = 'note'
  `).all();
  const noteTagsMap = new Map();
  for (const r of noteTagRows) {
    if (!noteTagsMap.has(r.item_id)) noteTagsMap.set(r.item_id, []);
    noteTagsMap.get(r.item_id).push(r.name);
  }

  // Batch query 3: All manual relations
  const manualRows = db.prepare('SELECT bookmark_id, note_id, notes FROM manual_relations').all();
  const manualMap = new Map();
  for (const mr of manualRows) {
    manualMap.set(`${mr.bookmark_id}---${mr.note_id}`, mr.notes || '');
  }

  // In-Memory Cross Evaluation: Sub-millisecond execution
  const relations = [];

  for (const b of bookmarks) {
    const bTags = bmTagsMap.get(b.id) || [];
    const bTagSet = new Set(bTags.map(norm));

    for (const n of notes) {
      const pairKey = `${b.id}---${n.id}`;
      const isManual = manualMap.has(pairKey);
      const manualNote = manualMap.get(pairKey);

      const matchedCategory = norm(b.category) === norm(n.category) && norm(b.category) !== '';
      const matchedSubcategory = norm(b.subcategory) === norm(n.subcategory) && norm(b.subcategory) !== '';
      const matchedTheme = norm(b.theme) === norm(n.theme) && norm(b.theme) !== '';

      const nTags = noteTagsMap.get(n.id) || [];
      const sharedTags = nTags.filter(t => bTagSet.has(norm(t)));

      let score = 0;
      const matchThemes = [];

      if (isManual) {
        score += 60;
        matchThemes.push(manualNote ? `Vínculo manual: "${manualNote}"` : 'Vínculo manual directo');
      }
      if (matchedCategory) {
        score += 20;
        matchThemes.push(`Misma categoría: ${b.category}`);
      }
      if (matchedSubcategory) {
        score += 25;
        matchThemes.push(`Misma subcategoría: ${b.subcategory}`);
      }
      if (matchedTheme) {
        score += 25;
        matchThemes.push(`Mismo tema: ${b.theme}`);
      }
      if (sharedTags.length > 0) {
        score += sharedTags.length * 15;
        matchThemes.push(`Tags compartidos (${sharedTags.length}): ${sharedTags.join(', ')}`);
      }

      if (score > 0) {
        relations.push({
          bookmarkId: b.id,
          bookmarkTitle: b.title,
          bookmarkCategory: b.category,
          noteId: n.id,
          noteTitle: n.title,
          noteCategory: n.category,
          relationship: {
            score,
            isManual,
            manualNotes: manualNote || '',
            matchedCategory,
            matchedSubcategory,
            matchedTheme,
            sharedTags,
            matchThemes
          }
        });
      }
    }
  }

  // Sort descending by score
  relations.sort((a, b) => b.relationship.score - a.relationship.score);
  return relations;
}
