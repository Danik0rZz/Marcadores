import React, { useState } from 'react';
import {
  Home,
  Bookmark,
  FileText,
  Network,
  GitMerge,
  Settings,
  ChevronRight,
  Layers
} from 'lucide-react';
import { getFaviconUrl } from '../utils/favicon';

// Leaf row for a single bookmark or note inside the taxonomy tree.
function TreeLeaf({ item, onOpenItem }) {
  const [faviconFailed, setFaviconFailed] = useState(false);
  const isNote = item.type === 'note';
  const faviconUrl = isNote ? '' : getFaviconUrl(item.url);
  const showFavicon = !isNote && Boolean(faviconUrl) && !faviconFailed;

  return (
    <div className="tree-leaf" data-item-type={item.type}>
      <button
        type="button"
        className="tree-leaf-link"
        onClick={() => onOpenItem(item)}
        title={item.title}
        aria-label={isNote ? `Nota: ${item.title}` : `Marcador: ${item.title}`}
      >
        <span className="tree-leaf-icon" aria-hidden="true">
          {isNote ? (
            <FileText size={13} />
          ) : showFavicon ? (
            <img
              src={faviconUrl}
              alt=""
              className="tree-leaf-favicon"
              onError={() => setFaviconFailed(true)}
            />
          ) : (
            <Bookmark size={13} />
          )}
        </span>
        <span className="tree-leaf-name">{item.title}</span>
      </button>
    </div>
  );
}

