import React from 'react';
import { 
  Bookmark, 
  FileText, 
  Layers, 
  GitMerge, 
  ArrowRight,
  Database,
  Trash2
} from 'lucide-react';

export default function HomeDashboard({
  stats,
  onNavigateTab,
  onOpenNoteDetail,
  onOpenBookmark,
  onOpenSettings
}) {
  const categories = stats?.categoryBreakdown || [];
  const maxCategoryCount = Math.max(...categories.map(c => c.count), 1);
  const recent = stats?.recentActivity || [];

  return (
    <div>
      {/* Page Header */}
      <div className="page-head">
        <div>
          <div className="eyebrow">Dashboard de conocimiento</div>
          <h1 className="page-title">Vista General</h1>
          <p className="page-subtitle">
            Resumen de tu biblioteca digital, categorías taxonómicas y actividad reciente sincronizada en SQLite.
          </p>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="metric-grid">
        <div className="metric primary-metric">
          <div className="metric-label">
            <Bookmark size={16} />
            <span>Marcadores Guardados</span>
          </div>
          <div className="metric-value">{stats?.totalBookmarks ?? 0}</div>
          <div className="metric-note">Enlaces clasificados con favicon y metadatos</div>
        </div>

        <div className="metric">
          <div className="metric-label">
            <FileText size={16} />
            <span>Notas Personales</span>
          </div>
          <div className="metric-value">{stats?.totalNotes ?? 0}</div>
          <div className="metric-note">Documentación técnica con soporte WikiLinks</div>
        </div>

        <div className="metric">
          <div className="metric-label">
            <Layers size={16} />
            <span>Categorías Activas</span>
          </div>
          <div className="metric-value">{stats?.totalCategories ?? 0}</div>
          <div className="metric-note">Ramas taxonómicas en el árbol lateral</div>
        </div>

        <div className="metric">
          <div className="metric-label">
            <GitMerge size={16} />
            <span>Vínculos Cruzados</span>
          </div>
          <div className="metric-value">{stats?.totalManualRelations ?? 0}</div>
          <div className="metric-note">Relaciones entre notas y marcadores</div>
        </div>
      </div>

      {/* Main Dashboard Panels */}
      <div className="dashboard-grid">
        {/* Left Column: Category Breakdown */}
        <div>
          <section className="panel">
            <div className="panel-head">
              <span className="panel-title">Distribución por Categorías</span>
              <span className="panel-meta">{categories.length} categorías</span>
            </div>
            <div className="breakdown">
              {categories.length === 0 ? (
                <div className="py-8 text-center text-xs text-zinc-500">
                  No hay categorías registradas aún.
                </div>
              ) : (
                categories.map(cat => {
                  const percent = Math.round((cat.count / maxCategoryCount) * 100);
                  return (
                    <div key={cat.category} className="breakdown-row">
                      <div className="breakdown-name" title={cat.category}>
                        {cat.category}
                      </div>
                      <div className="bar-track">
                        <div 
                          className="bar-fill" 
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <div className="breakdown-count">{cat.count}</div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>

        {/* Right Column: Recent Activity & System Status */}
        <div>
          <section className="panel">
            <div className="panel-head">
              <span className="panel-title">Última actividad</span>
              <span className="panel-meta">{recent.length} recientes</span>
            </div>
            <div className="recent-list">
              {recent.length === 0 ? (
                <div className="py-8 text-center text-xs text-zinc-500">
                  No hay actividad reciente registrada.
                </div>
              ) : (
                recent.map(item => {
                  const isNote = item.type === 'note';
                  return (
                    <button
                      key={`${item.type}-${item.id}`}
                      className="recent-item"
                      type="button"
                      onClick={() => {
                        if (isNote) {
                          onOpenNoteDetail(item);
                        } else if (item.url) {
                          window.open(item.url, '_blank', 'noopener,noreferrer');
                        }
                      }}
                      title={`Abrir ${item.title}`}
                    >
                      <div className="recent-icon">
                        {isNote ? <FileText size={15} /> : <Bookmark size={15} />}
                      </div>
                      <div className="recent-copy">
                        <strong>{item.title}</strong>
                        <span>
                          {isNote ? 'Nota' : 'Marcador'} · {item.category || 'General'}
                        </span>
                      </div>
                      <ArrowRight size={13} className="text-zinc-600 mr-1" />
                    </button>
                  );
                })
              )}
            </div>
          </section>

          {/* Quick Access to Settings & Trash */}
          <section className="panel">
            <div className="panel-head">
              <span className="panel-title">Almacenamiento y Papelera</span>
            </div>
            <div className="p-4 space-y-3 text-xs text-zinc-400">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Database size={14} className="text-emerald-400" />
                  Base de datos local SQLite:
                </span>
                <span className="font-mono text-zinc-300">app.db (WAL)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Trash2 size={14} className="text-amber-400" />
                  Elementos en papelera:
                </span>
                <span className="font-mono text-zinc-300">{stats?.trashCount || 0}</span>
              </div>
              <div className="pt-2 border-t border-white/5 flex justify-end">
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1 font-medium"
                >
                  Ir a Ajustes y Backups <ArrowRight size={12} />
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
