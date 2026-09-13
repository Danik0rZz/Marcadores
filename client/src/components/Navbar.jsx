import React from 'react';
import { 
  Bookmark, 
  FileText, 
  GitMerge, 
  Plus, 
  Search, 
  Database, 
  Layers,
  Network
} from 'lucide-react';

export default function Navbar({ 
  currentTab, 
  setCurrentTab, 
  stats, 
  searchQuery, 
  setSearchQuery, 
  onNewBookmark, 
  onNewNote,
  onOpenBackup
}) {
  return (
    <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          
          {/* Logo / Brand */}
          <div className="flex items-center space-x-3 cursor-pointer select-none" onClick={() => setCurrentTab('bookmarks')}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Layers className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold tracking-tight text-white">Nexus</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-medium">
                  Taxonomía Cruzada
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">Marcadores & Notas Clasificadas</p>
            </div>
          </div>

          {/* Search bar */}
          <div className="flex-1 max-w-md relative hidden md:block">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Buscar por título, contenido, tema, tags..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-sm rounded-lg bg-slate-800/80 border border-slate-700 text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white px-1.5 py-0.5 rounded bg-slate-700"
              >
                ✕
              </button>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            <button
              onClick={onNewBookmark}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white shadow-sm transition-colors"
              title="Añadir nuevo marcador"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Marcador</span>
            </button>

            <button
              onClick={onNewNote}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition-colors"
              title="Añadir nueva nota"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Nota</span>
            </button>

            <button
              onClick={onOpenBackup}
              className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-700 transition-colors"
              title="Copia de seguridad (Exportar / Importar JSON)"
            >
              <Database className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search bar on mobile */}
        <div className="pb-3 md:hidden">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Buscar marcadores y notas..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-sm rounded-lg bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex space-x-1 border-t border-slate-800/80 pt-1 overflow-x-auto">
          <button
            onClick={() => setCurrentTab('bookmarks')}
            className={`flex items-center gap-2 py-2.5 px-4 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
              currentTab === 'bookmarks'
                ? 'border-cyan-500 text-cyan-400 bg-cyan-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
            }`}
          >
            <Bookmark className="w-4 h-4" />
            <span>Marcadores</span>
            {stats?.totalBookmarks !== undefined && (
              <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                {stats.totalBookmarks}
              </span>
            )}
          </button>

          <button
            onClick={() => setCurrentTab('notes')}
            className={`flex items-center gap-2 py-2.5 px-4 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
              currentTab === 'notes'
                ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Notas</span>
            {stats?.totalNotes !== undefined && (
              <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                {stats.totalNotes}
              </span>
            )}
          </button>

          {/* New Obsidian Smartscape / Node Graph Tab */}
          <button
            onClick={() => setCurrentTab('graph')}
            className={`flex items-center gap-2 py-2.5 px-4 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
              currentTab === 'graph'
                ? 'border-purple-500 text-purple-400 bg-purple-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
            }`}
          >
            <Network className="w-4 h-4" />
            <span>Grafo Smartscape</span>
            <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20 font-semibold">
              Obsidian View
            </span>
          </button>

          <button
            onClick={() => setCurrentTab('matrix')}
            className={`flex items-center gap-2 py-2.5 px-4 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
              currentTab === 'matrix'
                ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
            }`}
          >
            <GitMerge className="w-4 h-4" />
            <span>Matriz de Cruce</span>
            <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Tabla
            </span>
          </button>
        </div>

      </div>
    </header>
  );
}
