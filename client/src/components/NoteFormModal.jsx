import React, { useId, useRef, useState } from 'react';
import {
  X,
  Bold,
  Italic,
  Heading,
  List,
  Code,
  Quote,
  Columns,
  Eye,
  Edit3
} from 'lucide-react';
import MarkdownViewer from './MarkdownViewer';
import { useFormState, confirmDiscard } from '../hooks/useFormState';
import Dialog from './Dialog';
import TagInput from './TagInput';
import TaxonomyFields from './TaxonomyFields';

/**
 * Render only while open, with a `key` per edited note: state is initialized
 * from `initialData` on mount instead of being reset by an effect.
 * `onSubmit` returns a promise resolving to true when the save succeeded.
 */
export default function NoteFormModal({
  onClose,
  onSubmit,
  initialData = null,
  taxonomy = {}
}) {
  const id = useId();
  const [form, setField, isDirty] = useFormState({
    title: initialData?.title || '',
    content: initialData?.content || '',
    category: initialData?.category || '',
    subcategory: initialData?.subcategory || '',
    theme: initialData?.theme || initialData?.reason || '',
    tags: initialData?.tags || []
  });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editorMode, setEditorMode] = useState('split'); // 'split' | 'edit' | 'preview'
  const textareaRef = useRef(null);

  const content = form.content;
  const setContent = (value) => setField('content', value);

  const requestClose = () => {
    if (!isSubmitting && confirmDiscard(isDirty)) onClose();
  };

  const insertMarkdown = (before, after = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const previousText = textarea.value;
    const selectedText = previousText.substring(start, end);

    const replacement = `${before}${selectedText || 'texto'}${after}`;
    const newContent = previousText.substring(0, start) + replacement + previousText.substring(end);

    setContent(newContent);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + before.length,
        start + before.length + (selectedText.length || 5)
      );
    }, 0);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    // The server rejects an empty body, so check it here with a clear message.
    if (!form.title.trim() || !form.category.trim() || !form.content.trim()) {
      setError('Por favor completá el Título, la Categoría y el Contenido de la nota.');
      return;
    }

    setIsSubmitting(true);
    const saved = await onSubmit({
      title: form.title.trim(),
      content: form.content.trim(),
      category: form.category.trim(),
      subcategory: form.subcategory.trim(),
      theme: form.theme.trim(),
      tags: form.tags
    });
    if (!saved) setIsSubmitting(false);
  };

  return (
    <Dialog onClose={requestClose} labelledBy={`${id}-title`} className="modal wide">
      {/* Header */}
      <div className="modal-head">
        <div className="modal-head-copy">
          <h2 id={`${id}-title`}>{initialData ? 'Editar Nota' : 'Nueva Nota en Markdown'}</h2>
          <p>Escribí notas con sintaxis Markdown completa, bloques de código y enlaces WikiLinks [[...]].</p>
        </div>
        <button
          type="button"
          onClick={requestClose}
          className="icon-button"
          title="Cerrar modal (Esc)"
          aria-label="Cerrar"
        >
          <X size={18} />
        </button>
      </div>

      {/* Body */}
      <form onSubmit={handleSubmit} className="modal-body">
          {error && (
            <div role="alert" className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-xs font-medium">
              {error}
            </div>
          )}

          <div className="field mb-4">
            <label htmlFor={`${id}-name`}>Título de la nota *</label>
            <input
              id={`${id}-name`}
              type="text"
              required
              data-autofocus
              placeholder="ej. Arquitectura de Estado en React 19"
              value={form.title}
              onChange={(e) => setField('title', e.target.value)}
              className="input text-base font-semibold"
            />
          </div>

          <TaxonomyFields taxonomy={taxonomy} values={form} onChange={setField} />

          <TagInput className="field mb-4" tags={form.tags} onChange={(tags) => setField('tags', tags)} />

          {/* Markdown Editor Toolbar & Mode Switcher */}
          <div className="editor-toolbar">
            <button
              type="button"
              onClick={() => insertMarkdown('**', '**')}
              className="icon-button"
              title="Negrita (**texto**)"
              aria-label="Negrita (**texto**)"
            >
              <Bold size={14} />
            </button>
            <button
              type="button"
              onClick={() => insertMarkdown('*', '*')}
              className="icon-button"
              title="Cursiva (*texto*)"
              aria-label="Cursiva (*texto*)"
            >
              <Italic size={14} />
            </button>
            <button
              type="button"
              onClick={() => insertMarkdown('## ')}
              className="icon-button"
              title="Encabezado H2 (## título)"
              aria-label="Encabezado H2 (## título)"
            >
              <Heading size={14} />
            </button>
            <button
              type="button"
              onClick={() => insertMarkdown('- ')}
              className="icon-button"
              title="Lista con viñetas (- elemento)"
              aria-label="Lista con viñetas (- elemento)"
            >
              <List size={14} />
            </button>
            <button
              type="button"
              onClick={() => insertMarkdown('`', '`')}
              className="icon-button"
              title="Código en línea (`código`)"
              aria-label="Código en línea (`código`)"
            >
              <Code size={14} />
            </button>
            <button
              type="button"
              onClick={() => insertMarkdown('```javascript\n', '\n```')}
              className="icon-button"
              title="Bloque de código con sintaxis"
              aria-label="Bloque de código con sintaxis"
            >
              <span className="font-mono text-xs font-bold">{'{}'}</span>
            </button>
            <button
              type="button"
              onClick={() => insertMarkdown('> ')}
              className="icon-button"
              title="Cita destacada (> cita)"
              aria-label="Cita destacada (> cita)"
            >
              <Quote size={14} />
            </button>
            <button
              type="button"
              onClick={() => insertMarkdown('[[', ']]')}
              className="icon-button text-emerald-400"
              title="Enlace WikiLink a otra nota o marcador ([[Título]])"
              aria-label="Enlace WikiLink a otra nota o marcador ([[Título]])"
            >
              <span className="font-mono text-xs font-bold">[[ ]]</span>
            </button>

            <div className="editor-separator"></div>

            {/* Editor mode toggles */}
            <div className="editor-modes">
              <button
                type="button"
                onClick={() => setEditorMode('split')}
                className={editorMode === 'split' ? 'active' : ''}
                title="Editor y previsualización lado a lado"
              >
                <Columns size={12} className="inline mr-1" />
                Split
              </button>
              <button
                type="button"
                onClick={() => setEditorMode('edit')}
                className={editorMode === 'edit' ? 'active' : ''}
                title="Solo editor de código"
              >
                <Edit3 size={12} className="inline mr-1" />
                Edit
              </button>
              <button
                type="button"
                onClick={() => setEditorMode('preview')}
                className={editorMode === 'preview' ? 'active' : ''}
                title="Solo previsualización renderizada"
              >
                <Eye size={12} className="inline mr-1" />
                Preview
              </button>
            </div>
          </div>

          {/* Editor Space (Split / Edit / Preview) */}
          <div className={`editor-space mode-${editorMode}`}>
            <textarea
              ref={textareaRef}
              aria-label="Contenido de la nota en Markdown"
              className="markdown-editor"
              placeholder="Escribí aquí tu nota en Markdown... Podés usar enlaces WikiLinks como [[Nombre de otra nota]] para conectar ideas."
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
            <div className="markdown-preview">
              {content ? (
                <MarkdownViewer content={content} />
              ) : (
                <span className="text-zinc-600 italic text-sm">
                  La previsualización en Markdown aparecerá aquí a medida que escribas...
                </span>
              )}
            </div>
          </div>

          {/* Footer actions */}
          <div className="modal-footer mt-5">
            <button
              type="button"
              onClick={requestClose}
              className="button ghost"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="button primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Guardando…' : initialData ? 'Guardar Cambios' : 'Guardar Nota'}
            </button>
          </div>
      </form>
    </Dialog>
  );
}
