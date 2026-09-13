import { db } from './db.js';

/**
 * Builds the payload consumed by GET /api/taxonomy.
 *
 * Keeps the original taxonomy aggregations (categories, subcategories,
 * uniqueSubcategories, themes, uniqueThemes, tags) and adds a flat `items`
 * list of non-deleted bookmarks and notes, used by the sidebar tree leaves.
 *
 * Items are ordered by updated_at DESC, id DESC (most recently updated first).
 * Notes have no favicon/color/icon columns, so those fields are synthesized.
 */
export function buildTaxonomyPayload() {
  const categoriesRows = db.prepare(`
    SELECT DISTINCT category FROM (
      SELECT category FROM bookmarks WHERE category != '' AND deleted_at IS NULL
      UNION
      SELECT category FROM notes WHERE category != '' AND deleted_at IS NULL
    ) ORDER BY category COLLATE NOCASE ASC
  `).all();

  const subcategoriesRows = db.prepare(`
    SELECT DISTINCT subcategory, category FROM (
      SELECT subcategory, category FROM bookmarks WHERE subcategory != '' AND deleted_at IS NULL
      UNION
      SELECT subcategory, category FROM notes WHERE subcategory != '' AND deleted_at IS NULL
    ) ORDER BY subcategory COLLATE NOCASE ASC
  `).all();

  const themesRows = db.prepare(`
    SELECT DISTINCT theme, category, subcategory FROM (
      SELECT theme, category, subcategory FROM bookmarks WHERE theme != '' AND deleted_at IS NULL
      UNION
      SELECT theme, category, subcategory FROM notes WHERE theme != '' AND deleted_at IS NULL
    ) ORDER BY theme COLLATE NOCASE ASC
  `).all();

  const tagsRows = db.prepare(`
    SELECT t.name, COUNT(it.id) as count
    FROM tags t
    LEFT JOIN item_tags it ON it.tag_id = t.id
    LEFT JOIN bookmarks b ON it.item_type = 'bookmark' AND it.item_id = b.id AND b.deleted_at IS NULL
    LEFT JOIN notes n ON it.item_type = 'note' AND it.item_id = n.id AND n.deleted_at IS NULL
    WHERE (it.item_type = 'bookmark' AND b.id IS NOT NULL) OR (it.item_type = 'note' AND n.id IS NOT NULL)
    GROUP BY t.id
    ORDER BY count DESC, t.name ASC
  `).all();

  const itemsRows = db.prepare(`
    SELECT 'bookmark' AS type, id, title, url, favicon, icon, color, category, subcategory, theme, updated_at
    FROM bookmarks
    WHERE deleted_at IS NULL
    UNION ALL
    SELECT 'note' AS type, id, title, '' AS url, '' AS favicon, 'note' AS icon, '#10b981' AS color, category, subcategory, theme, updated_at
    FROM notes
    WHERE deleted_at IS NULL
    ORDER BY updated_at DESC, id DESC
  `).all();

  const items = itemsRows.map(({ updated_at, ...item }) => item);

  return {
    categories: categoriesRows.map(r => r.category),
    subcategories: subcategoriesRows.map(r => ({ subcategory: r.subcategory, category: r.category })),
    uniqueSubcategories: Array.from(new Set(subcategoriesRows.map(r => r.subcategory))),
    themes: themesRows.map(r => ({ theme: r.theme, category: r.category, subcategory: r.subcategory })),
    uniqueThemes: Array.from(new Set(themesRows.map(r => r.theme))),
    tags: tagsRows,
    items
  };
}
