export const BASE_URL = '/api';

/**
 * true in the GitHub Pages build (`vite build --mode pages`): there is no
 * server, the API runs inside the page on a SQLite database stored in this
 * browser. Features that need to reach other websites are unavailable.
 */
export const IS_BROWSER_BACKEND = import.meta.env.VITE_BACKEND === 'browser';

const loadBrowserBackend = () => import('./backend/browserBackend.js');

function abortError() {
  return new DOMException('The operation was aborted.', 'AbortError');
}

/**
 * Single API entry point: JSON in/out, and the server's own `error` message
 * surfaces to the UI instead of a generic one.
 *
 * @param {string} path API path after /api
 * @param {{method?: string, body?: unknown, signal?: AbortSignal, fallbackError: string}} options
 */
async function request(path, { method = 'GET', body, signal, fallbackError }) {
  if (IS_BROWSER_BACKEND) {
    if (signal?.aborted) throw abortError();
    const { dispatch } = await loadBrowserBackend();
    const { status, data } = await dispatch(method, path, body);
    // Same contract as fetch: a superseded request never delivers its result.
    if (signal?.aborted) throw abortError();
    if (status >= 400) throw new Error(data?.error || fallbackError);
    return data;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    signal,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || fallbackError);
  }
  return res.json();
}

function filterQuery(filters = {}) {
  const params = new URLSearchParams();
  for (const key of ['category', 'subcategory', 'theme', 'tag', 'q']) {
    if (filters[key]) params.append(key, filters[key]);
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

/* Library */

export const fetchStats = (signal) =>
  request('/stats', { signal, fallbackError: 'Error al cargar estadísticas' });

export const fetchTaxonomy = (signal) =>
  request('/taxonomy', { signal, fallbackError: 'Error al cargar taxonomías' });

export const fetchCrossRelations = (signal) =>
  request('/relations/matrix', { signal, fallbackError: 'Error al cargar matriz de relaciones' });

/* Bookmarks */

export const fetchBookmarks = (filters, signal) =>
  request(`/bookmarks${filterQuery(filters)}`, { signal, fallbackError: 'Error al cargar marcadores' });

export const fetchBookmarkById = (id) =>
  request(`/bookmarks/${id}`, { fallbackError: 'Error al cargar el marcador' });

export const fetchBookmarkRelated = (id) =>
  request(`/bookmarks/${id}/related`, { fallbackError: 'Error al cargar notas relacionadas' });

export const createBookmark = (data) =>
  request('/bookmarks', { method: 'POST', body: data, fallbackError: 'Error al crear marcador' });

export const updateBookmark = (id, data) =>
  request(`/bookmarks/${id}`, { method: 'PUT', body: data, fallbackError: 'Error al actualizar marcador' });

export const trashBookmark = (id) =>
  request(`/bookmarks/${id}/trash`, { method: 'POST', fallbackError: 'Error al mover marcador a la papelera' });

export const fetchBookmarkMetadata = (url) =>
  request('/bookmarks/metadata', { method: 'POST', body: { url }, fallbackError: 'Error al obtener metadatos de la URL' });

export const checkBookmarkHealth = (url) =>
  request('/bookmarks/check-health', { method: 'POST', body: { url }, fallbackError: 'Error al verificar estado del enlace' });

/* Notes */

export const fetchNotes = (filters, signal) =>
  request(`/notes${filterQuery(filters)}`, { signal, fallbackError: 'Error al cargar notas' });

export const fetchNoteById = (id) =>
  request(`/notes/${id}`, { fallbackError: 'Error al cargar la nota' });

export const fetchNoteRelated = (id) =>
  request(`/notes/${id}/related`, { fallbackError: 'Error al cargar marcadores relacionados' });

export const createNote = (data) =>
  request('/notes', { method: 'POST', body: data, fallbackError: 'Error al crear nota' });

export const updateNote = (id, data) =>
  request(`/notes/${id}`, { method: 'PUT', body: data, fallbackError: 'Error al actualizar nota' });

export const trashNote = (id) =>
  request(`/notes/${id}/trash`, { method: 'POST', fallbackError: 'Error al mover nota a la papelera' });

/* Manual relations */

export const linkRelation = (bookmarkId, noteId, notes = '') =>
  request('/relations/link', { method: 'POST', body: { bookmarkId, noteId, notes }, fallbackError: 'Error al vincular elemento' });

export const unlinkRelation = (bookmarkId, noteId) =>
  request('/relations/unlink', { method: 'DELETE', body: { bookmarkId, noteId }, fallbackError: 'Error al desvincular elemento' });

/* Trash */

export const fetchTrash = () =>
  request('/trash', { fallbackError: 'Error al obtener elementos de la papelera' });

export const restoreTrashItem = (type, id) =>
  request(`/trash/${type}/${id}/restore`, { method: 'POST', fallbackError: 'Error al restaurar elemento' });

export const destroyTrashItem = (type, id) =>
  request(`/trash/${type}/${id}`, { method: 'DELETE', fallbackError: 'Error al eliminar definitivamente' });

export const emptyTrash = () =>
  request('/trash', { method: 'DELETE', fallbackError: 'Error al vaciar papelera' });

/* Backup */

/** Downloads a full JSON backup (same file format in both modes). */
export async function downloadBackup() {
  if (!IS_BROWSER_BACKEND) {
    window.location.href = `${BASE_URL}/backup/export`;
    return;
  }
  const { backupFileName } = await loadBrowserBackend();
  const data = await request('/backup/export', { fallbackError: 'Error al exportar el backup' });
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = backupFileName();
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Where the data lives, for the settings page. */
export async function fetchStorageInfo() {
  if (!IS_BROWSER_BACKEND) return { kind: 'server', persistent: true, error: null };
  const { storageStatus } = await loadBrowserBackend();
  return { kind: 'browser', ...storageStatus };
}

export const importBackup = (backupData, mode = 'append') =>
  request('/backup/import', { method: 'POST', body: { ...backupData, mode }, fallbackError: 'Error al importar backup' });

export const importHtmlBookmarks = (htmlContent, defaultCategory = 'Navegador') =>
  request('/backup/import-html', { method: 'POST', body: { htmlContent, defaultCategory }, fallbackError: 'Error al importar archivo HTML' });
