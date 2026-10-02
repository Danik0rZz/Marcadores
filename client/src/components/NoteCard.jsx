import React from 'react';
import {
  FileText,
  GitMerge,
  Edit3,
  Trash2,
  Plus,
  Maximize2
} from 'lucide-react';
import { markdownExcerpt } from '../utils/markdownText';

function isInnerControl(event) {
  const control = event.target.closest('a, button, input, textarea, select');
  return control !== null && event.currentTarget.contains(control);
}

export default function NoteCard({
  note,
  onEdit,
  onDelete,
  onViewRelated,
  onOpenManualLink,
  onSelectNote
}) {
  const accentColor = '#6366f1';
  const formattedDate = note.updated_at
    ? new Date(note.updated_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
    : '';

  return (
    <div
      className="item-card"
      style={{ '--accent': accentColor }}
      onClick={(e) => {
        if (!isInnerControl(e)) onSelectNote(note);
      }}
    >
      <div className="card-top">
        {/* Symbol */}
        <div className="item-symbol">
          <FileText size={20} />
        </div>

        {/* Heading */}
        <div className="card-heading">
          <h3 className="card-title" title={note.title}>
            <button type="button" onClick={() => onSelectNote(note)} className="card-title-link">
              {note.title}
            </button>
          </h3>
          <div className="card-taxonomy">
            <span>{note.category}</span>
            {note.subcategory && (
              <>
                <span className="taxonomy-dot">/</span>
                <span>{note.subcategory}</span>
              </>
            )}
            {note.theme && (
              <>
                <span className="taxonomy-dot">·</span>
                <span className="text-zinc-400 font-normal">{note.theme}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Plain-text snippet; the full Markdown renders in the detail modal */}
      <p className="card-description">{markdownExcerpt(note.content)}</p>

      {/* Tags */}
      <div className="tag-row">
        {(note.tags || []).slice(0, 4).map(tag => (
          <span key={tag} className="tag">#{tag}</span>
        ))}
        {(note.tags || []).length > 4 && (
          <span className="tag">+{note.tags.length - 4}</span>
        )}
      </div>

      {/* Footer & Actions */}
      <div className="card-footer">
        <div className="card-meta">
          <span>Actualizado {formattedDate}</span>
        </div>

        <div className="card-actions">
          {/* Read detail modal */}
          <button
            type="button"
            onClick={() => onSelectNote(note)}
            className="icon-button"
            title="Leer nota completa"
            aria-label="Leer nota completa"
          >
            <Maximize2 size={14} />
          </button>

          {/* View relations */}
          <button
            type="button"
            onClick={() => onViewRelated(note)}
            className="icon-button"
            title="Ver marcadores relacionados"
            aria-label="Ver marcadores relacionados"
          >
            <GitMerge size={14} />
          </button>

          {/* Manual link */}
          <button
            type="button"
            onClick={() => onOpenManualLink(note)}
            className="icon-button"
            title="Vincular con marcador"
            aria-label="Vincular con marcador"
          >
            <Plus size={14} />
          </button>

          {/* Edit */}
          <button
            type="button"
            onClick={() => onEdit(note)}
            className="icon-button"
            title="Editar nota"
            aria-label="Editar nota"
          >
            <Edit3 size={14} />
          </button>

          {/* Trash */}
          <button
            type="button"
            onClick={() => onDelete(note)}
            className="icon-button danger"
            title="Mover a la papelera"
            aria-label="Mover a la papelera"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
