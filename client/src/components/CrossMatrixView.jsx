import React, { useState } from 'react';
import { 
  GitMerge, 
  Bookmark, 
  FileText, 
  CheckCircle2, 
  ArrowRightLeft, 
  ExternalLink, 
  Search, 
  Link2,
  Trash2,
  Layers,
  Tag as TagIcon
} from 'lucide-react';

export default function CrossMatrixView({
  relations = [],
  onUnlinkManual,
  onNavigateToBookmark,
  onNavigateToNote
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all'); // 'all' | 'manual' | 'tags' | 'category' | 'high'

  const filteredRelations = relations.filter((rel) => {
    // Text search
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      rel.bookmarkTitle.toLowerCase().includes(term) ||
      rel.noteTitle.toLowerCase().includes(term) ||
      rel.bookmarkCategory.toLowerCase().includes(term) ||
      rel.noteCategory.toLowerCase().includes(term);

    if (!matchesSearch) return false;

    if (filterType === 'manual') return rel.relationship.isManual;
    if (filterType === 'tags') return rel.relationship.sharedTags?.length > 0;
    if (filterType === 'category') return rel.relationship.matchedCategory;
    if (filterType === 'high') return rel.relationship.score >= 100;

    return true;
  });

  return (
    <div className="space-y-6">
      {/* Intro banner */}
      <div className="bg-gradient-to-r from-emerald-950/40 via-slate-800/60 to-slate-800/40 border border-emerald-500/20 rounded-2xl p-5 backdrop-blur-sm shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 flex-shrink-0">
              <ArrowRightLeft className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span>Matriz de Cruce y Afinidades Taxonómicas</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30">
                  {relations.length} conexiones activas
                </span>
              </h2>
              <p className="text-xs text-slate-300 mt-0.5 max-w-2xl leading-relaxed">
                Este tablero analiza y expone todas las conexiones cruzadas entre tus marcadores del navegador y tus notas, correlacionando coincidencias de categoría, subcategoría, tema, tags y vínculos directos.
              </p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-4 pt-4 border-t border-slate-700/60 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 flex-wrap text-xs">
            <span className="text-slate-400 font-medium mr-1">Filtrar por:</span>
            {[
              { id: 'all', label: 'Todas las relaciones' },
              { id: 'high', label: 'Alta afinidad (100+ pts)' },
              { id: 'tags', label: 'Con tags compartidos' },
              { id: 'category', label: 'Misma categoría' },
              { id: 'manual', label: 'Vínculos manuales' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFilterType(f.id)}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                  filterType === f.id
                    ? 'bg-emerald-500 text-slate-950 shadow-sm'
                    : 'bg-slate-900/80 hover:bg-slate-700 text-slate-300 border border-slate-700'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar en conexiones..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1 text-xs rounded-lg bg-slate-900 border border-slate-700 text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>
      </div>

      {/* Relations Grid */}
      {filteredRelations.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-slate-800 rounded-2xl bg-slate-900/30">
          <GitMerge className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-base font-semibold text-slate-300">No hay conexiones que coincidan con los filtros</p>
          <p className="text-xs text-slate-500 mt-1">
            Probá seleccionar "Todas las relaciones" o creá notas y marcadores con categorías/tags similares.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredRelations.map((rel, idx) => (
            <div
              key={`${rel.bookmarkId}-${rel.noteId}-${idx}`}
              className="bg-slate-800/60 hover:bg-slate-800/90 border border-slate-700/80 rounded-xl p-4 transition-all duration-150"
            >
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                
                {/* Left: Bookmark */}
                <div className="md:col-span-4 bg-slate-900/70 p-3 rounded-lg border border-slate-700/50">
                  <div className="flex items-center justify-between text-[11px] text-cyan-400 font-semibold mb-1">
                    <span className="flex items-center gap-1">
                      <Bookmark className="w-3.5 h-3.5" /> Marcador
                    </span>
                    <span className="px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-300">
                      {rel.bookmarkCategory}
                    </span>
                  </div>
                  <h4 className="text-sm font-semibold text-white truncate">
                    {rel.bookmarkTitle}
                  </h4>
                </div>

                {/* Center: Relationship details & Score */}
                <div className="md:col-span-4 flex flex-col items-center justify-center text-center px-2">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {rel.relationship.score} pts de afinidad
                    </span>
                    {rel.relationship.isManual && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-600 text-white font-semibold flex items-center gap-1">
                        <Link2 className="w-2.5 h-2.5" /> Manual
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-1">
                    {rel.relationship.matchThemes.map((m, mIdx) => (
                      <span
                        key={mIdx}
                        className="text-[10px] px-2 py-0.5 rounded bg-slate-900/90 text-slate-300 border border-slate-700 inline-flex items-center gap-1"
                      >
                        <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                        {m}
                      </span>
                    ))}
                  </div>

                  {rel.relationship.isManual && (
                    <button
                      onClick={() => onUnlinkManual(rel.bookmarkId, rel.noteId)}
                      className="mt-2 text-[10px] text-rose-400 hover:text-rose-300 flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" /> Desvincular enlace manual
                    </button>
                  )}
                </div>

                {/* Right: Note */}
                <div className="md:col-span-4 bg-slate-900/70 p-3 rounded-lg border border-slate-700/50">
                  <div className="flex items-center justify-between text-[11px] text-indigo-400 font-semibold mb-1">
                    <span className="flex items-center gap-1">
                      <FileText className="w-3.5 h-3.5" /> Nota
                    </span>
                    <span className="px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-300">
                      {rel.noteCategory}
                    </span>
                  </div>
                  <h4 className="text-sm font-semibold text-white truncate">
                    {rel.noteTitle}
                  </h4>
                </div>

              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
