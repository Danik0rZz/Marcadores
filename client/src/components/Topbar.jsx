import React, { useRef, useEffect } from 'react';
import { Search, Plus, FileText } from 'lucide-react';

export default function Topbar({
  searchQuery,
  setSearchQuery,
  onNewBookmark,
  onNewNote
}) {
  const searchInputRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl+K or Cmd+K: Focus search input
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
      // Alt+N: New note
      if (e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        onNewNote();
      }
      // Alt+B: New bookmark
      if (e.altKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        onNewBookmark();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onNewBookmark, onNewNote]);

  return (
    <header className="topbar">
      {/* Search Bar with Ctrl+K badge */}
      <div className="search-wrap" id="searchWrap">
        <span className="search-icon-badge">
          <Search size={17} />
        </span>
        <input
          ref={searchInputRef}
          className="search-input"
          type="search"
          placeholder="Buscar por título, contenido, tema, tags..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          autoComplete="off"
          aria-label="Búsqueda global"
        />
        <span className="search-shortcut">Ctrl K</span>
      </div>

      {/* Quick Action Buttons */}
      <div className="topbar-actions">
        <button
          className="button ghost"
          type="button"
          onClick={onNewNote}
          title="Crear nota (Alt+N)"
        >
          <FileText size={15} />
          <span>Nueva nota</span>
          <kbd className="kbd-hint">Alt N</kbd>
        </button>

        <button
          className="button primary"
          type="button"
          onClick={onNewBookmark}
          title="Nuevo marcador (Alt+B)"
        >
          <Plus size={15} />
          <span>Nuevo marcador</span>
          <kbd className="kbd-hint primary">Alt B</kbd>
        </button>
      </div>
    </header>
  );
}
