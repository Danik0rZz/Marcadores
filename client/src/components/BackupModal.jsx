import React, { useState } from 'react';
import { X, Download, Upload, Database, AlertTriangle, CheckCircle2, Globe, FileCode } from 'lucide-react';
import { importBackup, importHtmlBookmarks } from '../api';

export default function BackupModal({ isOpen, onClose, onRefreshData }) {
  const [activeSection, setActiveSection] = useState('json'); // 'json' | 'html'
  const [importMode, setImportMode] = useState('append'); // 'append' | 'overwrite'
  const [fileContent, setFileContent] = useState(null);
  const [fileName, setFileName] = useState('');

  // HTML Import states
  const [htmlContent, setHtmlContent] = useState('');
  const [htmlFileName, setHtmlFileName] = useState('');
  const [htmlCategory, setHtmlCategory] = useState('Navegador');

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleExport = () => {
    window.location.href = '/api/backup/export';
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const json = JSON.parse(evt.target.result);
        setFileContent(json);
        setError(null);
      } catch {
        setError('El archivo seleccionado no es un JSON válido.');
        setFileContent(null);
      }
    };
    reader.readAsText(file);
  };

  const handleHtmlFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setHtmlFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      setHtmlContent(evt.target.result);
      setError(null);
    };
    reader.readAsText(file);
  };

  const handleImportSubmit = async () => {
    if (!fileContent) return;
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const res = await importBackup(fileContent, importMode);
      setMessage(res.message);
      onRefreshData();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleHtmlImportSubmit = async () => {
    if (!htmlContent) return;
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const res = await importHtmlBookmarks(htmlContent, htmlCategory);
      setMessage(res.message);
      onRefreshData();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex justify-center items-center p-4">
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Importar & Exportar</h2>
              <p className="text-xs text-slate-400">Copias de seguridad en JSON y marcadores de navegador HTML</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Section Switcher Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-900/50 px-6 pt-2 gap-2 text-xs font-semibold">
          <button
            onClick={() => { setActiveSection('json'); setError(null); setMessage(null); }}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors ${
              activeSection === 'json'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Backup Completo (JSON)</span>
          </button>
          <button
            onClick={() => { setActiveSection('html'); setError(null); setMessage(null); }}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors ${
              activeSection === 'html'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Marcadores del Navegador (HTML)</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {message && (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{message}</span>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {activeSection === 'json' ? (
            <>
              {/* Export Section */}
              <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700/80">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Exportar Base de Datos</h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Descargá un archivo JSON con todos tus marcadores, notas, tags y relaciones.
                    </p>
                  </div>
                  <button
                    onClick={handleExport}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-cyan-600 hover:bg-cyan-500 text-white shadow-sm transition-colors flex-shrink-0 ml-3"
                  >
                    <Download className="w-4 h-4" />
                    <span>Exportar JSON</span>
                  </button>
                </div>
              </div>

              {/* Import Section */}
              <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700/80 space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-white">Importar / Restaurar desde JSON</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Cargá un archivo JSON previamente exportado para recuperar o añadir datos.
                  </p>
                </div>

                <div className="border-2 border-dashed border-slate-700 rounded-lg p-3 text-center">
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleFileChange}
                    className="hidden"
                    id="file-upload"
                  />
                  <label
                    htmlFor="file-upload"
                    className="cursor-pointer inline-flex items-center gap-2 text-xs font-medium text-cyan-400 hover:text-cyan-300"
                  >
                    <Upload className="w-4 h-4" />
                    <span>{fileName ? `Archivo: ${fileName}` : 'Seleccionar archivo .json'}</span>
                  </label>
                </div>

                {fileContent && (
                  <div className="space-y-3 pt-2">
                    <div className="text-xs text-slate-300 bg-slate-900/60 p-2.5 rounded-lg border border-slate-700">
                      <span className="font-semibold text-cyan-400">Datos detectados: </span>
                      {fileContent.bookmarks?.length || 0} marcadores, {fileContent.notes?.length || 0} notas.
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                        Modo de importación:
                      </label>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <label
                          className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer ${
                            importMode === 'append'
                              ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300 font-semibold'
                              : 'border-slate-700 bg-slate-800 text-slate-300'
                          }`}
                        >
                          <input
                            type="radio"
                            name="mode"
                            checked={importMode === 'append'}
                            onChange={() => setImportMode('append')}
                            className="hidden"
                          />
                          <span>Anexar (Conservar actuales)</span>
                        </label>

                        <label
                          className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer ${
                            importMode === 'overwrite'
                              ? 'border-rose-500 bg-rose-500/10 text-rose-300 font-semibold'
                              : 'border-slate-700 bg-slate-800 text-slate-300'
                          }`}
                        >
                          <input
                            type="radio"
                            name="mode"
                            checked={importMode === 'overwrite'}
                            onChange={() => setImportMode('overwrite')}
                            className="hidden"
                          />
                          <span>Reemplazar todo</span>
                        </label>
                      </div>
                    </div>

                    <button
                      onClick={handleImportSubmit}
                      disabled={loading}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white shadow-sm transition-colors"
                    >
                      <Upload className="w-4 h-4" />
                      <span>{loading ? 'Importando datos...' : 'Confirmar Importación JSON'}</span>
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* HTML Browser Bookmarks Import Section */
            <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700/80 space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-white">Importar Marcadores del Navegador</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Subí el archivo <code className="text-cyan-400">bookmarks.html</code> exportado desde Chrome, Brave, Firefox o Edge.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Categoría asignada por defecto:
                </label>
                <input
                  type="text"
                  value={htmlCategory}
                  onChange={(e) => setHtmlCategory(e.target.value)}
                  className="w-full text-xs rounded-lg bg-slate-900 border border-slate-700 text-slate-200 px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  placeholder="Ej: Navegador, Chrome, Importados..."
                />
              </div>

              <div className="border-2 border-dashed border-slate-700 rounded-lg p-3 text-center">
                <input
                  type="file"
                  accept=".html,.htm"
                  onChange={handleHtmlFileChange}
                  className="hidden"
                  id="html-file-upload"
                />
                <label
                  htmlFor="html-file-upload"
                  className="cursor-pointer inline-flex items-center gap-2 text-xs font-medium text-cyan-400 hover:text-cyan-300"
                >
                  <FileCode className="w-4 h-4" />
                  <span>{htmlFileName ? `Archivo: ${htmlFileName}` : 'Seleccionar archivo .html de marcadores'}</span>
                </label>
              </div>

              {htmlContent && (
                <div className="pt-2">
                  <button
                    onClick={handleHtmlImportSubmit}
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white shadow-sm transition-colors"
                  >
                    <Upload className="w-4 h-4" />
                    <span>{loading ? 'Importando marcadores...' : 'Procesar e Importar Marcadores HTML'}</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-900/80 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs sm:text-sm bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
          >
            Cerrar
          </button>
        </div>

      </div>
    </div>
  );
}