export default function Sidebar({
  currentTab,
  setCurrentTab,
  stats,
  taxonomy,
  selectedCategory,
  selectedSubcategory,
  selectedTheme,
  onSelectTaxonomy,
  onOpenItem,
  isCollapsed,
  setIsCollapsed
}) {
  const [expandedNodes, setExpandedNodes] = useState({});

  // Auto-expand the ancestor path of the active filter selection so the
  // selected category/subcategory/theme is always revealed. Adjusted during
  // render when the selection changes (no effect, no extra commit).
  const selectionKey = `${selectedCategory}||${selectedSubcategory}||${selectedTheme}`;
  const [revealedSelection, setRevealedSelection] = useState(null);
  if (selectedCategory && revealedSelection !== selectionKey) {
    setRevealedSelection(selectionKey);
    const next = { ...expandedNodes, [selectedCategory]: true };
    if (selectedSubcategory) {
      next[`${selectedCategory}||${selectedSubcategory}`] = true;
      if (selectedTheme) {
        next[`${selectedCategory}||${selectedSubcategory}||${selectedTheme}`] = true;
      }
    } else if (selectedTheme) {
      next[`${selectedCategory}||||${selectedTheme}`] = true;
    }
    setExpandedNodes(next);
  }

  const toggleNode = (key, e) => {
    e.stopPropagation();
    setExpandedNodes(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const navItems = [
    { id: 'home', label: 'Inicio', icon: Home, count: null },
    { id: 'bookmarks', label: 'Marcadores', icon: Bookmark, count: stats?.totalBookmarks },
    { id: 'notes', label: 'Notas', icon: FileText, count: stats?.totalNotes },
    { id: 'graph', label: 'Grafo de Red', icon: Network, count: null },
    { id: 'matrix', label: 'Matriz Cruzada', icon: GitMerge, count: stats?.totalManualRelations },
    { id: 'settings', label: 'Ajustes y Backups', icon: Settings, count: stats?.trashCount ? `${stats.trashCount}` : null }
  ];

  // Group subcategories and themes by taxonomy path
  const subcategoriesByCategory = {};
  if (taxonomy?.subcategories) {
    taxonomy.subcategories.forEach(item => {
      if (!subcategoriesByCategory[item.category]) {
        subcategoriesByCategory[item.category] = [];
      }
      if (item.subcategory && !subcategoriesByCategory[item.category].includes(item.subcategory)) {
        subcategoriesByCategory[item.category].push(item.subcategory);
      }
    });
  }

  const themesByPath = {};
  if (taxonomy?.themes) {
    taxonomy.themes.forEach(item => {
      const key = `${item.category}||${item.subcategory || ''}`;
      if (!themesByPath[key]) {
        themesByPath[key] = [];
      }
      if (item.theme && !themesByPath[key].includes(item.theme)) {
        themesByPath[key].push(item.theme);
      }
    });
  }

  // Index the flat items list by category, subcategory path and theme path.
  const treeItems = Array.isArray(taxonomy?.items) ? taxonomy.items : [];
  const itemsByCategory = {};
  const itemsBySubPath = {};
  const itemsByThemePath = {};

  treeItems.forEach(item => {
    const cat = item.category || '';
    if (!cat) return;
    const sub = item.subcategory || '';
    const theme = item.theme || '';

    if (!itemsByCategory[cat]) itemsByCategory[cat] = [];
    itemsByCategory[cat].push(item);

    if (sub) {
      const subKey = `${cat}||${sub}`;
      if (!itemsBySubPath[subKey]) itemsBySubPath[subKey] = [];
      itemsBySubPath[subKey].push(item);
    }

    if (theme) {
      const themeKey = `${cat}||${sub}||${theme}`;
      if (!itemsByThemePath[themeKey]) itemsByThemePath[themeKey] = [];
      itemsByThemePath[themeKey].push(item);
    }
  });

  // Theme node: a collapsible group of items sharing category/subcategory/theme.
  const renderThemeNode = (cat, sub, theme) => {
    const themeKey = `${cat}||${sub}||${theme}`;
    const themeItems = itemsByThemePath[themeKey] || [];
    const isExpanded = !!expandedNodes[themeKey];
    const isSelected = selectedCategory === cat && selectedSubcategory === sub && selectedTheme === theme;
    const label = sub ? `${cat} / ${sub} / ${theme}` : `${cat} / ${theme}`;
    const hasItems = themeItems.length > 0;

    return (
      <div className="tree-child-group" key={themeKey}>
        <div className={`tree-row tree-child theme-child${hasItems ? '' : ' no-toggle'}`}>
          {hasItems && (
            <button
              type="button"
              onClick={(e) => toggleNode(themeKey, e)}
              className={`tree-toggle compact ${isExpanded ? 'expanded' : ''}`}
              title={isExpanded ? 'Contraer tema' : 'Expandir tema'}
              aria-expanded={isExpanded}
              aria-label={`${isExpanded ? 'Contraer' : 'Expandir'} ${theme}`}
            >
              <ChevronRight size={12} />
            </button>
          )}
          <button
            type="button"
            onClick={() => onSelectTaxonomy(cat, sub, theme)}
            className={`tree-link ${isSelected ? 'active' : ''}`}
            title={label}
            aria-label={label}
          >
            <span className="tree-name">{theme}</span>
            <span className="tree-count">{themeItems.length}</span>
          </button>
        </div>
        {isExpanded && hasItems && (
          <div className="tree-children tree-leaves">
            {themeItems.map(item => (
              <TreeLeaf key={`${item.type}-${item.id}`} item={item} onOpenItem={onOpenItem} />
            ))}
          </div>
        )}
      </div>
    );
  };

  // Subcategory node: collapsible group with its themes and loose items
  // (items that have no theme rendered directly under the subcategory).
  const renderSubcategoryNode = (cat, sub) => {
    const subKey = `${cat}||${sub}`;
    const subItems = itemsBySubPath[subKey] || [];
    const subThemes = themesByPath[subKey] || [];
    const looseItems = subItems.filter(item => !item.theme);
    const hasChildren = subThemes.length > 0 || looseItems.length > 0;
    const isExpanded = !!expandedNodes[subKey];
    const isSelected = selectedCategory === cat && selectedSubcategory === sub && !selectedTheme;
    const label = `${cat} / ${sub}`;

    return (
      <div className="tree-child-group" key={subKey}>
        <div className={`tree-row tree-child ${!hasChildren ? 'no-toggle' : ''}`}>
          {hasChildren && (
            <button
              type="button"
              onClick={(e) => toggleNode(subKey, e)}
              className={`tree-toggle compact ${isExpanded ? 'expanded' : ''}`}
              title={isExpanded ? 'Contraer subcategoría' : 'Expandir subcategoría'}
              aria-expanded={isExpanded}
              aria-label={`${isExpanded ? 'Contraer' : 'Expandir'} ${sub}`}
            >
              <ChevronRight size={12} />
            </button>
          )}
          <button
            type="button"
            onClick={() => onSelectTaxonomy(cat, sub)}
            className={`tree-link ${isSelected ? 'active' : ''}`}
            title={label}
            aria-label={label}
          >
            <span className="tree-name">{sub}</span>
            <span className="tree-count">{subItems.length}</span>
          </button>
        </div>
        {isExpanded && hasChildren && (
          <div className="tree-children">
            {subThemes.map(theme => renderThemeNode(cat, sub, theme))}
            {looseItems.map(item => (
              <TreeLeaf key={`${item.type}-${item.id}`} item={item} onOpenItem={onOpenItem} />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside className="sidebar">
      {/* Brand & Collapse toggle */}
      <div className="brand">
        <button
          className="brand-mark"
          onClick={() => setIsCollapsed(!isCollapsed)}
          type="button"
          aria-label={isCollapsed ? 'Expandir menú' : 'Contraer menú'}
          title={isCollapsed ? 'Expandir menú' : 'Contraer menú'}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="5" />
            <path d="M9 3v18" />
            <path d="m14 9 3 3-3 3" />
          </svg>
        </button>
        <div className="brand-copy">
          <strong>Marcadores y Notas</strong>
          <span>Aplicación Personal</span>
        </div>
      </div>

      {/* Main navigation */}
      <nav className="sidebar-nav" aria-label="Navegación principal">
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setCurrentTab(item.id)}
              className={`nav-button ${isActive ? 'active' : ''}`}
              title={item.label}
              type="button"
            >
              <Icon size={18} />
              <span className="nav-copy">{item.label}</span>
              {item.count !== null && item.count !== undefined && (
                <span className="nav-count">{item.count}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Category Tree (Only when expanded) */}
      {!isCollapsed && taxonomy?.categories?.length > 0 && (
        <section className="sidebar-tree" aria-label="Árbol de categorías">
          <div className="tree-head">
            <span>Categorías</span>
            <span>{taxonomy.categories.length} ramas</span>
          </div>
          <div className="tree-list">
            {/* "Todas" reset button */}
            <div className="tree-row no-toggle">
              <button
                type="button"
                onClick={() => onSelectTaxonomy('', '')}
                className={`tree-link ${!selectedCategory ? 'active' : ''}`}
                title="Todas las categorías"
                aria-label="Todas las categorías"
              >
                <Layers size={14} />
                <span className="tree-name">Todas las categorías</span>
              </button>
            </div>

            {taxonomy.categories.map(cat => {
              const subs = subcategoriesByCategory[cat] || [];
              const categoryThemes = themesByPath[`${cat}||`] || [];
              const categoryItems = itemsByCategory[cat] || [];
              const looseCategoryItems = categoryItems.filter(item => !item.subcategory && !item.theme);
              const hasChildren = subs.length > 0 || categoryThemes.length > 0 || looseCategoryItems.length > 0;
              const isExpanded = !!expandedNodes[cat];
              const isSelected = selectedCategory === cat && !selectedSubcategory && !selectedTheme;

              return (
                <div key={cat}>
                  <div className={`tree-row ${!hasChildren ? 'no-toggle' : ''}`}>
                    {hasChildren && (
                      <button
                        type="button"
                        onClick={(e) => toggleNode(cat, e)}
                        className={`tree-toggle ${isExpanded ? 'expanded' : ''}`}
                        title={isExpanded ? 'Contraer' : 'Expandir'}
                        aria-expanded={isExpanded}
                        aria-label={`${isExpanded ? 'Contraer' : 'Expandir'} ${cat}`}
                      >
                        <ChevronRight size={13} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onSelectTaxonomy(cat, '')}
                      className={`tree-link ${isSelected ? 'active' : ''}`}
                      title={cat}
                      aria-label={cat}
                    >
                      <span className="tree-name">{cat}</span>
                      <span className="tree-count">{categoryItems.length}</span>
                    </button>
                  </div>

                  {/* Subcategories, themes and loose items */}
                  {isExpanded && hasChildren && (
                    <div className="tree-children">
                      {categoryThemes.map(theme => renderThemeNode(cat, '', theme))}
                      {subs.map(sub => renderSubcategoryNode(cat, sub))}
                      {looseCategoryItems.map(item => (
                        <TreeLeaf key={`${item.type}-${item.id}`} item={item} onOpenItem={onOpenItem} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="sidebar-spacer"></div>

      {/* Footer status */}
      <div className="sidebar-footer">
        <div className="storage-mini">
          <div className="label">
            <span className="storage-dot"></span>
            <span className="sidebar-foot-copy">Servidor SQLite conectado</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
