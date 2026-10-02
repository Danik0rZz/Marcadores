import React from 'react';
import { LayoutGrid, List, Plus } from 'lucide-react';

const VIEW_MODES = [
  { value: 'grid', label: 'Vista en tarjetas', Icon: LayoutGrid },
  { value: 'table', label: 'Vista en tabla', Icon: List }
];

/**
 * Shared layout of the bookmarks and notes pages: header with view switch and
 * "new" button, filter bar, then loading / empty / content states.
 */
export default function CollectionPage({
  eyebrow,
  title,
  subtitle,
  viewMode,
  onViewModeChange,
  newLabel,
  onNew,
  filterBar,
  isLoading,
  isRefreshing,
  isEmpty,
  empty,
  children
}) {
  const { Icon: EmptyIcon, title: emptyTitle, text: emptyText, actionLabel } = empty;

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <h1 className="page-title">{title}</h1>
          <p className="page-subtitle">{subtitle}</p>
        </div>

        <div className="page-head-actions">
          <div className="view-switch" role="group" aria-label="Modo de vista">
            {VIEW_MODES.map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => onViewModeChange(value)}
                className={viewMode === value ? 'active' : ''}
                title={label}
                aria-label={label}
                aria-pressed={viewMode === value}
              >
                <Icon size={15} />
              </button>
            ))}
          </div>

          <button type="button" onClick={onNew} className="button primary small">
            <Plus size={14} />
            <span>{newLabel}</span>
          </button>
        </div>
      </div>

      {filterBar}

      {isLoading ? (
        <div className="loading-skeleton" role="status" aria-label="Cargando"></div>
      ) : isEmpty ? (
        <div className="empty-state">
          <div className="empty-inner">
            <div className="empty-icon">
              <EmptyIcon size={24} />
            </div>
            <h3>{emptyTitle}</h3>
            <p>{emptyText}</p>
            <button type="button" onClick={onNew} className="button primary">
              {actionLabel}
            </button>
          </div>
        </div>
      ) : (
        // Older results stay visible (dimmed) while a newer search loads.
        <div aria-busy={isRefreshing} style={{ opacity: isRefreshing ? 0.6 : 1, transition: 'opacity 150ms' }}>
          {children}
        </div>
      )}
    </div>
  );
}
