import React, { useState, memo } from 'react';
import {
  GitMerge,
  Edit3,
  Trash2,
  Plus,
  ChevronDown,
  Maximize2
} from 'lucide-react';
import MarkdownViewer from './MarkdownViewer';

const NoteGridRow = memo(function NoteGridRow({
  n,
  isExpanded,
  onToggleExpand,
  onEdit,
  onDelete,
  onViewRelated,
  onOpenManualLink,
  onSelectNote
}) {
  const accentColor = '#6366f1';
  const formattedDate = n.updated_at
    ? new Date(n.updated_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
    : '';

  return (
    <div
      className={`grid-item ${isExpanded ? 'expanded' : ''}`}
      style={{ '--accent': accentColor }}
    >
      {/* Main compact row */}
      <div
        className="grid-row"
        onClick={onToggleExpand}
      >
        {/* Title cell */}
        <div className="grid-cell title-cell">
          <span className="title-accent" style={{ background: accentColor }} />
          <button type="button" className="title-text font-medium card-title-link" title={n.title} aria-expanded={isExpanded}>
            {n.title}
          </button>
        </div>

        {/* Category cell */}
        <div className="grid-cell">
          <span>{n.category}</span>
          {n.subcategory && <span className="text-zinc-500 text-xs ml-1">/ {n.subcategory}</span>}
        </div>

        {/* Tags / Theme cell */}
        <div className="grid-cell">
          {n.tags && n.tags.length > 0 ? (
            <div className="tag-row">
              {n.tags.slice(0, 3).map(tag => (
                <span key={tag} className="tag">#{tag}</span>
              ))}
            </div>
          ) : (
            <span className="text-zinc-500 text-xs italic">{n.theme || 'Sin tags'}</span>
          )}
        </div>

        {/* Date cell */}
        <div className="grid-cell text-zinc-500 font-mono text-xs">
          {formattedDate}
        </div>

        {/* Actions cell */}
        <div className="grid-cell grid-actions" onClick={e => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => onSelectNote(n)}
            className="icon-button"
            title="Leer nota completa"
            aria-label="Leer nota completa"
          >
            <Maximize2 size={14} />
          </button>
          <button
            type="button"
            onClick={() => onViewRelated(n)}
            className="icon-button"
            title="Ver marcadores relacionados"
            aria-label="Ver marcadores relacionados"
          >
            <GitMerge size={14} />
          </button>
          <button
            type="button"
            onClick={() => onOpenManualLink(n)}
            className="icon-button"
            title="Vincular con marcador"
            aria-label="Vincular con marcador"
          >
            <Plus size={14} />
          </button>
          <button
            type="button"
            onClick={() => onEdit(n)}
            className="icon-button"
            title="Editar"
            aria-label="Editar"
          >
            <Edit3 size={14} />
          </button>
          <button
            type="button"
            onClick={() => onDelete(n)}
            className="icon-button danger"
            title="Mover a papelera"
            aria-label="Mover a papelera"
          >
            <Trash2 size={14} />
          </button>
          <button
            type="button"
            onClick={onToggleExpand}
            className="icon-button expand-toggle"
            title={isExpanded ? 'Contraer' : 'Expandir vista previa'}
          >
            <ChevronDown size={14} />
          </button>
        </div>
      </div>

      {/* Accordion Detail Area */}
      <div className="grid-detail">
        <div className="detail-inner single-column">
          <div className="detail-stack">
            {/* Markdown Preview */}
            <div>
              <div className="detail-label">Vista previa del contenido</div>
              <div className="bg-black/30 p-4 rounded-lg border border-white/5 max-h-56 overflow-y-auto">
                {/* Parsed only for the expanded row, not for every row in the table */}
                {isExpanded && <MarkdownViewer content={n.content} />}
              </div>
            </div>

            {/* Tema & Tags */}
            <div className="flex flex-wrap items-center gap-6">
              {n.theme && (
                <div>
                  <div className="detail-label">Tema</div>
                  <div className="text-xs text-zinc-300">{n.theme}</div>
                </div>
              )}
              {n.tags && n.tags.length > 0 && (
                <div>
                  <div className="detail-label">Tags</div>
                  <div className="tag-row">
                    {n.tags.map(t => (
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

export default function NoteTableView({
  notes = [],
  onEdit,
  onDelete,
  onViewRelated,
  onOpenManualLink,
  onSelectNote
}) {
  const [expandedId, setExpandedId] = useState(null);

  const toggleExpand = (id) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  return (
    <div className="data-grid notes-grid">
      {/* Header */}
      <div className="grid-header">
        <div>Título de la Nota</div>
        <div>Categoría</div>
        <div>Tags / Tema</div>
        <div>Actualizado</div>
        <div className="text-right">Acciones</div>
      </div>

      {/* Rows */}
      {notes.map(n => (
        <NoteGridRow
          key={n.id}
          n={n}
          isExpanded={expandedId === n.id}
          onToggleExpand={() => toggleExpand(n.id)}
          onEdit={onEdit}
          onDelete={onDelete}
          onViewRelated={onViewRelated}
          onOpenManualLink={onOpenManualLink}
          onSelectNote={onSelectNote}
        />
      ))}
    </div>
  );
}
