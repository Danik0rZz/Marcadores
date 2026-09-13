import React, { useState, memo } from 'react';
import { 
  ExternalLink, 
  GitMerge, 
  Edit3, 
  Trash2, 
  Plus,
  ChevronDown
} from 'lucide-react';
import { getFaviconUrl } from '../utils/favicon';

const BookmarkGridRow = memo(function BookmarkGridRow({
  bm,
  isExpanded,
  onToggleExpand,
  onEdit,
  onDelete,
  onViewRelated,
  onOpenManualLink
}) {
  const [imgError, setImgError] = useState(false);
  const faviconSrc = getFaviconUrl(bm.url, bm.favicon);
  const accentColor = bm.color || '#10b981';

  return (
    <div 
      className={`grid-item bookmark-grid-item ${isExpanded ? 'expanded' : ''}`}
      style={{ '--accent': accentColor }}
    >
      {/* Main compact row */}
      <div 
        className="grid-row"
        onClick={onToggleExpand}
      >
        {/* Title cell */}
        <div className="grid-cell title-cell">
          {faviconSrc && !imgError ? (
            <img 
              src={faviconSrc} 
              alt="" 
              onError={() => setImgError(true)}
              className="bookmark-favicon" 
            />
          ) : (
            <span className="title-accent" />
          )}
          <span className="title-text" title={bm.title}>
            {bm.title}
          </span>
        </div>

        {/* Category cell */}
        <div className="grid-cell">
          <span>{bm.category}</span>
          {bm.subcategory && <span className="text-zinc-500 text-xs ml-1">/ {bm.subcategory}</span>}
        </div>

        {/* Tags / Theme cell */}
        <div className="grid-cell">
          {bm.tags && bm.tags.length > 0 ? (
            <div className="tag-row">
              {bm.tags.slice(0, 3).map(tag => (
                <span key={tag} className="tag">#{tag}</span>
              ))}
            </div>
          ) : (
            <span className="text-zinc-500 text-xs italic">{bm.theme || 'Sin tags'}</span>
          )}
        </div>

        {/* Actions cell */}
        <div className="grid-cell grid-actions" onClick={e => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => window.open(bm.url, '_blank', 'noopener,noreferrer')}
            className="icon-button"
            title="Abrir enlace"
          >
            <ExternalLink size={14} />
          </button>
          <button
            type="button"
            onClick={() => onViewRelated(bm)}
            className="icon-button"
            title="Ver notas relacionadas"
          >
            <GitMerge size={14} />
          </button>
          <button
            type="button"
            onClick={() => onOpenManualLink(bm)}
            className="icon-button"
            title="Vincular con nota"
          >
            <Plus size={14} />
          </button>
          <button
            type="button"
            onClick={() => onEdit(bm)}
            className="icon-button"
            title="Editar"
          >
            <Edit3 size={14} />
          </button>
          <button
            type="button"
            onClick={() => onDelete(bm)}
            className="icon-button danger"
            title="Mover a papelera"
          >
            <Trash2 size={14} />
          </button>
          <button
            type="button"
            onClick={onToggleExpand}
            className="icon-button expand-toggle"
            title={isExpanded ? 'Contraer' : 'Expandir detalle'}
          >
            <ChevronDown size={14} />
          </button>
        </div>
      </div>

      {/* Accordion Detail Area */}
      <div className="grid-detail">
        <div className="detail-inner single-column">
          <div className="detail-stack">
            {/* Description */}
            <div>
              <div className="detail-label">Descripción</div>
              <div className="detail-copy">
                {bm.description || 'Sin descripción detallada.'}
              </div>
            </div>

            {/* Full URL */}
            <div>
              <div className="detail-label">URL completa</div>
              <a 
                className="detail-url flex items-center gap-1.5" 
                href={bm.url} 
                target="_blank" 
                rel="noopener noreferrer"
              >
                <ExternalLink size={12} />
                <span>{bm.url}</span>
              </a>
            </div>

            {/* Tema & Tags */}
            <div className="flex flex-wrap items-center gap-6">
              {bm.theme && (
                <div>
                  <div className="detail-label">Tema</div>
                  <div className="text-xs text-zinc-300">{bm.theme}</div>
                </div>
              )}
              {bm.tags && bm.tags.length > 0 && (
                <div>
                  <div className="detail-label">Tags asociados</div>
                  <div className="tag-row">
                    {bm.tags.map(t => (
                      <span key={t} className="tag">#{t}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

export default function BookmarkTableView({
  bookmarks = [],
  onEdit,
  onDelete,
  onViewRelated,
  onOpenManualLink
}) {
  const [expandedId, setExpandedId] = useState(null);

  const toggleExpand = (id) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  return (
    <div className="data-grid">
      {/* Header */}
      <div className="grid-header">
        <div>Título y Enlace</div>
        <div>Categoría</div>
        <div>Tags / Tema</div>
        <div className="text-right">Acciones</div>
      </div>

      {/* Rows */}
      {bookmarks.map(bm => (
        <BookmarkGridRow
          key={bm.id}
          bm={bm}
          isExpanded={expandedId === bm.id}
          onToggleExpand={() => toggleExpand(bm.id)}
          onEdit={onEdit}
          onDelete={onDelete}
          onViewRelated={onViewRelated}
          onOpenManualLink={onOpenManualLink}
        />
      ))}
    </div>
  );
}
