import React from 'react';
import {
  Bookmark,
  ExternalLink,
  FileText,
  GitMerge,
  Maximize2,
  X
} from 'lucide-react';
import MarkdownViewer from './MarkdownViewer';

/**
 * Instrumento inspector: the selected node's detail surface.
 * Styled with the app's card language (tokens, --radius, layered shadow)
 * from client/src/graph.css.
 */
export default function GraphInspector({
  node,
  relations = [],
  averageAffinity = 0,
  panelRef,
  onClose,
  onSelectRelated,
  onOpenNote,
  onViewRelated,
  onWikiLinkClick
}) {
  if (!node) return null;

  const isBookmark = node.type === 'bookmark';
  const typeLabel = isBookmark ? 'Marcador' : 'Nota';

  return (
    <aside
      ref={panelRef}
      tabIndex={-1}
      role="region"
      aria-labelledby="graph-inspector-title"
      className={`graph-inspector graph-inspector-${node.type}`}
    >
      <header className="graph-inspector-head">
        <span className="graph-inspector-badge" aria-hidden="true">
          {isBookmark ? <Bookmark className="graph-icon" /> : <FileText className="graph-icon" />}
        </span>
        <div className="graph-inspector-heading">
          <span className="graph-inspector-type">{typeLabel}</span>
          <h3 id="graph-inspector-title" className="graph-inspector-title">{node.title}</h3>
        </div>
        <button type="button" className="graph-btn graph-btn-icon" onClick={onClose} aria-label="Cerrar inspector">
          <X className="graph-icon" aria-hidden="true" />
        </button>
      </header>

      <div className="graph-inspector-body">
        <section className="graph-section">
          <h4 className="graph-section-title">Taxonomía</h4>
          <div className="graph-chips">
            <span className="graph-chip graph-chip-category">Cat: {node.category || '—'}</span>
            {node.subcategory && (
              <span className="graph-chip graph-chip-subcategory">Sub: {node.subcategory}</span>
            )}
            {node.theme && (
              <span className="graph-chip graph-chip-theme">Tema: {node.theme}</span>
            )}
          </div>
        </section>

        <section className="graph-section">
          <h4 className="graph-section-title">Métricas</h4>
          <dl className="graph-metrics">
            <div>
              <dt>Grado</dt>
              <dd>{node.degree}</dd>
            </div>
            <div>
              <dt>Afinidad media</dt>
              <dd>{relations.length ? averageAffinity : '—'}</dd>
            </div>
          </dl>
        </section>

        {node.tags && node.tags.length > 0 && (
          <section className="graph-section">
            <h4 className="graph-section-title">Tags</h4>
            <div className="graph-tags">
              {node.tags.map((tag) => (
                <span key={tag} className="graph-tag">#{tag}</span>
              ))}
            </div>
          </section>
        )}

        {!isBookmark && node.content && (
          <section className="graph-section">
            <h4 className="graph-section-title">
              <span>Contenido</span>
              <button type="button" className="graph-link-btn" onClick={() => onOpenNote(node)}>
                <Maximize2 className="graph-icon" aria-hidden="true" />
                Ampliar
              </button>
            </h4>
            <div className="graph-note-preview">
              <MarkdownViewer content={node.content} onWikiLinkClick={onWikiLinkClick} />
            </div>
          </section>
        )}

        <section className="graph-section">
          <h4 className="graph-section-title">
            <span>Nodos conectados</span>
            <span className="graph-section-count">{relations.length}</span>
          </h4>
          {relations.length === 0 ? (
            <p className="graph-empty">No tiene relaciones directas en este grafo.</p>
          ) : (
            <ul className="graph-related">
              {relations.map((relation) => (
                <li key={relation.key}>
                  <button
                    type="button"
                    className="graph-related-item"
                    onClick={() => onSelectRelated(relation.neighbor)}
                  >
                    <span className="graph-related-head">
                      <span className={`graph-related-dot ${relation.neighbor.type === 'bookmark' ? 'is-bookmark' : 'is-note'}`} aria-hidden="true" />
                      <span className="graph-related-name">{relation.neighbor.title}</span>
                      <span className="graph-related-score">{relation.score}</span>
                    </span>
                    <span className="graph-bar-track" aria-hidden="true">
                      <span
                        className={`graph-bar-fill ${relation.isManual ? 'is-manual' : ''}`}
                        style={{ width: `${Math.max(3, Math.min(100, relation.score))}%` }}
                      />
                    </span>
                    <span className="graph-related-meta">
                      {relation.isManual ? 'Vínculo manual' : 'Afinidad automática'}
                      {relation.themes && relation.themes.length > 0 && ` · ${relation.themes.join(' · ')}`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <footer className="graph-inspector-actions">
        {isBookmark && node.url && (
          <a
            className="graph-action"
            href={node.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink className="graph-icon" aria-hidden="true" />
            Abrir enlace
          </a>
        )}
        {!isBookmark && (
          <button type="button" className="graph-action" onClick={() => onOpenNote(node)}>
            <FileText className="graph-icon" aria-hidden="true" />
            Abrir nota
          </button>
        )}
        <button
          type="button"
          className="graph-action graph-action-primary"
          onClick={() => onViewRelated(node)}
        >
          <GitMerge className="graph-icon" aria-hidden="true" />
          Ver relaciones
        </button>
      </footer>
    </aside>
  );
}
