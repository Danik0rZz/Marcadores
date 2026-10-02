import React, { useEffect, useId, useState } from 'react';
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
  Video,
  Folder
} from 'lucide-react';
import { fetchBookmarkMetadata } from '../api';
import { getFaviconUrl } from '../utils/favicon';
import { useFormState, confirmDiscard } from '../hooks/useFormState';
import Dialog from './Dialog';
import TagInput from './TagInput';
import TaxonomyFields from './TaxonomyFields';

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

// A half-typed URL such as "https://" makes new URL() throw; never let that crash render.
function previewDomain(url) {
  if (!url) return 'dominio.com';
  try {
    return new URL(url, 'https://ejemplo.com').hostname.replace(/^www\./, '') || 'dominio.com';
  } catch {
    return 'dominio.com';
  }
}

function isWebUrl(url) {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Render only while open, with a `key` per edited bookmark: state is
 * initialized from `initialData` on mount instead of being reset by an effect.
 * `onSubmit` returns a promise resolving to true when the save succeeded.
 */
export default function BookmarkFormModal({
  onClose,
  onSubmit,
  initialData = null,
  taxonomy = {}
}) {
  const id = useId();
  const [form, setField, isDirty, setForm] = useFormState({
    title: initialData?.title || '',
    url: initialData?.url || '',
    description: initialData?.description || '',
    category: initialData?.category || '',
    subcategory: initialData?.subcategory || '',
    theme: initialData?.theme || initialData?.reason || '',
    color: initialData?.color || '#10b981',
    icon: initialData?.icon || 'bookmark',
    tags: initialData?.tags || []
  });
  const [error, setError] = useState('');
  const [isFetchingMeta, setIsFetchingMeta] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // The favicon preview hits a remote service: wait until typing pauses.
  const [faviconUrl, setFaviconUrl] = useState(form.url);
  useEffect(() => {
    const timer = setTimeout(() => setFaviconUrl(form.url), 500);
    return () => clearTimeout(timer);
  }, [form.url]);

  const requestClose = () => {
    if (!isSubmitting && confirmDiscard(isDirty)) onClose();
  };

  const handleAutoFetch = async () => {
    if (!isWebUrl(form.url.trim())) {
      setError('Ingresá una URL que empiece con http:// o https:// para autodetectar.');
      return;
    }
    setIsFetchingMeta(true);
    try {
      const meta = await fetchBookmarkMetadata(form.url.trim());
      // Fill only fields that are still empty when the response arrives:
      // the user may have typed a title while the request was in flight.
      setForm(prev => ({
        ...prev,
        title: prev.title || meta.title || '',
        description: prev.description || meta.description || ''
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setIsFetchingMeta(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!form.title.trim() || !form.url.trim() || !form.category.trim()) {
      setError('Por favor completá Título, URL y Categoría.');
      return;
    }
    // Only http(s): a javascript: or data: URL would run code when opened.
    if (!isWebUrl(form.url.trim())) {
      setError('Por favor ingresá una URL válida que empiece con http:// o https://');
      return;
    }

    setIsSubmitting(true);
    const saved = await onSubmit({
      title: form.title.trim(),
      url: form.url.trim(),
      description: form.description.trim(),
      category: form.category.trim(),
      subcategory: form.subcategory.trim(),
      theme: form.theme.trim(),
      color: form.color,
      icon: form.icon,
      tags: form.tags
    });
    if (!saved) setIsSubmitting(false);
  };

  const SelectedIconComponent = ICONS_MAP[form.icon] || Bookmark;
  const faviconSrc = getFaviconUrl(faviconUrl);

  return (
    <Dialog onClose={requestClose} labelledBy={`${id}-title`} className="modal wide">
      {/* Header */}
      <div className="modal-head">
        <div className="modal-head-copy">
          <h2 id={`${id}-title`}>{initialData ? 'Editar Marcador' : 'Nuevo Marcador'}</h2>
          <p>Configurá la taxonomía, URL y aspecto visual con previsualización en tiempo real.</p>
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

      {/* Body with two columns: Form & Live Preview */}
      <form onSubmit={handleSubmit} className="modal-body">
        {error && (
          <div role="alert" className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-xs font-medium">
            {error}
          </div>
        )}

        <div className="bookmark-appearance">
          {/* Left Column: Form inputs */}
          <div className="appearance-controls">
            <div className="field">
              <label htmlFor={`${id}-name`}>Título del marcador *</label>
              <input
                id={`${id}-name`}
                type="text"
                required
                data-autofocus
                placeholder="ej. Documentación de React 19"
                value={form.title}
                onChange={(e) => setField('title', e.target.value)}
                className="input"
              />
            </div>

            {/* URL with Autofetch button */}
            <div className="field">
              <label htmlFor={`${id}-url`}>URL / Enlace web *</label>
              <div className="flex gap-2">
                <input
                  id={`${id}-url`}
                  type="url"
                  required
                  placeholder="https://ejemplo.com"
                  value={form.url}
                  onChange={(e) => setField('url', e.target.value)}
                  className="input flex-1"
                />
                <button
                  type="button"
                  onClick={handleAutoFetch}
                  disabled={isFetchingMeta || !form.url.trim()}
                  className="button small ghost text-emerald-400 hover:text-emerald-300"
                  title="Autocompletar título y descripción desde la web"
                >
                  {isFetchingMeta ? (
                    <Loader2 size={14} className="animate-spin" aria-label="Buscando datos" />
                  ) : (
                    <>
                      <Sparkles size={14} />
                      <span>Autodetectar</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <TaxonomyFields
              taxonomy={taxonomy}
              values={form}
              onChange={setField}
              layout="stack"
            />

            <TagInput tags={form.tags} onChange={(tags) => setField('tags', tags)} />

            <div className="field">
              <label htmlFor={`${id}-description`}>Descripción o notas rápidas</label>
              <textarea
                id={`${id}-description`}
                rows={2}
                placeholder="Breve resumen del contenido o para qué sirve este recurso..."
                value={form.description}
                onChange={(e) => setField('description', e.target.value)}
                className="textarea"
              />
            </div>

            {/* Appearance: Color Picker */}
            <div className="appearance-group" role="radiogroup" aria-labelledby={`${id}-color-label`}>
              <span className="appearance-label" id={`${id}-color-label`}>Color de acento temático</span>
              <div className="color-picker">
                {COLOR_PALETTE.map(c => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={form.color === c}
                    aria-label={c}
                    onClick={() => setField('color', c)}
                    className={`color-option ${form.color === c ? 'selected' : ''}`}
                    style={{ '--color': c }}
                    title={c}
                  />
                ))}
              </div>
            </div>

            {/* Appearance: Icon Picker */}
            <div className="appearance-group" role="radiogroup" aria-labelledby={`${id}-icon-label`}>
              <span className="appearance-label" id={`${id}-icon-label`}>Icono representativo</span>
              <div className="icon-picker">
                {Object.keys(ICONS_MAP).map(key => {
                  const IconComp = ICONS_MAP[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      role="radio"
                      aria-checked={form.icon === key}
                      aria-label={key}
                      onClick={() => setField('icon', key)}
                      className={`icon-option ${form.icon === key ? 'selected' : ''}`}
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
          <div className="bookmark-preview-panel" aria-hidden="true">
            <div className="preview-panel-title">Previsualización en tiempo real</div>

            <div className="text-xs text-zinc-500 mb-2">Vista en tarjeta:</div>
            <div
              className="bookmark-preview-card"
              style={{ '--accent': form.color }}
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
                  <strong>{form.title || 'Título del marcador'}</strong>
                  <div className="preview-taxonomy">
                    {form.category || 'Categoría'} {form.subcategory ? `/ ${form.subcategory}` : ''}
                  </div>
                </div>
              </div>

              <div className="preview-description">
                {form.description || 'Aquí aparecerá la descripción del enlace a medida que la escribas...'}
              </div>

              <div className="preview-card-foot">
                <Globe size={11} />
                <div className="preview-card-domain">
                  {previewDomain(form.url)}
                </div>
              </div>
            </div>

            <div className="mt-5 p-3 rounded-lg bg-black/40 border border-white/5 text-[11px] text-zinc-400 space-y-1">
              <div><strong>Acento:</strong> <span className="font-mono">{form.color}</span></div>
              <div><strong>Icono:</strong> <span className="font-mono">{form.icon}</span></div>
              <div><strong>Tags:</strong> {form.tags.length > 0 ? form.tags.map(t => `#${t}`).join(', ') : 'Ninguno'}</div>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="modal-footer mt-6">
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
            {isSubmitting ? 'Guardando…' : initialData ? 'Guardar Cambios' : 'Crear Marcador'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
