import React, { useState, useEffect } from 'react';
import { 
  X, 
  Bookmark, 
  Globe, 
  Sparkles, 
  Loader2, 
  Code, 
  Database, 
  Cpu, 
  Palette, 
  Briefcase, 
  BookOpen, 
  Music, 
  Video, 
  Folder
} from 'lucide-react';
import { fetchBookmarkMetadata } from '../api';
import { getFaviconUrl } from '../utils/favicon';

const COLOR_PALETTE = [
  '#10b981', // Emerald (Default)
  '#22c55e', // Green
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#6366f1', // Indigo
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#f59e0b', // Amber
  '#f97316', // Orange
  '#ef4444', // Red
  '#14b8a6', // Teal
  '#64748b'  // Slate
];

const ICONS_MAP = {
  bookmark: Bookmark,
  globe: Globe,
  code: Code,
  database: Database,
  cpu: Cpu,
  palette: Palette,
  briefcase: Briefcase,
  book: BookOpen,
  folder: Folder,
  video: Video
};

export default function BookmarkFormModal({
  isOpen,
  onClose,
  onSubmit,
  initialData = null,
  taxonomy = {}
}) {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [theme, setTheme] = useState('');
  const [color, setColor] = useState('#10b981');
  const [icon, setIcon] = useState('bookmark');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState([]);
  const [error, setError] = useState('');
  const [isFetchingMeta, setIsFetchingMeta] = useState(false);

  useEffect(() => {
    if (initialData) {
      setTitle(initialData.title || '');
      setUrl(initialData.url || '');
      setDescription(initialData.description || '');
      setCategory(initialData.category || '');
      setSubcategory(initialData.subcategory || '');
      setTheme(initialData.theme || initialData.reason || '');
      setColor(initialData.color || '#10b981');
      setIcon(initialData.icon || 'bookmark');
      setTags(initialData.tags || []);
    } else {
      setTitle('');
      setUrl('');
      setDescription('');
      setCategory('');
      setSubcategory('');
      setTheme('');
      setColor('#10b981');
      setIcon('bookmark');
      setTags([]);
    }
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

  const handleAutoFetch = async () => {
    if (!url.trim()) return;
    setIsFetchingMeta(true);
    try {
      const meta = await fetchBookmarkMetadata(url.trim());
      if (meta.title && !title) setTitle(meta.title);
      if (meta.description && !description) setDescription(meta.description);
    } catch {
      // Ignore
    } finally {
      setIsFetchingMeta(false);
    }
  };

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

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim() || !url.trim() || !category.trim()) {
      setError('Por favor completá Título, URL y Categoría.');
      return;
    }

    try {
      new URL(url.trim());
    } catch {
      setError('Por favor ingresá una URL válida (ej. https://ejemplo.com).');
      return;
    }

    onSubmit({
      title: title.trim(),
      url: url.trim(),
      description: description.trim(),
      category: category.trim(),
      subcategory: subcategory.trim(),
      theme: theme.trim(),
      color,
      icon,
      tags
    });
  };

  const SelectedIconComponent = ICONS_MAP[icon] || Bookmark;
  const faviconSrc = getFaviconUrl(url);
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
            <h2>{initialData ? 'Editar Marcador' : 'Nuevo Marcador'}</h2>
            <p>Configurá la taxonomía, URL y aspecto visual con previsualización en tiempo real.</p>
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

        {/* Body with two columns: Form & Live Preview */}
        <form onSubmit={handleSubmit} className="modal-body">
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-xs font-medium">
              {error}
            </div>
          )}

          <div className="bookmark-appearance">
            {/* Left Column: Form inputs */}
            <div className="appearance-controls">
              {/* Title */}
              <div className="field">
                <label>Título del marcador *</label>
                <input
                  type="text"
                  required
                  placeholder="ej. Documentación de React 19"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="input"
                />
              </div>

              {/* URL with Autofetch button */}
              <div className="field">
                <label>URL / Enlace web *</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    required
                    placeholder="https://ejemplo.com"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="input flex-1"
                  />
                  <button
                    type="button"
                    onClick={handleAutoFetch}
                    disabled={isFetchingMeta || !url.trim()}
                    className="button small ghost text-emerald-400 hover:text-emerald-300"
                    title="Autocompletar título y descripción desde la web"
                  >
                    {isFetchingMeta ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <>
                        <Sparkles size={14} />
                        <span>Autodetectar</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Taxonomy fields: Category, Subcategory, Theme */}
              <div className="form-grid">
                <div className="field">
                  <label>Categoría *</label>
                  <input
                    type="text"
                    required
                    list="categoryOptions"
                    placeholder="ej. Desarrollo"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="input"
                  />
                  <datalist id="categoryOptions">
                    {(taxonomy?.categories || []).map(cat => (
                      <option key={cat} value={cat} />
                    ))}
                  </datalist>
                </div>

                <div className="field">
                  <label>Subcategoría</label>
                  <input
                    type="text"
                    list="subcatOptions"
                    placeholder="ej. Frontend"
                    value={subcategory}
                    onChange={(e) => setSubcategory(e.target.value)}
                    className="input"
                  />
                  <datalist id="subcatOptions">
                    {subcategoryOptions.map(s => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="field">
                <label>Tema</label>
                <input
                  type="text"
                  list="themeOptions"
                  placeholder="ej. Estudio y Referencia Técnica"
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  className="input"
                />
                <datalist id="themeOptions">
                  {themeOptions.map(r => (
                    <option key={r} value={r} />
                  ))}
                </datalist>
              </div>

              {/* Tags */}
              <div className="field">
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

              {/* Description */}
              <div className="field">
                <label>Descripción o notas rápidas</label>
                <textarea
                  rows={2}
                  placeholder="Breve resumen del contenido o para qué sirve este recurso..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="textarea"
                />
              </div>

              {/* Appearance: Color Picker */}
              <div className="appearance-group">
                <span className="appearance-label">Color de acento temático</span>
                <div className="color-picker">
                  {COLOR_PALETTE.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={`color-option ${color === c ? 'selected' : ''}`}
                      style={{ '--color': c }}
                      title={c}
                    />
                  ))}
                </div>
              </div>

              {/* Appearance: Icon Picker */}
              <div className="appearance-group">
                <span className="appearance-label">Icono representativo</span>
                <div className="icon-picker">
                  {Object.keys(ICONS_MAP).map(key => {
                    const IconComp = ICONS_MAP[key];
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setIcon(key)}
                        className={`icon-option ${icon === key ? 'selected' : ''}`}
                        title={key}
                      >
                        <IconComp size={16} />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right Column: Live Preview Panel */}
            <div className="bookmark-preview-panel">
              <div className="preview-panel-title">Previsualización en tiempo real</div>

              <div className="text-xs text-zinc-500 mb-2">Vista en tarjeta:</div>
              <div 
                className="bookmark-preview-card" 
                style={{ '--accent': color }}
              >
                <div className="preview-card-head">
                  <div className="preview-symbol">
                    {faviconSrc ? (
                      <img src={faviconSrc} alt="" className="w-4 h-4 object-contain rounded" onError={(e) => { e.target.style.display = 'none'; }} />
                    ) : (
                      <SelectedIconComponent size={18} />
                    )}
                  </div>
                  <div className="preview-card-copy">
                    <strong>{title || 'Título del marcador'}</strong>
                    <div className="preview-taxonomy">
                      {category || 'Categoría'} {subcategory ? `/ ${subcategory}` : ''}
                    </div>
                  </div>
                </div>

                <div className="preview-description">
                  {description || 'Aquí aparecerá la descripción del enlace a medida que la escribas...'}
                </div>

                <div className="preview-card-foot">
                  <Globe size={11} />
                  <div className="preview-card-domain">
                    {url ? (new URL(url, 'https://ejemplo.com').hostname.replace(/^www\./, '')) : 'dominio.com'}
                  </div>
                </div>
              </div>

              <div className="mt-5 p-3 rounded-lg bg-black/40 border border-white/5 text-[11px] text-zinc-400 space-y-1">
                <div><strong>Acento:</strong> <span className="font-mono">{color}</span></div>
                <div><strong>Icono:</strong> <span className="font-mono">{icon}</span></div>
                <div><strong>Tags:</strong> {tags.length > 0 ? tags.map(t => `#${t}`).join(', ') : 'Ninguno'}</div>
              </div>
            </div>
          </div>

          {/* Footer actions */}
          <div className="modal-footer mt-6">
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
              {initialData ? 'Guardar Cambios' : 'Crear Marcador'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
