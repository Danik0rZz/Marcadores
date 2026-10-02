import React, { useState, useEffect, useMemo } from 'react';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import HomeDashboard from './components/HomeDashboard';
import FilterBar from './components/FilterBar';
import CollectionPage from './components/CollectionPage';
import BookmarkCard from './components/BookmarkCard';
import BookmarkTableView from './components/BookmarkTableView';
import NoteCard from './components/NoteCard';
import NoteTableView from './components/NoteTableView';
import CrossMatrixView from './components/CrossMatrixView';
import GraphView from './components/GraphView';
import SettingsView from './components/SettingsView';

import BookmarkFormModal from './components/BookmarkFormModal';
import NoteFormModal from './components/NoteFormModal';
import NoteDetailModal from './components/NoteDetailModal';
import RelatedDrawerModal from './components/RelatedDrawerModal';
import ManualLinkModal from './components/ManualLinkModal';

import { useLibrary } from './hooks/useLibrary';
import { useToasts } from './hooks/useToasts';

import {
  fetchBookmarkRelated,
  fetchNoteRelated,
  fetchNoteById,
  createBookmark,
  updateBookmark,
  trashBookmark,
  createNote,
  updateNote,
  trashNote,
  linkRelation,
  unlinkRelation,
  IS_BROWSER_BACKEND
} from './api';

