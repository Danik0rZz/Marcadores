import React, { useRef, useEffect } from 'react';
import { Search, Plus, FileText } from 'lucide-react';
import { isAnyDialogOpen } from '../hooks/useDialog';

function isTypingTarget(target) {
  return target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

export default function Topbar({
  searchQuery,
  setSearchQuery,
  onNewBookmark,
  onNewNote
}) {
  const searchInputRef = useRef(null);
  // Latest callbacks without re-registering the listener on every render.
  const actionsRef = useRef({ onNewBookmark, onNewNote });
  useEffect(() => {
    actionsRef.current = { onNewBookmark, onNewNote };
  }, [onNewBookmark, onNewNote]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl+K or Cmd+K: Focus search input
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyK') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      // Never steal keystrokes from a text field (on macOS Option+N types "ñ")
      // or open a form on top of an open dialog.
      if (isTypingTarget(e.target) || isAnyDialogOpen()) return;

      if (e.code === 'KeyN') {
        e.preventDefault();
        actionsRef.current.onNewNote();
      } else if (e.code === 'KeyB') {
        e.preventDefault();
        actionsRef.current.onNewBookmark();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
