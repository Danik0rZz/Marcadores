import React, { useId, useState } from 'react';
import { X, Link2, Bookmark, FileText, Search } from 'lucide-react';
import Dialog from './Dialog';

/** Render only while open, with a `key` per source item so its state starts fresh. */
export default function ManualLinkModal({
  onClose,
  sourceItem,
  sourceType, // 'bookmark' | 'note'
  availableTargets = [], // If source is bookmark, targets are notes, and vice versa
  onLink
}) {
  const id = useId();
  const isBookmark = sourceType === 'bookmark';
  const [selectedTargetId, setSelectedTargetId] = useState('');
  const [notes, setNotes] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!sourceItem) return null;

  const filteredTargets = availableTargets.filter((t) => {
    const term = searchFilter.toLowerCase();
    const titleMatch = (t.title || '').toLowerCase().includes(term);
    const catMatch = (t.category || '').toLowerCase().includes(term);
    return titleMatch || catMatch;
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedTargetId || isSubmitting) return;

    const bmId = isBookmark ? sourceItem.id : Number(selectedTargetId);
    const nId = isBookmark ? Number(selectedTargetId) : sourceItem.id;

    setIsSubmitting(true);
    try {
      await onLink(bmId, nId, notes);
    } finally {
      setIsSubmitting(false);
    }
    onClose();
  };

  return (
    <Dialog
      onClose={onClose}
      labelledBy={`${id}-title`}
      layerClassName="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex justify-center items-center p-4"
      className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden outline-none"
    >

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Link2 className="w-4 h-4" />
            </div>
            <div>
              <h2 id={`${id}-title`} className="text-base font-bold text-white">Vincular Manualmente</h2>
              <p className="text-xs text-slate-400">Conectar un marcador con una nota específica</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Source Item */}
          <div className="p-3 rounded-lg bg-slate-800/80 border border-slate-700 text-xs">
            <span className="text-[10px] font-semibold text-slate-400 tracking-wider block mb-1">
              Elemento origen:
            </span>
            <div className="flex items-center gap-2 font-medium text-white">
              {isBookmark ? <Bookmark className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" /> : <FileText className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />}
              <span className="truncate">{sourceItem.title}</span>
            </div>
          </div>

          {/* Search Target */}
          <div>
            <label htmlFor={`${id}-target`} className="block text-xs font-semibold text-slate-300 mb-1">
              Seleccionar {isBookmark ? 'Nota a vincular' : 'Marcador a vincular'} *
            </label>
            <div className="relative mb-2">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                data-autofocus
                aria-label="Filtrar destinos por título o categoría"
                placeholder="Filtrar por título o categoría..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-slate-800 border border-slate-700 text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <select
              id={`${id}-target`}
              required
              size={5}
              value={selectedTargetId}
              onChange={(e) => setSelectedTargetId(e.target.value)}
              className="w-full text-xs rounded-lg bg-slate-800 border border-slate-700 text-slate-200 p-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {filteredTargets.map((item) => (
                <option key={item.id} value={item.id} className="p-1 rounded hover:bg-slate-700">
                  {item.title} ({item.category})
                </option>
              ))}
            </select>
          </div>

          {/* Relation theme/note */}
          <div>
            <label htmlFor={`${id}-notes`} className="block text-xs font-semibold text-slate-300 mb-1">
              Tema o descripción del vínculo (opcional)
            </label>
            <input
              id={`${id}-notes`}
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej: Referencia para el proyecto X, bibliografía de estudio..."
              className="w-full text-xs sm:text-sm rounded-lg bg-slate-800 border border-slate-700 text-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!selectedTargetId || isSubmitting}
              className="px-4 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg transition-colors"
            >
              Confirmar Vínculo
            </button>
          </div>
        </form>
    </Dialog>
  );
}
