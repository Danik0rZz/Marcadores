import React, { useState } from 'react';
import {
  Bookmark,
  GitMerge,
  Edit3,
  Trash2,
  Plus,
  Activity,
  Loader2
} from 'lucide-react';
import { getFaviconUrl } from '../utils/favicon';
import { checkBookmarkHealth, IS_BROWSER_BACKEND } from '../api';

function isInnerControl(event) {
  const control = event.target.closest('a, button, input, textarea, select');
  return control !== null && event.currentTarget.contains(control);
}

export default function BookmarkCard({
  bookmark,
  onEdit,
  onDelete,
  onViewRelated,
  onOpenManualLink
}) {
  const [imgError, setImgError] = useState(false);
  const [healthStatus, setHealthStatus] = useState(null);

  const faviconSrc = getFaviconUrl(bookmark.url);
  const accentColor = bookmark.color || '#10b981';

  let domain = '';
  try {
    domain = new URL(bookmark.url).hostname.replace(/^www\./, '');
  } catch {
    domain = bookmark.url;
  }

  const handleCheckHealth = async (e) => {
    e.stopPropagation();
    setHealthStatus({ loading: true });
    try {
      const res = await checkBookmarkHealth(bookmark.url);
      setHealthStatus({ loading: false, alive: res.alive, status: res.status, latencyMs: res.latencyMs });
    } catch {
      setHealthStatus({ loading: false, alive: false, status: 0 });
    }
  };

  return (
    <div
      className="item-card"
      style={{ '--accent': accentColor }}
      onClick={(e) => {
        if (!isInnerControl(e)) window.open(bookmark.url, '_blank', 'noopener,noreferrer');
      }}
    >
      <div className="card-top">
        {/* Symbol / Favicon */}
        <div className="item-symbol">
          {faviconSrc && !imgError ? (
            <img
              src={faviconSrc}
              alt=""
              onError={() => setImgError(true)}
              className="card-favicon"
            />
          ) : (
            <Bookmark size={20} />
          )}
        </div>

        {/* Heading */}
        <div className="card-heading">
          <h3 className="card-title" title={bookmark.title}>
            {/* The real link: keyboard, middle-click and "open in new tab" all work */}
            <a href={bookmark.url} target="_blank" rel="noopener noreferrer" className="card-title-link">
              {bookmark.title}
            </a>
          </h3>
          <div className="card-taxonomy">
            <span>{bookmark.category}</span>
            {bookmark.subcategory && (
              <>
                <span className="taxonomy-dot">/</span>
                <span>{bookmark.subcategory}</span>
              </>
            )}
            {bookmark.theme && (
              <>
                <span className="taxonomy-dot">·</span>
                <span className="text-zinc-400 font-normal">{bookmark.theme}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Description */}
      <p className="card-description">
        {bookmark.description || 'Sin descripción adicional.'}
      </p>

      {/* Tags */}
      <div className="tag-row">
        {(bookmark.tags || []).slice(0, 4).map(tag => (
          <span key={tag} className="tag">#{tag}</span>
        ))}
        {(bookmark.tags || []).length > 4 && (
          <span className="tag">+{bookmark.tags.length - 4}</span>
        )}
      </div>

      {/* Footer & Actions */}
      <div className="card-footer">
        <div className="card-meta">
          <span title={domain}>{domain}</span>
          {healthStatus && (
            <span className={`ml-2 font-mono ${healthStatus.alive ? 'text-emerald-400' : 'text-red-400'}`}>
              {healthStatus.alive ? `✓ ${healthStatus.latencyMs}ms` : '✗ offline'}
            </span>
          )}
        </div>

        <div className="card-actions">
          {/* Health check: reaching another website needs the local server */}
          {!IS_BROWSER_BACKEND && (
          <button
            type="button"
            onClick={handleCheckHealth}
            disabled={healthStatus?.loading}
            className="icon-button"
            title="Comprobar enlace"
            aria-label="Comprobar enlace"
          >
            {healthStatus?.loading ? (
              <Loader2 size={14} className="animate-spin text-emerald-400" />
            ) : (
              <Activity size={14} />
            )}
          </button>
          )}

          {/* View relations */}
          <button
            type="button"
            onClick={() => onViewRelated(bookmark)}
            className="icon-button"
            title="Ver notas relacionadas"
            aria-label="Ver notas relacionadas"
          >
            <GitMerge size={14} />
          </button>

          {/* Manual Link */}
          <button
            type="button"
            onClick={() => onOpenManualLink(bookmark)}
            className="icon-button"
            title="Vincular con una nota"
            aria-label="Vincular con una nota"
          >
            <Plus size={14} />
          </button>

          {/* Edit */}
          <button
            type="button"
            onClick={() => onEdit(bookmark)}
            className="icon-button"
            title="Editar marcador"
            aria-label="Editar marcador"
          >
            <Edit3 size={14} />
          </button>

          {/* Trash / Delete */}
          <button
            type="button"
            onClick={() => onDelete(bookmark)}
            className="icon-button danger"
            title="Mover a la papelera"
            aria-label="Mover a la papelera"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
