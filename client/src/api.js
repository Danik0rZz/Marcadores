export const BASE_URL = '/api';
export const API_BASE_URL = BASE_URL;

export async function fetchStats() {
  const res = await fetch(`${BASE_URL}/stats`);
  if (!res.ok) throw new Error('Error al cargar estadísticas');
  return res.json();
}

export async function fetchTaxonomy() {
  const res = await fetch(`${BASE_URL}/taxonomy`);
  if (!res.ok) throw new Error('Error al cargar taxonomías');
  return res.json();
}

export async function fetchBookmarks(filters = {}) {
  const params = new URLSearchParams();
  if (filters.category) params.append('category', filters.category);
  if (filters.subcategory) params.append('subcategory', filters.subcategory);
  if (filters.theme) params.append('theme', filters.theme);
  if (filters.tag) params.append('tag', filters.tag);
  if (filters.q) params.append('q', filters.q);

  const res = await fetch(`${BASE_URL}/bookmarks?${params.toString()}`);
  if (!res.ok) throw new Error('Error al cargar marcadores');
  return res.json();
}

export async function fetchBookmarkRelated(id) {
  const res = await fetch(`${BASE_URL}/bookmarks/${id}/related`);
  if (!res.ok) throw new Error('Error al cargar notas relacionadas');
  return res.json();
}

export async function fetchBookmarkById(id) {
  const res = await fetch(`${BASE_URL}/bookmarks/${id}`);
  if (!res.ok) throw new Error('Error al cargar el marcador');
  return res.json();
}

export async function createBookmark(data) {
  const res = await fetch(`${BASE_URL}/bookmarks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Error al crear marcador');
  }
  return res.json();
}

export async function updateBookmark(id, data) {
  const res = await fetch(`${BASE_URL}/bookmarks/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Error al actualizar marcador');
  }
  return res.json();
}

export async function deleteBookmark(id) {
  const res = await fetch(`${BASE_URL}/bookmarks/${id}`, {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error('Error al eliminar marcador');
  return res.json();
}

export async function fetchNotes(filters = {}) {
  const params = new URLSearchParams();
  if (filters.category) params.append('category', filters.category);
  if (filters.subcategory) params.append('subcategory', filters.subcategory);
  if (filters.theme) params.append('theme', filters.theme);
  if (filters.tag) params.append('tag', filters.tag);
  if (filters.q) params.append('q', filters.q);

  const res = await fetch(`${BASE_URL}/notes?${params.toString()}`);
  if (!res.ok) throw new Error('Error al cargar notas');
  return res.json();
}

export async function fetchNoteRelated(id) {
  const res = await fetch(`${BASE_URL}/notes/${id}/related`);
  if (!res.ok) throw new Error('Error al cargar marcadores relacionados');
  return res.json();
}

export async function fetchNoteById(id) {
  const res = await fetch(`${BASE_URL}/notes/${id}`);
  if (!res.ok) throw new Error('Error al cargar la nota');
  return res.json();
}

export async function createNote(data) {
  const res = await fetch(`${BASE_URL}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Error al crear nota');
  }
  return res.json();
}

export async function updateNote(id, data) {
  const res = await fetch(`${BASE_URL}/notes/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Error al actualizar nota');
  }
  return res.json();
}

export async function deleteNote(id) {
  const res = await fetch(`${BASE_URL}/notes/${id}`, {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error('Error al eliminar nota');
  return res.json();
}

export async function fetchCrossRelations() {
  const res = await fetch(`${BASE_URL}/relations/matrix`);
  if (!res.ok) throw new Error('Error al cargar matriz de relaciones');
  return res.json();
}

export async function linkRelation(bookmarkId, noteId, notes = '') {
  const res = await fetch(`${BASE_URL}/relations/link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookmarkId, noteId, notes })
  });
  if (!res.ok) throw new Error('Error al vincular elemento');
  return res.json();
}

export async function unlinkRelation(bookmarkId, noteId) {
  const res = await fetch(`${BASE_URL}/relations/unlink`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookmarkId, noteId })
  });
  if (!res.ok) throw new Error('Error al desvincular elemento');
  return res.json();
}

export async function fetchBookmarkMetadata(url) {
  const res = await fetch(`${BASE_URL}/bookmarks/metadata`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  });
  if (!res.ok) throw new Error('Error al obtener metadatos de la URL');
  return res.json();
}

export async function checkBookmarkHealth(url) {
  const res = await fetch(`${BASE_URL}/bookmarks/check-health`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  });
  if (!res.ok) throw new Error('Error al verificar estado del enlace');
  return res.json();
}

export async function importHtmlBookmarks(htmlContent, defaultCategory = 'Navegador') {
  const res = await fetch(`${BASE_URL}/backup/import-html`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ htmlContent, defaultCategory })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Error al importar archivo HTML');
  }
  return res.json();
}

export async function trashBookmark(id) {
  const res = await fetch(`${BASE_URL}/bookmarks/${id}/trash`, {
    method: 'POST'
  });
  if (!res.ok) throw new Error('Error al mover marcador a la papelera');
  return res.json();
}

export async function trashNote(id) {
  const res = await fetch(`${BASE_URL}/notes/${id}/trash`, {
    method: 'POST'
  });
  if (!res.ok) throw new Error('Error al mover nota a la papelera');
  return res.json();
}

export async function fetchTrash() {
  const res = await fetch(`${BASE_URL}/trash`);
  if (!res.ok) throw new Error('Error al obtener elementos de la papelera');
  return res.json();
}

export async function restoreTrashItem(type, id) {
  const res = await fetch(`${BASE_URL}/trash/${type}/${id}/restore`, {
    method: 'POST'
  });
  if (!res.ok) throw new Error('Error al restaurar elemento');
  return res.json();
}

export async function destroyTrashItem(type, id) {
  const res = await fetch(`${BASE_URL}/trash/${type}/${id}`, {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error('Error al eliminar definitivamente');
  return res.json();
}

export async function emptyTrash() {
  const res = await fetch(`${BASE_URL}/trash`, {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error('Error al vaciar papelera');
  return res.json();
}

export async function importBackup(backupData, mode = 'append') {
  const res = await fetch(`${BASE_URL}/backup/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...backupData, mode })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Error al importar backup');
  }
  return res.json();
}


