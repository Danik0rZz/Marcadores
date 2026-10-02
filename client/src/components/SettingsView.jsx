import React, { useState, useEffect } from 'react';
import { 
  Trash2, 
  RotateCcw, 
  Download, 
  Upload, 
  FileUp, 
  FileText, 
  Bookmark, 
  HardDrive,
  Replace
} from 'lucide-react';
import { 
  fetchTrash, 
  restoreTrashItem, 
  destroyTrashItem, 
  emptyTrash, 
  importBackup, 
  importHtmlBookmarks,
  downloadBackup,
  fetchStorageInfo,
  IS_BROWSER_BACKEND
} from '../api';

export default function SettingsView({
  onRefreshData,
  onShowToast
}) {
  const [trashItems, setTrashItems] = useState([]);
  const [loadingTrash, setLoadingTrash] = useState(true);
  const [trashError, setTrashError] = useState(null);

  // Without the error state a server failure would look like an empty trash.
  const applyTrashResult = (items, error) => {
    if (items) setTrashItems(items);
    setTrashError(error);
    setLoadingTrash(false);
  };

  const loadTrash = async () => {
    try {
      applyTrashResult(await fetchTrash(), null);
    } catch (err) {
      applyTrashResult(null, err.message);
    }
  };

  const [storage, setStorage] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetchStorageInfo().then(info => !cancelled && setStorage(info)).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchTrash()
      .then(items => !cancelled && applyTrashResult(items, null))
      .catch(err => !cancelled && applyTrashResult(null, err.message));
    return () => {
      cancelled = true;
    };
  }, []);

  const runAction = async (action, successTitle, successMessage) => {
    try {
      const result = await action();
      await loadTrash();
      onRefreshData();
      onShowToast(successTitle, typeof successMessage === 'function' ? successMessage(result) : successMessage);
    } catch (err) {
      onShowToast('Error', err.message, true);
    }
  };

  const handleRestore = (type, id) =>
    runAction(() => restoreTrashItem(type, id), 'Elemento restaurado', 'Ha vuelto a su categoría original.');

  const handleDestroy = (type, id) => {
    if (!window.confirm('¿Eliminar este elemento definitivamente? Esta acción no se puede deshacer.')) return;
    runAction(() => destroyTrashItem(type, id), 'Elemento eliminado', 'El registro se borró definitivamente.');
  };

  const handleEmptyTrash = () => {
    if (!window.confirm('¿Estás seguro de vaciar toda la papelera permanentemente?')) return;
    runAction(emptyTrash, 'Papelera vaciada', 'Se eliminaron todos los elementos archivados.');
  };

  const handleExportJson = async () => {
    try {
      await downloadBackup();
    } catch (err) {
      onShowToast('Error', err.message, true);
    }
  };

  const readSelectedFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow choosing the same file again
    return file ? file.text() : null;
  };

  const handleImportJsonFile = async (e, mode) => {
    const pending = readSelectedFile(e);
    if (!pending) return;
    if (mode === 'overwrite' &&
        !window.confirm('Se borrarán TODOS los marcadores, notas, tags y vínculos actuales y se reemplazarán por el contenido del archivo. ¿Continuar?')) {
      return;
    }

    let json;
    try {
      json = JSON.parse(await pending);
    } catch {
      onShowToast('Error', 'El archivo no es un JSON válido.', true);
      return;
    }
    runAction(() => importBackup(json, mode), 'Copia importada', (res) => res.message);
  };

  const handleImportHtmlFile = async (e) => {
    const pending = readSelectedFile(e);
    if (!pending) return;
    const html = await pending;
    runAction(() => importHtmlBookmarks(html, 'Importados'), 'Marcadores importados', (res) => res.message);
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Configuración y mantenimiento</div>
          <h1 className="page-title">Ajustes, Backups y Papelera</h1>
          <p className="page-subtitle">
            Exportá o importá tu biblioteca, administrá la base de datos SQLite y recuperá o eliminá elementos de la papelera.
          </p>
        </div>
      </div>

      <div className="dashboard-grid">
        {/* Left Column: Backups and Storage */}
        <div className="space-y-4">
          <section className="panel">
            <div className="panel-head">
              <span className="panel-title">Copias de Seguridad (Exportar / Importar)</span>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-zinc-400">
                Podés guardar copias completas de tus marcadores, notas, taxonomía y relaciones cruzadas en formato JSON estructurado.
              </p>
              
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleExportJson}
                  className="button primary"
                >
                  <Download size={15} />
                  <span>Exportar JSON Completo</span>
                </button>

                <label className="button ghost border border-white/10 cursor-pointer">
                  <Upload size={15} />
                  <span>Restaurar desde JSON</span>
                  <input
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={(e) => handleImportJsonFile(e, 'append')}
                  />
                </label>

                <label className="button ghost border border-white/10 cursor-pointer">
                  <Replace size={15} />
                  <span>Reemplazar todo desde JSON</span>
                  <input
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={(e) => handleImportJsonFile(e, 'overwrite')}
                  />
                </label>

                <label className="button ghost border border-white/10 cursor-pointer">
                  <FileUp size={15} />
                  <span>Importar HTML (Chrome / Firefox)</span>
                  <input
                    type="file"
                    accept=".html"
                    className="hidden"
                    onChange={handleImportHtmlFile}
                  />
                </label>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <span className="panel-title">
                {IS_BROWSER_BACKEND ? 'Datos guardados en este navegador' : 'Base de Datos Local SQLite'}
              </span>
            </div>
            <div className="p-5 space-y-3 text-xs text-zinc-300">
              <div className="flex items-center gap-2">
                <HardDrive size={16} className="text-emerald-400" />
                {IS_BROWSER_BACKEND ? (
                  <span>SQLite (WebAssembly) guardado en el <strong>IndexedDB</strong> de este navegador</span>
                ) : (
                  <span>Archivo físico de persistencia: <strong>data/app.db</strong> (o la ruta de <code>DB_PATH</code>)</span>
                )}
              </div>
              {IS_BROWSER_BACKEND ? (
                <p className="text-zinc-500">
                  Tus datos no salen de este navegador: no se suben a ningún servidor. Si borrás los datos del sitio,
                  usás otro navegador o una ventana privada, no vas a verlos. Exportá un backup JSON para conservarlos
                  o pasarlos a otro equipo; el mismo archivo funciona con la versión local.
                </p>
              ) : (
                <p className="text-zinc-500">
                  Operando en modo WAL (Write-Ahead Logging) con integridad referencial, índices compuestos y caché en RAM para latencia sub-milisegundo.
                </p>
              )}
              {storage && !storage.persistent && (
                <p role="alert" className="text-red-300">
                  Este navegador no permite guardar datos ({storage.error}). Los cambios se perderán al cerrar la página:
                  exportá un backup antes de salir.
                </p>
              )}
            </div>
          </section>
        </div>

        {/* Right Column: Trash / Recycle Bin */}
        <div>
          <section className="panel">
            <div className="panel-head flex items-center justify-between">
              <span className="panel-title">Papelera de Reciclaje</span>
              {trashItems.length > 0 && (
                <button
                  type="button"
                  onClick={handleEmptyTrash}
                  className="button small danger"
                  title="Vaciar todos los elementos definitivamente"
                >
                  <Trash2 size={13} />
                  <span>Vaciar papelera</span>
                </button>
              )}
            </div>

            <div className="p-4">
              {loadingTrash ? (
                <div className="py-8 text-center text-xs text-zinc-500">
                  Cargando papelera...
                </div>
              ) : trashError ? (
                <div className="py-8 text-center text-xs text-red-300" role="alert">
                  No se pudo cargar la papelera: {trashError}
                </div>
              ) : trashItems.length === 0 ? (
                <div className="py-12 text-center text-zinc-500 text-xs">
                  <Trash2 size={24} className="mx-auto mb-2 opacity-30" />
                  La papelera está vacía.
                </div>
              ) : (
                <div className="trash-list">
                  {trashItems.map(item => {
                    const isNote = item.type === 'note';
                    return (
                      <div key={`${item.type}-${item.id}`} className="trash-item">
                        <div className="recent-icon">
                          {isNote ? <FileText size={15} /> : <Bookmark size={15} />}
                        </div>
                        <div className="trash-copy">
                          <strong>{item.title}</strong>
                          <span>
                            {isNote ? 'Nota' : 'Marcador'} · {item.category || 'Sin categoría'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleRestore(item.type, item.id)}
                            className="icon-button text-emerald-400"
                            title="Restaurar a biblioteca"
                            aria-label={`Restaurar ${item.title}`}
                          >
                            <RotateCcw size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDestroy(item.type, item.id)}
                            className="icon-button danger"
                            title="Eliminar definitivamente"
                            aria-label={`Eliminar definitivamente ${item.title}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