import { Bookmark, FileText, CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

const WEB_NOTICE_KEY = 'nexus:web-notice-dismissed';

function readNoticeDismissed() {
  try {
    return localStorage.getItem(WEB_NOTICE_KEY) === '1';
  } catch {
    return false;
  }
}

const EMPTY_FILTERS = { category: '', subcategory: '', theme: '', tag: '' };
const SEARCH_DEBOUNCE_MS = 280;

function openExternal(url) {
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
}

export default function App() {
  const [currentTab, setCurrentTab] = useState('home'); // 'home' | 'bookmarks' | 'notes' | 'graph' | 'matrix' | 'settings'
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [bookmarkViewMode, setBookmarkViewMode] = useState('grid'); // 'grid' | 'table'
  const [noteViewMode, setNoteViewMode] = useState('grid');
  const [isWebNoticeDismissed, setIsWebNoticeDismissed] = useState(readNoticeDismissed);

  const dismissWebNotice = () => {
    setIsWebNoticeDismissed(true);
    try {
      localStorage.setItem(WEB_NOTICE_KEY, '1');
    } catch {
      // storage blocked: the notice just comes back next visit
    }
  };

  // Search & filters
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const activeFilters = useMemo(
    () => ({ ...filters, q: debouncedSearchQuery.trim() }),
    [filters, debouncedSearchQuery]
  );

  const {
    library,
    visibleBookmarks,
    visibleNotes,
    isLoading,
    isRefreshing,
    error,
    refresh
  } = useLibrary(activeFilters);
  const { toasts, showToast } = useToasts();

  // Modals. Forms are mounted only while open, keyed by the edited item.
  const [bookmarkForm, setBookmarkForm] = useState(null); // null | { initialData }
  const [noteForm, setNoteForm] = useState(null); // null | { initialData }
  const [selectedNoteForDetail, setSelectedNoteForDetail] = useState(null);
  const [related, setRelated] = useState(null); // null | { type, item, items }
  const [manualLink, setManualLink] = useState(null); // null | { type, source }

  /* ------------------------------- filters ------------------------------- */

  const handleSelectTaxonomy = (category, subcategory, theme = '') => {
    setFilters(prev => ({ ...prev, category, subcategory, theme }));
    if (currentTab !== 'bookmarks' && currentTab !== 'notes') {
      setCurrentTab('bookmarks');
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => {
      const next = { ...prev, [key]: value };
      if (key === 'category' && prev.subcategory) {
        next.subcategory = '';
        next.theme = '';
      }
      if (key === 'subcategory' && prev.theme) {
        next.theme = '';
      }
      return next;
    });
  };

  const handleClearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setSearchQuery('');
  };

  /* ------------------------------ navigation ----------------------------- */

  const openNoteDetail = async (noteOrId) => {
    try {
      const id = typeof noteOrId === 'object' ? noteOrId.id : noteOrId;
      // Dashboard and tree rows carry no content/tags: always use a full note.
      const full = library.notes.find(n => n.id === id) || await fetchNoteById(id);
      setSelectedNoteForDetail(full);
    } catch (err) {
      showToast('Error', err.message, true);
    }
  };

  const loadRelated = (type, id) =>
    type === 'bookmark' ? fetchBookmarkRelated(id) : fetchNoteRelated(id);

  const openRelated = async (type, item) => {
    try {
      const items = await loadRelated(type, item.id);
      setRelated({ type, item, items });
    } catch (err) {
      showToast('Error', err.message, true);
    }
  };

  const handleViewRelatedBookmark = (bookmark) => openRelated('bookmark', bookmark);
  const handleViewRelatedNote = (note) => openRelated('note', note);

  const openBookmark = (bookmarkOrId) => {
    const id = typeof bookmarkOrId === 'object' ? bookmarkOrId.id : bookmarkOrId;
    const bookmark = library.bookmarks.find(b => b.id === id) || bookmarkOrId;
    if (bookmark?.url) openExternal(bookmark.url);
    else if (bookmark?.id) handleViewRelatedBookmark(bookmark);
  };

  // Obsidian-style [[WikiLink]]: searches the whole library, not the filtered view.
  const handleWikiLinkNavigate = (targetTitle) => {
    const clean = targetTitle?.trim().toLowerCase();
    if (!clean) return;

    const findByTitle = (items) =>
      items.find(i => i.title.toLowerCase() === clean) ||
      items.find(i => i.title.toLowerCase().includes(clean));

    const matchedNote = findByTitle(library.notes);
    if (matchedNote) {
      setSelectedNoteForDetail(matchedNote);
      return;
    }

    const matchedBookmark = findByTitle(library.bookmarks);
    if (matchedBookmark) {
      openBookmark(matchedBookmark);
      return;
    }

    // Fallback: search for it
    setSearchQuery(targetTitle);
    setCurrentTab('notes');
    setSelectedNoteForDetail(null);
  };

  // Sidebar tree leaf: notes open the detail modal; bookmarks open the URL
  // plus the relations drawer.
  const handleOpenTreeItem = async (item) => {
    if (!item) return;
    if (item.type === 'note') {
      await openNoteDetail(item.id);
    } else if (item.type === 'bookmark') {
      const bookmark = library.bookmarks.find(b => b.id === item.id) || item;
      openExternal(bookmark.url);
      await handleViewRelatedBookmark(bookmark);
    }
  };

  /* ---------------------------- manual links ----------------------------- */

  const handleOpenManualLink = (type, source) => setManualLink({ type, source });

  const runLinkMutation = async (mutation, successTitle, successMessage) => {
    try {
      await mutation();
      showToast(successTitle, successMessage);
      await refresh();
      if (related) {
        const items = await loadRelated(related.type, related.item.id);
        setRelated(prev => (prev ? { ...prev, items } : prev));
      }
    } catch (err) {
      showToast('Error', err.message, true);
    }
  };

  const handlePerformLink = (bookmarkId, noteId, notesText) =>
    runLinkMutation(() => linkRelation(bookmarkId, noteId, notesText), 'Vínculo creado', 'La relación ha sido guardada.');

  const handlePerformUnlink = (bookmarkId, noteId) =>
    runLinkMutation(() => unlinkRelation(bookmarkId, noteId), 'Vínculo eliminado', 'La relación fue desvinculada.');

  /* -------------------------------- CRUD --------------------------------- */

  /** @returns {Promise<boolean>} true when saved (the form then closes) */
  const handleSaveBookmark = async (formData) => {
    const editing = bookmarkForm?.initialData;
    try {
      if (editing) {
        await updateBookmark(editing.id, formData);
        showToast('Marcador actualizado', 'Los cambios han sido guardados.');
      } else {
        await createBookmark(formData);
        showToast('Marcador creado', 'El enlace ya está en tu biblioteca.');
      }
      setBookmarkForm(null);
      await refresh();
      return true;
    } catch (err) {
      showToast('Error', err.message, true);
      return false;
    }
  };

  const handleSaveNote = async (formData) => {
    const editing = noteForm?.initialData;
    try {
      if (editing) {
        await updateNote(editing.id, formData);
        showToast('Nota actualizada', 'Los cambios han sido guardados en SQLite.');
      } else {
        await createNote(formData);
        showToast('Nota guardada', 'La nota ha sido creada en tu biblioteca.');
      }
      setNoteForm(null);
      await refresh();
      return true;
    } catch (err) {
      showToast('Error', err.message, true);
      return false;
    }
  };

  const handleTrash = async (item, trash) => {
    if (!window.confirm(`¿Mover "${item.title}" a la papelera?`)) return;
    try {
      await trash(item.id);
      showToast('Movido a papelera', 'Podés restaurarlo desde Ajustes y Backups.');
      await refresh();
    } catch (err) {
      showToast('Error', err.message, true);
    }
  };

  const handleTrashBookmark = (bookmark) => handleTrash(bookmark, trashBookmark);
  const handleTrashNote = (note) => handleTrash(note, trashNote);

  const openNewBookmark = () => setBookmarkForm({ initialData: null });
  const openEditBookmark = (bookmark) => setBookmarkForm({ initialData: bookmark });
  const openNewNote = () => setNoteForm({ initialData: null });
  const openEditNote = (note) => setNoteForm({ initialData: note });

  const filterBar = (
    <FilterBar
      taxonomy={library.taxonomy}
      filters={filters}
      onFilterChange={handleFilterChange}
      onClearFilters={handleClearFilters}
    />
  );

  const bookmarkActions = {
    onEdit: openEditBookmark,
    onDelete: handleTrashBookmark,
    onViewRelated: handleViewRelatedBookmark,
    onOpenManualLink: (bookmark) => handleOpenManualLink('bookmark', bookmark)
  };

  const noteActions = {
    onEdit: openEditNote,
    onDelete: handleTrashNote,
    onViewRelated: handleViewRelatedNote,
    onOpenManualLink: (note) => handleOpenManualLink('note', note),
    onSelectNote: openNoteDetail
  };

  return (
    <div className={`app-shell ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        stats={library.stats}
        taxonomy={library.taxonomy}
        selectedCategory={filters.category}
        selectedSubcategory={filters.subcategory}
        selectedTheme={filters.theme}
        onSelectTaxonomy={handleSelectTaxonomy}
        onOpenItem={handleOpenTreeItem}
        isCollapsed={isSidebarCollapsed}
        setIsCollapsed={setIsSidebarCollapsed}
      />

      <main className="workspace">
        <Topbar
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          onNewBookmark={openNewBookmark}
          onNewNote={openNewNote}
        />

        <div className="content">
          {IS_BROWSER_BACKEND && !isWebNoticeDismissed && (
            <div role="note" className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-100 text-sm flex items-start gap-3">
              <Info size={18} className="mt-0.5 shrink-0 text-emerald-400" />
              <span className="flex-1">
                Versión web: tus datos se guardan solo en este navegador, no en ningún servidor.
                Exportá un backup desde <strong>Ajustes y Backups</strong> para conservarlos o llevarlos a otro equipo.
              </span>
              <button type="button" onClick={dismissWebNotice} className="icon-button" aria-label="Cerrar aviso" title="Cerrar aviso">
                <X size={16} />
              </button>
            </div>
          )}

          {error && (
            <div role="alert" className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm flex items-center gap-3">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          {currentTab === 'home' && (
            <HomeDashboard
              stats={library.stats}
              onOpenNoteDetail={openNoteDetail}
              onOpenSettings={() => setCurrentTab('settings')}
            />
          )}

          {currentTab === 'bookmarks' && (
            <CollectionPage
              eyebrow="Colección de enlaces"
              title="Marcadores Guardados"
              subtitle="Enlaces categorizados con soporte para favicon, acento de color y verificación de estado."
              viewMode={bookmarkViewMode}
              onViewModeChange={setBookmarkViewMode}
              newLabel="Nuevo Marcador"
              onNew={openNewBookmark}
              filterBar={filterBar}
              isLoading={isLoading}
              isRefreshing={isRefreshing}
              isEmpty={visibleBookmarks.length === 0}
              empty={{
                Icon: Bookmark,
                title: 'No hay marcadores coincidentes',
                text: 'Probá cambiando los filtros o agregá un nuevo marcador a tu colección.',
                actionLabel: 'Crear primer marcador'
              }}
            >
              {bookmarkViewMode === 'grid' ? (
                <div className="cards-grid">
                  {visibleBookmarks.map(bm => (
                    <BookmarkCard key={bm.id} bookmark={bm} {...bookmarkActions} />
                  ))}
                </div>
              ) : (
                <BookmarkTableView bookmarks={visibleBookmarks} {...bookmarkActions} />
              )}
            </CollectionPage>
          )}

          {currentTab === 'notes' && (
            <CollectionPage
              eyebrow="Base de conocimiento"
              title="Notas Personales"
              subtitle="Documentación técnica estructurada en Markdown con enlaces cruzados [[WikiLinks]] y resaltado de sintaxis."
              viewMode={noteViewMode}
              onViewModeChange={setNoteViewMode}
              newLabel="Nueva Nota"
              onNew={openNewNote}
              filterBar={filterBar}
              isLoading={isLoading}
              isRefreshing={isRefreshing}
              isEmpty={visibleNotes.length === 0}
              empty={{
                Icon: FileText,
                title: 'No hay notas registradas',
                text: 'Creá notas técnicas y conectalas con tus marcadores mediante WikiLinks.',
                actionLabel: 'Crear primera nota'
              }}
            >
              {noteViewMode === 'grid' ? (
                <div className="cards-grid">
                  {visibleNotes.map(n => (
                    <NoteCard key={n.id} note={n} {...noteActions} />
                  ))}
                </div>
              ) : (
                <NoteTableView notes={visibleNotes} {...noteActions} />
              )}
            </CollectionPage>
          )}

          {currentTab === 'graph' && (
            <div>
              <div className="page-head">
                <div>
                  <div className="eyebrow">Knowledge graph</div>
                  <h1 className="page-title">Grafo de Conocimiento Interactivo</h1>
                  <p className="page-subtitle">
                    Visualizá los clusters y conexiones semánticas y manuales entre tus marcadores y notas.
                  </p>
                </div>
              </div>

              <GraphView
                bookmarks={library.bookmarks}
                notes={library.notes}
                relations={library.relations}
                categories={library.taxonomy?.categories || []}
                onOpenNoteDetail={openNoteDetail}
                onViewRelatedBookmark={handleViewRelatedBookmark}
                onViewRelatedNote={handleViewRelatedNote}
              />
            </div>
          )}

          {currentTab === 'matrix' && (
            <div>
              <div className="page-head">
                <div>
                  <div className="eyebrow">Correlación semántica</div>
                  <h1 className="page-title">Matriz de Relaciones Cruzadas</h1>
                  <p className="page-subtitle">
                    Explorá el grado de afinidad algorítmica y relaciones manuales directas.
                  </p>
                </div>
              </div>

              <CrossMatrixView
                relations={library.relations}
                onUnlinkManual={handlePerformUnlink}
                onNavigateToBookmark={openBookmark}
                onNavigateToNote={openNoteDetail}
              />
            </div>
          )}

          {currentTab === 'settings' && (
            <SettingsView onRefreshData={refresh} onShowToast={showToast} />
          )}
        </div>
      </main>

      {/* MODALS — mounted only while open */}
      {bookmarkForm && (
        <BookmarkFormModal
          key={bookmarkForm.initialData?.id ?? 'new'}
          onClose={() => setBookmarkForm(null)}
          onSubmit={handleSaveBookmark}
          initialData={bookmarkForm.initialData}
          taxonomy={library.taxonomy}
        />
      )}

      {noteForm && (
        <NoteFormModal
          key={noteForm.initialData?.id ?? 'new'}
          onClose={() => setNoteForm(null)}
          onSubmit={handleSaveNote}
          initialData={noteForm.initialData}
          taxonomy={library.taxonomy}
        />
      )}

      {selectedNoteForDetail && (
        <NoteDetailModal
          note={selectedNoteForDetail}
          onClose={() => setSelectedNoteForDetail(null)}
          onEdit={openEditNote}
          onViewRelated={handleViewRelatedNote}
          onWikiLinkClick={handleWikiLinkNavigate}
        />
      )}

      {related && (
        <RelatedDrawerModal
          onClose={() => setRelated(null)}
          sourceType={related.type}
          sourceItem={related.item}
          relatedItems={related.items}
          onOpenManualLink={(item) => handleOpenManualLink(related.type, item)}
          onUnlinkManual={handlePerformUnlink}
          onSelectCounterpart={(item, type) => (type === 'note' ? openNoteDetail(item) : openBookmark(item))}
        />
      )}

      {manualLink && (
        <ManualLinkModal
          key={`${manualLink.type}-${manualLink.source.id}`}
          onClose={() => setManualLink(null)}
          sourceItem={manualLink.source}
          sourceType={manualLink.type}
          // The complete library: the active filter must not hide link targets.
          availableTargets={manualLink.type === 'bookmark' ? library.notes : library.bookmarks}
          onLink={handlePerformLink}
        />
      )}

      {/* Toast notifications: a live region that exists before any toast appears */}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.isError ? 'error' : ''}`}>
            <div className="toast-icon">
              {t.isError ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
            </div>
            <div className="toast-copy">
              <strong>{t.title}</strong>
              <span>{t.message}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
