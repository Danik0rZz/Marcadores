import React, { useState } from 'react';
import { 
  X, 
  GitMerge, 
  ExternalLink, 
  FileText, 
  Bookmark, 
  Tag as TagIcon, 
  Layers, 
  FolderTree, 
  Target, 
  Plus, 
  Trash2,
  CheckCircle2,
  Sparkles,
  Link2
} from 'lucide-react';

export default function RelatedDrawerModal({
  isOpen,
  onClose,
  sourceType, // 'bookmark' | 'note'
  sourceItem,
  relatedItems = [],
  onOpenManualLink,
  onUnlinkManual,
  onSelectCounterpart
}) {
  if (!isOpen || !sourceItem) return null;

  const isBookmark = sourceType === 'bookmark';
  const titleCounterpart = isBookmark ? 'Notas Relacionadas' : 'Marcadores Relacionados';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex justify-center items-center p-4">
      <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <GitMerge className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Relaciones por Coincidencia Taxonómica</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {relatedItems.length} {relatedItems.length === 1 ? 'coincidencia' : 'coincidencias'}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                {isBookmark ? 'Notas vinculadas al marcador' : 'Marcadores vinculados a la nota'} según categoría, subcategoría, tema, tags y enlaces manuales.
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Source item preview banner */}
        <div className="px-6 py-3 bg-slate-800/40 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex-1 min-w-[200px]">
            <span className="text-[11px] tracking-wider font-semibold text-slate-400">
              Elemento analizado:
            </span>
            <div className="text-sm font-semibold text-white flex items-center gap-2 mt-0.5">
              {isBookmark ? <Bookmark className="w-4 h-4 text-cyan-400 flex-shrink-0" /> : <FileText className="w-4 h-4 text-indigo-400 flex-shrink-0" />}
              <span className="truncate">{sourceItem.title}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
              Cat: {sourceItem.category}
            </span>
            {sourceItem.subcategory && (
              <span className="px-2 py-0.5 rounded bg-violet-500/10 text-violet-300 border border-violet-500/20">
                Sub: {sourceItem.subcategory}
              </span>
            )}
            {sourceItem.theme && (
              <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                Tema: {sourceItem.theme}
              </span>
            )}
          </div>

          <button
            onClick={() => onOpenManualLink(sourceItem)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Vincular {isBookmark ? 'Nota' : 'Marcador'} manualmente</span>
          </button>
        </div>

        {/* Content list */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {relatedItems.length === 0 ? (
            <div className="text-center py-12 px-4 border border-dashed border-slate-800 rounded-xl bg-slate-900/30">
              <Sparkles className="w-8 h-8 text-slate-500 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-300">No se detectaron coincidencias automáticas</p>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                No hay {titleCounterpart.toLowerCase()} que compartan la misma categoría, subcategoría, tema o tags con este elemento. Podés asignarle tags coincidentes o vincular uno a mano.
              </p>
              <button
                onClick={() => onOpenManualLink(sourceItem)}
                className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Vincular manualmente ahora
              </button>
            </div>
          ) : (
            relatedItems.map((item, idx) => {
              const counterpart = isBookmark ? item.note : item.bookmark;
              const rel = item.relationship;

              return (
                <div 
                  key={counterpart.id} 
                  className="bg-slate-800/50 hover:bg-slate-800/80 border border-slate-700/80 rounded-xl p-4 transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 flex-1">
                      <div className="mt-0.5 p-1.5 rounded-lg bg-slate-700/50 text-slate-300">
                        {isBookmark ? <FileText className="w-4 h-4 text-indigo-400" /> : <Bookmark className="w-4 h-4 text-cyan-400" />}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-semibold text-white">
                            {counterpart.title}
                          </h4>
                          {rel.isManual && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium flex items-center gap-1">
                              <Link2 className="w-2.5 h-2.5" /> Vínculo Manual
                            </span>
                          )}
                        </div>

                        {/* URL if bookmark, content if note */}
                        {isBookmark ? (
                          <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                            {counterpart.content}
                          </p>
                        ) : (
                          <div className="mt-1">
                            <a 
                              href={counterpart.url} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="text-xs text-cyan-400 hover:underline flex items-center gap-1"
                            >
                              <span>{counterpart.url}</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                            {counterpart.description && (
                              <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{counterpart.description}</p>
                            )}
                          </div>
                        )}

                        {/* Affinity Themes / Coincidencias */}
                        <div className="mt-3 pt-2.5 border-t border-slate-700/50">
                          <span className="text-[11px] font-semibold text-slate-400 tracking-wider block mb-1.5">
                            Criterios coincidentes ({rel.score} pts de afinidad):
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {rel.matchThemes.map((theme, rIdx) => (
                              <span 
                                key={rIdx} 
                                className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-md bg-slate-700/60 text-slate-200 border border-slate-600/60"
                              >
                                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                {theme}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Tags of counterpart */}
                        {counterpart.tags && counterpart.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2.5">
                            {counterpart.tags.map(t => {
                              const isShared = rel.sharedTags?.includes(t);
                              return (
                                <span 
                                  key={t}
                                  className={`text-[10px] px-2 py-0.5 rounded-full ${
                                    isShared 
                                      ? 'bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/40' 
                                      : 'bg-slate-800 text-slate-400 border border-slate-700'
                                  }`}
                                >
                                  #{t} {isShared && '✓'}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Unlink button if manual */}
                    {rel.isManual && (
                      <button
                        onClick={() => {
                          const bmId = isBookmark ? sourceItem.id : counterpart.id;
                          const nId = isBookmark ? counterpart.id : sourceItem.id;
                          onUnlinkManual(bmId, nId);
                        }}
                        className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-700/50 rounded-lg transition-colors"
                        title="Eliminar vínculo manual"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-900/60 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-sm bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
          >
            Cerrar
          </button>
        </div>

      </div>
    </div>
  );
}
