/**
 * Pure input resolvers for bookmark and note writes.
 *
 * They normalize (trim) text fields, keep existing values on partial updates,
 * reject non-string payloads with a Spanish message, apply empty-value
 * fallbacks and enforce the required-field invariant so no write path can
 * persist a blank title, url, content or category.
 */

const BOOKMARK_FIELD_LABELS = {
  title: 'Título',
  url: 'URL',
  description: 'Descripción',
  category: 'Categoría',
  subcategory: 'Subcategoría',
  theme: 'Tema',
  favicon: 'Favicon',
  color: 'Color',
  icon: 'Icono'
};

const NOTE_FIELD_LABELS = {
  title: 'Título',
  content: 'Contenido',
  category: 'Categoría',
  subcategory: 'Subcategoría',
  theme: 'Tema'
};

const BOOKMARK_EMPTY_DEFAULTS = {
  description: '',
  subcategory: '',
  theme: '',
  favicon: '',
  color: '#10b981',
  icon: 'bookmark'
};

const NOTE_EMPTY_DEFAULTS = {
  subcategory: '',
  theme: ''
};

/**
 * Resolve a single text field.
 * - undefined keeps existing[field] when an existing row is given, else ''
 * - non-strings are rejected without throwing
 * - strings are trimmed
 */
function resolveTextField(raw, existing, field, labels) {
  let value;
  if (raw === undefined) {
    const current = existing ? existing[field] : undefined;
    value = current === undefined || current === null ? '' : String(current);
  } else {
    if (typeof raw !== 'string') {
      return { ok: false, error: `El campo ${labels[field]} debe ser un texto` };
    }
    value = raw;
  }
  return { ok: true, value: value.trim() };
}

function resolveFields(source, existing, fields, labels, emptyDefaults) {
  const values = {};
  for (const field of fields) {
    const raw = field === 'theme' ? (source.theme ?? source.reason) : source[field];
    const result = resolveTextField(raw, existing, field, labels);
    if (!result.ok) return result;
    values[field] = result.value;
  }

  for (const [field, fallback] of Object.entries(emptyDefaults)) {
    if (!values[field]) values[field] = fallback;
  }

  return { ok: true, values };
}

/**
 * @param {object} body request body
 * @param {object|null} existing current row for partial updates
 * @returns {{ok: true, values: object} | {ok: false, error: string}}
 */
export function resolveBookmarkInput(body = {}, existing = null) {
  const source = body || {};
  const result = resolveFields(
    source,
    existing,
    ['title', 'url', 'description', 'category', 'subcategory', 'theme', 'favicon', 'color', 'icon'],
    BOOKMARK_FIELD_LABELS,
    BOOKMARK_EMPTY_DEFAULTS
  );
  if (!result.ok) return result;

  const { title, url, category } = result.values;
  if (!title || !url || !category) {
    return { ok: false, error: 'Título, URL y Categoría son requeridos' };
  }

  return { ok: true, values: result.values };
}

/**
 * @param {object} body request body
 * @param {object|null} existing current row for partial updates
 * @returns {{ok: true, values: object} | {ok: false, error: string}}
 */
export function resolveNoteInput(body = {}, existing = null) {
  const source = body || {};
  const result = resolveFields(
    source,
    existing,
    ['title', 'content', 'category', 'subcategory', 'theme'],
    NOTE_FIELD_LABELS,
    NOTE_EMPTY_DEFAULTS
  );
  if (!result.ok) return result;

  const { title, content, category } = result.values;
  if (!title || !content || !category) {
    return { ok: false, error: 'Título, Contenido y Categoría son requeridos' };
  }

  return { ok: true, values: result.values };
}

/**
 * Internal trim primitive for restore input.
 * Non-string values (undefined, null, numbers, objects) are treated as absent.
 */
function trimImportText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Policy split: interactive writes versus restores.
 *
 * The resolvers above are STRICT: a blank required field is rejected with a 400
 * so no interactive client can persist an invisible item.
 *
 * The normalizers below are PERMISSIVE on purpose: a restore must never
 * silently drop a backup row, so every text field is trimmed and defaults are
 * applied instead. The one absolute invariant shared by both paths is a
 * non-blank category, because a blank category makes an item unreachable from
 * the taxonomy tree. This is a deliberate two-path design, not duplicated logic.
 */

/**
 * Normalize a single bookmark row from a JSON backup restore.
 * Never drops the row: title and category always fall back to a non-blank value.
 * url, description, subcategory, theme and favicon may legitimately stay empty.
 *
 * @param {object} row raw bookmark entry from the backup file
 * @returns {{title: string, url: string, description: string, category: string, subcategory: string, theme: string, favicon: string, color: string, icon: string}}
 */
export function normalizeImportBookmark(row = {}) {
  const source = row || {};
  const theme = source.theme ?? source.reason;
  return {
    title: trimImportText(source.title) || 'Sin título',
    url: trimImportText(source.url),
    description: trimImportText(source.description),
    category: trimImportText(source.category) || 'General',
    subcategory: trimImportText(source.subcategory),
    theme: trimImportText(theme),
    favicon: trimImportText(source.favicon),
    color: trimImportText(source.color) || '#10b981',
    icon: trimImportText(source.icon) || 'bookmark'
  };
}

/**
 * Normalize a single note row from a JSON backup restore.
 * Never drops the row: title and category always fall back to a non-blank value.
 * content, subcategory and theme may legitimately stay empty in an old backup.
 *
 * @param {object} row raw note entry from the backup file
 * @returns {{title: string, content: string, category: string, subcategory: string, theme: string}}
 */
export function normalizeImportNote(row = {}) {
  const source = row || {};
  const theme = source.theme ?? source.reason;
  return {
    title: trimImportText(source.title) || 'Sin título',
    content: trimImportText(source.content),
    category: trimImportText(source.category) || 'General',
    subcategory: trimImportText(source.subcategory),
    theme: trimImportText(theme)
  };
}
