import React, { useId } from 'react';
import {
  X,
  GitMerge,
  Edit3,
  Download
} from 'lucide-react';
import MarkdownViewer from './MarkdownViewer';
import Dialog from './Dialog';

/** Render only while a note is selected. */
export default function NoteDetailModal({
  onClose,
  note,
  onEdit,
  onViewRelated,
  onWikiLinkClick
}) {
  const id = useId();

  const handleExportMarkdown = () => {
    const yaml = (value) => JSON.stringify(String(value ?? ''));
    const frontmatter = `---
title: ${yaml(note.title)}
category: ${yaml(note.category)}
subcategory: ${yaml(note.subcategory)}
theme: ${yaml(note.theme)}
tags: [${(note.tags || []).map(yaml).join(', ')}]
created_at: ${yaml(note.created_at)}
---

${note.content}
`;
    const blob = new Blob([frontmatter], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(note.title || 'nota').toLowerCase().replace(/[^a-z0-9]+/gi, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formattedDate = note.updated_at
    ? new Date(note.updated_at).toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    : '';

  return (
    <Dialog onClose={onClose} labelledBy={`${id}-title`} className="modal wide">
        {/* Header */}
        <div className="modal-head">
          <div className="modal-head-copy">
            <h2 id={`${id}-title`}>{note.title}</h2>
            <p>
              Actualizada el {formattedDate} · Categoría: {note.category} {note.subcategory ? `/ ${note.subcategory}` : ''}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportMarkdown}
              className="button small ghost text-zinc-300"
              title="Descargar archivo Markdown (.md)"
            >
              <Download size={14} />
              <span className="hidden sm:inline">Exportar .md</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onClose();
                onViewRelated(note);
              }}
              className="button small ghost text-emerald-400"
              title="Ver marcadores vinculados"
            >
              <GitMerge size={14} />
              <span className="hidden sm:inline">Relacionados</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onClose();
                onEdit(note);
              }}
              className="button small primary"
              title="Editar esta nota"
            >
              <Edit3 size={14} />
              <span className="hidden sm:inline">Editar</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="icon-button ml-2"
              title="Cerrar modal (Esc)"
              aria-label="Cerrar"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body: Note Inspector */}
        <div className="modal-body">
          <div className="note-inspector">
            {/* Metadata Summary Grid */}
            <div className="note-inspector-summary">
              <section className="inspector-block">
                <h3>Categoría</h3>
                <p>{note.category || 'Sin categoría'}</p>
              </section>

              <section className="inspector-block">
                <h3>Subcategoría</h3>
                <p>{note.subcategory || 'Sin subcategoría'}</p>
              </section>

              <section className="inspector-block">
                <h3>Tema</h3>
                <p>{note.theme || 'General'}</p>
              </section>

              <section className="inspector-block">
                <h3>Tags asociados</h3>
                <div className="tag-row mt-1">
                  {(note.tags || []).length > 0 ? (
                    note.tags.map(t => (
                      <span key={t} className="tag">#{t}</span>
                    ))
                  ) : (
                    <span className="text-zinc-500 text-xs italic">Sin tags</span>
                  )}
                </div>
              </section>
            </div>

            {/* Note Reader Markdown content */}
            <div className="note-reader">
              <MarkdownViewer
                content={note.content}
                onWikiLinkClick={onWikiLinkClick}
              />
            </div>
          </div>
        </div>
    </Dialog>
  );
}
