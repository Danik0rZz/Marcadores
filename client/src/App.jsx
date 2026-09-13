import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import HomeDashboard from './components/HomeDashboard';
import FilterBar from './components/FilterBar';
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

import {
  fetchStats,
  fetchTaxonomy,
  fetchBookmarks,
  fetchNotes,
  fetchBookmarkRelated,
  fetchNoteRelated,
  fetchBookmarkById,
  fetchNoteById,
  fetchCrossRelations,
  createBookmark,
  updateBookmark,
  trashBookmark,
  createNote,
  updateNote,
  trashNote,
  linkRelation,
  unlinkRelation
} from './api';

import { 
  Bookmark, 
  FileText, 
  LayoutGrid, 
  List, 
  Plus, 
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

export default function App() {
  const [currentTab, setCurrentTab] = useState('home'); // 'home' | 'bookmarks' | 'notes' | 'graph' | 'matrix' | 'settings'
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [bookmarkViewMode, setBookmarkViewMode] = useState('grid'); // 'grid' | 'table'
  const [noteViewMode, setNoteViewMode] = useState('grid'); // 'grid' | 'table'

  const [stats, setStats] = useState(null);
  const [taxonomy, setTaxonomy] = useState(null);
  const [bookmarks, setBookmarks] = useState([]);
  const [notes, setNotes] = useState([]);
  const [crossRelations, setCrossRelations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [filters, setFilters] = useState({
    category: '',
    subcategory: '',
    theme: '',
    tag: ''
  });

  // Toasts state
  const [toasts, setToasts] = useState([]);
  const showToast = (title, message, isError = false) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, title, message, isError }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 280);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Modals state
  const [isBookmarkModalOpen, setIsBookmarkModalOpen] = useState(false);
  const [editingBookmark, setEditingBookmark] = useState(null);

  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState(null);

  const [selectedNoteForDetail, setSelectedNoteForDetail] = useState(null);

  const [isRelatedDrawerOpen, setIsRelatedDrawerOpen] = useState(false);
  const [relatedSourceType, setRelatedSourceType] = useState('bookmark');
  const [relatedSourceItem, setRelatedSourceItem] = useState(null);
  const [relatedItems, setRelatedItems] = useState([]);

  const [isManualLinkModalOpen, setIsManualLinkModalOpen] = useState(false);
  const [manualLinkSource, setManualLinkSource] = useState(null);
  const [manualLinkType, setManualLinkType] = useState('bookmark');

  // Load all data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const activeFilters = { ...filters };
      if (debouncedSearchQuery.trim()) {
        activeFilters.q = debouncedSearchQuery.trim();
      }

      const [statsData, taxData, bmData, ntData, matrixData] = await Promise.all([
        fetchStats(),
        fetchTaxonomy(),
        fetchBookmarks(activeFilters),
        fetchNotes(activeFilters),
        fetchCrossRelations()
      ]);

      setStats(statsData);
      setTaxonomy(taxData);
      setBookmarks(bmData);
      setNotes(ntData);
      setCrossRelations(matrixData);
    } catch (err) {
      console.error(err);
      setError('No se pudo conectar con el servidor local SQLite.');
    } finally {
      setLoading(false);
    }
  }, [filters, debouncedSearchQuery]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle tree taxonomy selection from sidebar
  const handleSelectTaxonomy = (cat, subcat, theme = '') => {
    setFilters(prev => ({
      ...prev,
      category: cat,
      subcategory: subcat,
      theme
    }));
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
    setFilters({
      category: '',
      subcategory: '',
      theme: '',
      tag: ''
    });
    setSearchQuery('');
  };

  // WikiLink Navigation Handler (Obsidian style)
  const handleWikiLinkNavigate = (targetTitle) => {
    if (!targetTitle) return;
    const clean = targetTitle.trim().toLowerCase();

    // 1. Search in notes
    const matchedNote = notes.find(n => n.title.toLowerCase() === clean) ||
                        notes.find(n => n.title.toLowerCase().includes(clean));
    if (matchedNote) {
      setSelectedNoteForDetail(matchedNote);
      return;
    }

    // 2. Search in bookmarks
    const matchedBm = bookmarks.find(b => b.title.toLowerCase() === clean) ||
                      bookmarks.find(b => b.title.toLowerCase().includes(clean));
    if (matchedBm) {
      if (matchedBm.url) {
        window.open(matchedBm.url, '_blank', 'noopener,noreferrer');
      } else {
        handleViewRelatedBookmark(matchedBm);
      }
      return;
    }

    // 3. Fallback: filter search
    setSearchQuery(targetTitle);
    setCurrentTab('notes');
    setSelectedNoteForDetail(null);
  };

  // View Related Handler
  const handleViewRelatedBookmark = async (bookmark) => {
    try {
      const related = await fetchBookmarkRelated(bookmark.id);
      setRelatedSourceType('bookmark');
      setRelatedSourceItem(bookmark);
      setRelatedItems(related);
      setIsRelatedDrawerOpen(true);
    } catch (err) {
      showToast('Error', err.message, true);
    }
  };

  const handleViewRelatedNote = async (note) => {
    try {
      const related = await fetchNoteRelated(note.id);
      setRelatedSourceType('note');
      setRelatedSourceItem(note);
      setRelatedItems(related);
      setIsRelatedDrawerOpen(true);
    } catch (err) {
      showToast('Error', err.message, true);
    }
  };

  // Sidebar tree leaf opener: notes open the detail modal; bookmarks open the URL
  // in a new tab plus the existing relations drawer.
  const handleOpenTreeItem = async (item) => {
    try {
      if (!item) return;

      if (item.type === 'note') {
        const loaded = notes.find(n => n.id === item.id);
        const fullNote = loaded && loaded.content ? loaded : await fetchNoteById(item.id);
        setSelectedNoteForDetail(fullNote);
        return;
      }

      if (item.type === 'bookmark') {
        const loaded = bookmarks.find(b => b.id === item.id);
        const fullBookmark = loaded || await fetchBookmarkById(item.id);
        if (fullBookmark?.url) {
          window.open(fullBookmark.url, '_blank', 'noopener,noreferrer');
        }
        await handleViewRelatedBookmark(fullBookmark);
      }
    } catch (err) {
      showToast('Error', err.message, true);
    }
  };

  // Manual Link Openers
  const handleOpenManualLinkFromBookmark = (bookmark) => {
    setManualLinkSource(bookmark);
    setManualLinkType('bookmark');
    setIsManualLinkModalOpen(true);
  };

  const handleOpenManualLinkFromNote = (note) => {
    setManualLinkSource(note);
    setManualLinkType('note');
    setIsManualLinkModalOpen(true);
  };

  const handlePerformLink = async (bmId, nId, notesText) => {
    try {
      await linkRelation(bmId, nId, notesText);
      await loadData();
      showToast('Vínculo creado', 'La relación ha sido guardada.');
      if (isRelatedDrawerOpen && relatedSourceItem) {
        if (relatedSourceType === 'bookmark') {
          const fresh = await fetchBookmarkRelated(relatedSourceItem.id);
          setRelatedItems(fresh);
        } else {
          const fresh = await fetchNoteRelated(relatedSourceItem.id);
          setRelatedItems(fresh);
        }
      }
    } catch (err) {
      showToast('Error', err.message, true);
    }
  };

  const handlePerformUnlink = async (bmId, nId) => {
    try {
      await unlinkRelation(bmId, nId);
      await loadData();
      showToast('Vínculo eliminado', 'La relación fue desvinculada.');
      if (isRelatedDrawerOpen && relatedSourceItem) {
        if (relatedSourceType === 'bookmark') {
          const fresh = await fetchBookmarkRelated(relatedSourceItem.id);
          setRelatedItems(fresh);
        } else {
          const fresh = await fetchNoteRelated(relatedSourceItem.id);
          setRelatedItems(fresh);
        }
      }
    } catch (err) {
      showToast('Error', err.message, true);
    }
  };

  // Bookmark CRUD handlers
  const handleSaveBookmark = async (formData) => {
    try {
      if (editingBookmark) {
        await updateBookmark(editingBookmark.id, formData);
        showToast('Marcador actualizado', 'Los cambios han sido guardados.');
      } else {
        await createBookmark(formData);
        showToast('Marcador creado', 'El enlace ya está en tu biblioteca.');
      }
      setIsBookmarkModalOpen(false);
      setEditingBookmark(null);
      await loadData();
    } catch (err) {
      showToast('Error', err.message, true);
    }
  };

  const handleTrashBookmark = async (bookmark) => {
    if (!window.confirm(`¿Mover "${bookmark.title}" a la papelera?`)) return;
    try {
      await trashBookmark(bookmark.id);
      showToast('Movido a papelera', 'Podés restaurarlo desde Ajustes y Backups.');
      await loadData();
    } catch (err) {
      showToast('Error', err.message, true);
    }
  };

  // Note CRUD handlers
  const handleSaveNote = async (formData) => {
    try {
      if (editingNote) {
        await updateNote(editingNote.id, formData);
        showToast('Nota actualizada', 'Los cambios han sido guardados en SQLite.');
      } else {
        await createNote(formData);
        showToast('Nota guardada', 'La nota ha sido creada en tu biblioteca.');
      }
      setIsNoteModalOpen(false);
      setEditingNote(null);
      await loadData();
    } catch (err) {
      showToast('Error', err.message, true);
    }
  };

  const handleTrashNote = async (note) => {
    if (!window.confirm(`¿Mover "${note.title}" a la papelera?`)) return;
    try {
      await trashNote(note.id);
      showToast('Movido a papelera', 'Podés restaurarlo desde Ajustes y Backups.');
      await loadData();
    } catch (err) {
      showToast('Error', err.message, true);
    }
  };

  return (
    <div className={`app-shell ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      {/* Sidebar */}
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        stats={stats}
        taxonomy={taxonomy}
        selectedCategory={filters.category}
        selectedSubcategory={filters.subcategory}
        selectedTheme={filters.theme}
        onSelectTaxonomy={handleSelectTaxonomy}
        onOpenItem={handleOpenTreeItem}
        isCollapsed={isSidebarCollapsed}
        setIsCollapsed={setIsSidebarCollapsed}
      />

      {/* Main Workspace */}
      <main className="workspace">
        {/* Topbar */}
        <Topbar
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          onNewBookmark={() => {
            setEditingBookmark(null);
            setIsBookmarkModalOpen(true);
          }}
          onNewNote={() => {
            setEditingNote(null);
            setIsNoteModalOpen(true);
          }}
        />

        {/* Content Container */}
        <div className="content">
          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm flex items-center gap-3">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          {/* TAB 1: HOME DASHBOARD */}
          {currentTab === 'home' && (
            <HomeDashboard
              stats={stats}
              onNavigateTab={(tab) => setCurrentTab(tab)}
              onOpenNoteDetail={(note) => setSelectedNoteForDetail(note)}
              onOpenBookmark={(bm) => window.open(bm.url, '_blank')}
              onOpenSettings={() => setCurrentTab('settings')}
            />
          )}

          {/* TAB 2: BOOKMARKS */}
          {currentTab === 'bookmarks' && (
            <div>
              <div className="page-head">
                <div>
                  <div className="eyebrow">Colección de enlaces</div>
                  <h1 className="page-title">Marcadores Guardados</h1>
                  <p className="page-subtitle">
                    Enlaces categorizados con soporte para favicon, acento de color y verificación de estado.
                  </p>
                </div>

                <div className="page-head-actions">
                  <div className="view-switch">
                    <button
                      type="button"
                      onClick={() => setBookmarkViewMode('grid')}
                      className={bookmarkViewMode === 'grid' ? 'active' : ''}
                      title="Vista en tarjetas"
                    >
                      <LayoutGrid size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setBookmarkViewMode('table')}
                      className={bookmarkViewMode === 'table' ? 'active' : ''}
                      title="Vista en tabla"
                    >
                      <List size={15} />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setEditingBookmark(null);
                      setIsBookmarkModalOpen(true);
                    }}
                    className="button primary small"
                  >
                    <Plus size={14} />
                    <span>Nuevo Marcador</span>
                  </button>
                </div>
              </div>

              <FilterBar
                taxonomy={taxonomy}
                filters={filters}
                onFilterChange={handleFilterChange}
                onClearFilters={handleClearFilters}
              />

              {loading ? (
                <div className="loading-skeleton"></div>
              ) : bookmarks.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-inner">
                    <div className="empty-icon">
                      <Bookmark size={24} />
                    </div>
                    <h3>No hay marcadores coincidentes</h3>
                    <p>Probá cambiando los filtros o agregá un nuevo marcador a tu colección.</p>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingBookmark(null);
                        setIsBookmarkModalOpen(true);
                      }}
                      className="button primary"
                    >
                      Crear primer marcador
                    </button>
                  </div>
                </div>
              ) : bookmarkViewMode === 'grid' ? (
                <div className="cards-grid">
                  {bookmarks.map((bm, index) => (
                    <BookmarkCard
                      key={bm.id}
                      bookmark={bm}
                      onEdit={(b) => {
                        setEditingBookmark(b);
                        setIsBookmarkModalOpen(true);
                      }}
                      onDelete={handleTrashBookmark}
                      onViewRelated={handleViewRelatedBookmark}
                      onOpenManualLink={handleOpenManualLinkFromBookmark}
                    />
                  ))}
                </div>
              ) : (
                <BookmarkTableView
                  bookmarks={bookmarks}
                  onEdit={(b) => {
                    setEditingBookmark(b);
                    setIsBookmarkModalOpen(true);
                  }}
                  onDelete={handleTrashBookmark}
                  onViewRelated={handleViewRelatedBookmark}
                  onOpenManualLink={handleOpenManualLinkFromBookmark}
                />
              )}
            </div>
          )}

          {/* TAB 3: NOTES */}
          {currentTab === 'notes' && (
            <div>
              <div className="page-head">
                <div>
                  <div className="eyebrow">Base de conocimiento</div>
                  <h1 className="page-title">Notas Personales</h1>
                  <p className="page-subtitle">
                    Documentación técnica estructurada en Markdown con enlaces cruzados [[WikiLinks]] y resaltado de sintaxis.
                  </p>
                </div>

                <div className="page-head-actions">
                  <div className="view-switch">
                    <button
                      type="button"
                      onClick={() => setNoteViewMode('grid')}
                      className={noteViewMode === 'grid' ? 'active' : ''}
                      title="Vista en tarjetas"
                    >
                      <LayoutGrid size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setNoteViewMode('table')}
                      className={noteViewMode === 'table' ? 'active' : ''}
                      title="Vista en tabla"
                    >
                      <List size={15} />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setEditingNote(null);
                      setIsNoteModalOpen(true);
                    }}
                    className="button primary small"
                  >
                    <Plus size={14} />
                    <span>Nueva Nota</span>
                  </button>
                </div>
              </div>

              <FilterBar
                taxonomy={taxonomy}
                filters={filters}
                onFilterChange={handleFilterChange}
                onClearFilters={handleClearFilters}
              />

              {loading ? (
                <div className="loading-skeleton"></div>
              ) : notes.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-inner">
                    <div className="empty-icon">
                      <FileText size={24} />
                    </div>
                    <h3>No hay notas registradas</h3>
                    <p>Creá notas técnicas y conectalas con tus marcadores mediante WikiLinks.</p>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingNote(null);
                        setIsNoteModalOpen(true);
                      }}
                      className="button primary"
                    >
                      Crear primera nota
                    </button>
                  </div>
                </div>
              ) : noteViewMode === 'grid' ? (
                <div className="cards-grid">
                  {notes.map((n, index) => (
                    <NoteCard
                      key={n.id}
                      note={n}
                      onEdit={(noteItem) => {
                        setEditingNote(noteItem);
                        setIsNoteModalOpen(true);
                      }}
                      onDelete={handleTrashNote}
                      onViewRelated={handleViewRelatedNote}
                      onOpenManualLink={handleOpenManualLinkFromNote}
                      onSelectNote={(noteItem) => setSelectedNoteForDetail(noteItem)}
                      onWikiLinkClick={handleWikiLinkNavigate}
                    />
                  ))}
                </div>
              ) : (
                <NoteTableView
                  notes={notes}
                  onEdit={(noteItem) => {
                    setEditingNote(noteItem);
                    setIsNoteModalOpen(true);
                  }}
                  onDelete={handleTrashNote}
                  onViewRelated={handleViewRelatedNote}
                  onOpenManualLink={handleOpenManualLinkFromNote}
                  onSelectNote={(noteItem) => setSelectedNoteForDetail(noteItem)}
                />
              )}
            </div>
          )}

          {/* TAB 4: GRAPH VIEW */}
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
                bookmarks={bookmarks}
                notes={notes}
                relations={crossRelations}
                categories={taxonomy?.categories || []}
                onOpenNoteDetail={(note) => setSelectedNoteForDetail(note)}
                onViewRelatedBookmark={handleViewRelatedBookmark}
                onViewRelatedNote={handleViewRelatedNote}
              />
            </div>
          )}

          {/* TAB 5: CROSS MATRIX */}
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
                relations={crossRelations}
                onUnlinkManual={handlePerformUnlink}
                onNavigateToBookmark={(bmId) => {
                  const b = bookmarks.find(item => item.id === bmId);
                  if (b?.url) window.open(b.url, '_blank');
                  else if (b) handleViewRelatedBookmark(b);
                }}
                onNavigateToNote={(nId) => {
                  const n = notes.find(item => item.id === nId);
                  if (n) setSelectedNoteForDetail(n);
                }}
              />
            </div>
          )}

          {/* TAB 6: SETTINGS & TRASH */}
          {currentTab === 'settings' && (
            <SettingsView
              onRefreshData={loadData}
              onShowToast={showToast}
            />
          )}
        </div>
      </main>

      {/* MODALS */}
      <BookmarkFormModal
        isOpen={isBookmarkModalOpen}
        onClose={() => {
          setIsBookmarkModalOpen(false);
          setEditingBookmark(null);
        }}
        onSubmit={handleSaveBookmark}
        initialData={editingBookmark}
        taxonomy={taxonomy}
      />

      <NoteFormModal
        isOpen={isNoteModalOpen}
        onClose={() => {
          setIsNoteModalOpen(false);
          setEditingNote(null);
        }}
        onSubmit={handleSaveNote}
        initialData={editingNote}
        taxonomy={taxonomy}
      />

      <NoteDetailModal
        isOpen={!!selectedNoteForDetail}
        note={selectedNoteForDetail}
        onClose={() => setSelectedNoteForDetail(null)}
        onEdit={(note) => {
          setEditingNote(note);
          setIsNoteModalOpen(true);
        }}
        onViewRelated={handleViewRelatedNote}
        onWikiLinkClick={handleWikiLinkNavigate}
      />

      <RelatedDrawerModal
        isOpen={isRelatedDrawerOpen}
        onClose={() => {
          setIsRelatedDrawerOpen(false);
          setRelatedSourceItem(null);
        }}
        sourceType={relatedSourceType}
        sourceItem={relatedSourceItem}
        relatedItems={relatedItems}
        onOpenNoteDetail={(note) => setSelectedNoteForDetail(note)}
        onOpenManualLink={(item) => {
          if (relatedSourceType === 'bookmark') {
            handleOpenManualLinkFromBookmark(item);
          } else {
            handleOpenManualLinkFromNote(item);
          }
        }}
        onUnlinkRelation={handlePerformUnlink}
      />

      <ManualLinkModal
        isOpen={isManualLinkModalOpen}
        onClose={() => {
          setIsManualLinkModalOpen(false);
          setManualLinkSource(null);
        }}
        sourceItem={manualLinkSource}
        sourceType={manualLinkType}
        bookmarks={bookmarks}
        notes={notes}
        onLink={handlePerformLink}
      />

      {/* Toast Notification Stack */}
      {toasts.length > 0 && (
        <div className="toast-stack">
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
      )}
    </div>
  );
}
