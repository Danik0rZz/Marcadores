import React from 'react';
import { X } from 'lucide-react';

export default function FilterBar({
  taxonomy,
  filters,
  onFilterChange,
  onClearFilters
}) {
  const { categories = [], subcategories = [], themes = [], tags = [] } = taxonomy || {};

  const availableSubcategories = filters.category
    ? subcategories.filter(s => s.category.toLowerCase() === filters.category.toLowerCase()).map(s => s.subcategory)
    : Array.from(new Set(subcategories.map(s => s.subcategory)));

  const availableThemes = Array.from(new Set(
    themes
      .filter(t => !filters.category || t.category.toLowerCase() === filters.category.toLowerCase())
      .filter(t => !filters.subcategory || t.subcategory.toLowerCase() === filters.subcategory.toLowerCase())
      .map(t => t.theme)
  ));

  const hasActiveFilters = Boolean(
    filters.category || filters.subcategory || filters.theme || filters.tag
  );

  return (
    <div className="filters">
      {/* Categoría */}
      <select
        value={filters.category || ''}
        onChange={(e) => onFilterChange('category', e.target.value)}
        className="filter-select"
        title="Filtrar por categoría"
      >
        <option value="">Todas las categorías</option>
        {categories.map((cat) => (
          <option key={cat} value={cat}>
            {cat}
          </option>
        ))}
      </select>

      {/* Subcategoría */}
      <select
        value={filters.subcategory || ''}
        onChange={(e) => onFilterChange('subcategory', e.target.value)}
        className="filter-select"
        title="Filtrar por subcategoría"
      >
        <option value="">Todas las subcategorías</option>
        {availableSubcategories.map((sub) => (
          <option key={sub} value={sub}>
            {sub}
          </option>
        ))}
      </select>

      {/* Tema */}
      <select
        value={filters.theme || ''}
        onChange={(e) => onFilterChange('theme', e.target.value)}
        className="filter-select"
        title="Filtrar por tema"
      >
        <option value="">Todos los temas</option>
        {availableThemes.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>

      {/* Tag select */}
      <select
        value={filters.tag || ''}
        onChange={(e) => onFilterChange('tag', e.target.value)}
        className="filter-select"
        title="Filtrar por etiqueta"
      >
        <option value="">Todos los tags</option>
        {tags.map((t) => (
          <option key={t.name} value={t.name}>
            #{t.name} ({t.count})
          </option>
        ))}
      </select>

      {/* Clear active filters */}
      {hasActiveFilters && (
        <button
          type="button"
          onClick={onClearFilters}
          className="button small ghost text-red-400 hover:text-red-300 ml-auto"
        >
          <X size={13} />
          <span>Limpiar filtros</span>
        </button>
      )}
    </div>
  );
}
