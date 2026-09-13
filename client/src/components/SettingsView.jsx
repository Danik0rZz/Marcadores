import React, { useState, useEffect } from 'react';
import { 
  Trash2, 
  RotateCcw, 
  Download, 
  Upload, 
  FileUp, 
  FileText, 
  Bookmark, 
  HardDrive
} from 'lucide-react';
import { 
  fetchTrash, 
  restoreTrashItem, 
  destroyTrashItem, 
  emptyTrash, 
  importBackup, 
  importHtmlBookmarks,
  API_BASE_URL 
} from '../api';

export default function SettingsView({
  onRefreshData,
  onShowToast
}) {
  const [trashItems, setTrashItems] = useState([]);
  const [loadingTrash, setLoadingTrash] = useState(false);

  const loadTrash = async () => {
    setLoadingTrash(true);
    try {
      const items = await fetchTrash();
      setTrashItems(items);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingTrash(false);
    }
  };

  useEffect(() => {
    loadTrash();
  }, []);

  const handleRestore = async (type, id) => {
    try {
      await restoreTrashItem(type, id);
      await loadTrash();
      onRefreshData();
      if (onShowToast) onShowToast('Elemento restaurado', 'Ha vuelto a su categoría original.');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDestroy = async (type, id) => {
    if (!window.confirm('¿Eliminar este elemento definitivamente? Esta acción no se puede deshacer.')) return;
    try {
      await destroyTrashItem(type, id);
      await loadTrash();
      onRefreshData();
      if (onShowToast) onShowToast('Elemento eliminado', 'El registro se borró definitivamente.');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleEmptyTrash = async () => {
    if (!window.confirm('¿Estás seguro de vaciar toda la papelera permanentemente?')) return;
    try {
      await emptyTrash();
      await loadTrash();
      onRefreshData();
      if (onShowToast) onShowToast('Papelera vaciada', 'Se eliminaron todos los elementos archivados.');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleExportJson = () => {
    window.location.href = `${API_BASE_URL}/backup/export`;
  };

  const handleImportJsonFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target.result);
        await importBackup(json, 'append');
        onRefreshData();
        loadTrash();
        if (onShowToast) onShowToast('Copia importada', 'Los elementos fueron integrados a la base de datos.');
      } catch (err) {
        alert('Error al procesar el archivo JSON: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleImportHtmlFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const html = event.target.result;
        const res = await importHtmlBookmarks(html, 'Importados');
        onRefreshData();
        loadTrash();
        if (onShowToast) onShowToast('Marcadores importados', `Se importaron ${res.count || 0} marcadores.`);
      } catch (err) {
        alert('Error al importar marcadores HTML: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
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
                    onChange={handleImportJsonFile}
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
              <span className="panel-title">Base de Datos Local SQLite</span>
            </div>
            <div className="p-5 space-y-3 text-xs text-zinc-300">
              <div className="flex items-center gap-2">
                <HardDrive size={16} className="text-emerald-400" />
                <span>Archivo físico de persistencia: <strong>data/app.db</strong></span>
              </div>
              <p className="text-zinc-500">
                Operando en modo WAL (Write-Ahead Logging) con integridad referencial, índices compuestos y caché en RAM para latencia sub-milisegundo.
              </p>
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
                          >
                            <RotateCcw size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDestroy(item.type, item.id)}
                            className="icon-button danger"
                            title="Eliminar definitivamente"
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
