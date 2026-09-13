import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  FileText, 
  Bold, 
  Italic, 
  Heading, 
  List, 
  Code, 
  Quote, 
  Link2,
  Columns,
  Eye,
  Edit3
} from 'lucide-react';
import MarkdownViewer from './MarkdownViewer';

export default function NoteFormModal({
  isOpen,
  onClose,
  onSubmit,
  initialData = null,
  taxonomy = {}
}) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [theme, setTheme] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState([]);
  const [error, setError] = useState('');
  const [editorMode, setEditorMode] = useState('split'); // 'split' | 'edit' | 'preview'
  const textareaRef = useRef(null);

  useEffect(() => {
    if (initialData) {
      setTitle(initialData.title || '');
      setContent(initialData.content || '');
      setCategory(initialData.category || '');
      setSubcategory(initialData.subcategory || '');
      setTheme(initialData.theme || initialData.reason || '');
      setTags(initialData.tags || []);
    } else {
      setTitle('');
      setContent('');
      setCategory('');
      setSubcategory('');
      setTheme('');
      setTags([]);
    }
    setEditorMode('split');
    setError('');
  }, [initialData, isOpen]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleAddTag = () => {
    const clean = tagInput.trim().toLowerCase().replace(/^#/, '');
    if (clean && !tags.includes(clean)) {
      setTags([...tags, clean]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove) => {
    setTags(tags.filter((t) => t !== tagToRemove));
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

  const subcategoryOptions = category
    ? (taxonomy?.subcategories || [])
        .filter(s => s.category.toLowerCase() === category.toLowerCase())
        .map(s => s.subcategory)
    : (taxonomy?.uniqueSubcategories || []);
  const themeOptions = Array.from(new Set(
    (taxonomy?.themes || [])
      .filter(t => !category || t.category.toLowerCase() === category.toLowerCase())
      .filter(t => !subcategory || t.subcategory.toLowerCase() === subcategory.toLowerCase())
      .map(t => t.theme)
  ));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim() || !category.trim()) {
      setError('Por favor completá el Título y la Categoría de la nota.');
      return;
    }

    onSubmit({
      title: title.trim(),
      content: content.trim(),
      category: category.trim(),
      subcategory: subcategory.trim(),
      theme: theme.trim(),
      tags
    });
  };

  return (
    <div 
      className="modal-layer"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal wide">
        {/* Header */}
        <div className="modal-head">
          <div className="modal-head-copy">
            <h2>{initialData ? 'Editar Nota' : 'Nueva Nota en Markdown'}</h2>
            <p>Escribí notas con sintaxis Markdown completa, bloques de código y enlaces WikiLinks [[...]].</p>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="icon-button"
            title="Cerrar modal (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="modal-body">
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-xs font-medium">
              {error}
            </div>
          )}

          {/* Title */}
          <div className="field mb-4">
            <label>Título de la nota *</label>
            <input
              type="text"
              required
              placeholder="ej. Arquitectura de Estado en React 19"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input text-base font-semibold"
            />
          </div>

          {/* Taxonomy row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <div className="field">
              <label>Categoría *</label>
              <input
                type="text"
                required
                list="noteCategoryOptions"
                placeholder="ej. Desarrollo"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="input"
              />
              <datalist id="noteCategoryOptions">
                {(taxonomy?.categories || []).map(c => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>

            <div className="field">
              <label>Subcategoría</label>
              <input
                type="text"
                list="noteSubcatOptions"
                placeholder="ej. Frontend"
                value={subcategory}
                onChange={(e) => setSubcategory(e.target.value)}
                className="input"
              />
              <datalist id="noteSubcatOptions">
                {subcategoryOptions.map(s => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>

            <div className="field">
              <label>Tema</label>
              <input
                type="text"
                list="noteThemeOptions"
                placeholder="ej. Estudio y Referencia Técnica"
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                className="input"
              />
              <datalist id="noteThemeOptions">
                {themeOptions.map(r => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </div>
          </div>

          {/* Tags */}
          <div className="field mb-4">
            <label>Etiquetas (Tags)</label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Escribí un tag y presioná enter..."
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                className="input flex-1"
              />
              <button
                type="button"
                onClick={handleAddTag}
                className="button small"
              >
                Añadir
              </button>
            </div>
            {tags.length > 0 && (
              <div className="tag-row mt-2">
                {tags.map(t => (
                  <span key={t} className="tag">
                    #{t}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(t)}
                      className="ml-1 text-zinc-400 hover:text-red-400"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Markdown Editor Toolbar & Mode Switcher */}
          <div className="editor-toolbar">
            <button
              type="button"
              onClick={() => insertMarkdown('**', '**')}
              className="icon-button"
              title="Negrita (**texto**)"
            >
              <Bold size={14} />
            </button>
            <button
              type="button"
              onClick={() => insertMarkdown('*', '*')}
              className="icon-button"
              title="Cursiva (*texto*)"
            >
              <Italic size={14} />
            </button>
            <button
              type="button"
              onClick={() => insertMarkdown('## ')}
              className="icon-button"
              title="Encabezado H2 (## título)"
            >
              <Heading size={14} />
            </button>
            <button
              type="button"
              onClick={() => insertMarkdown('- ')}
              className="icon-button"
              title="Lista con viñetas (- elemento)"
            >
              <List size={14} />
            </button>
            <button
              type="button"
              onClick={() => insertMarkdown('`', '`')}
              className="icon-button"
              title="Código en línea (`código`)"
            >
              <Code size={14} />
            </button>
            <button
              type="button"
              onClick={() => insertMarkdown('```javascript\n', '\n```')}
              className="icon-button"
              title="Bloque de código con sintaxis"
            >
              <span className="font-mono text-xs font-bold">{'{}'}</span>
            </button>
            <button
              type="button"
              onClick={() => insertMarkdown('> ')}
              className="icon-button"
              title="Cita destacada (> cita)"
            >
              <Quote size={14} />
            </button>
            <button
              type="button"
              onClick={() => insertMarkdown('[[', ']]')}
              className="icon-button text-emerald-400"
              title="Enlace WikiLink a otra nota o marcador ([[Título]])"
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
              onClick={onClose}
              className="button ghost"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="button primary"
            >
              {initialData ? 'Guardar Cambios' : 'Guardar Nota'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
