import React, { useId, useState } from 'react';

/** Tag editor shared by the bookmark and note forms. Tags are lowercase, without '#'. */
export default function TagInput({ tags, onChange, className = 'field' }) {
  const id = useId();
  const [draft, setDraft] = useState('');

  const addTag = () => {
    const clean = draft.trim().toLowerCase().replace(/^#/, '');
    if (clean && !tags.includes(clean)) {
      onChange([...tags, clean]);
    }
    setDraft('');
  };

  return (
    <div className={className}>
      <label htmlFor={id}>Etiquetas (Tags)</label>
      <div className="flex gap-2">
        <input
          id={id}
          type="text"
          placeholder="Escribí un tag y presioná enter..."
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addTag();
            }
          }}
          className="input flex-1"
        />
        <button type="button" onClick={addTag} className="button small">
          Añadir
        </button>
      </div>
      {tags.length > 0 && (
        <div className="tag-row mt-2">
          {tags.map(t => (
            <span key={t} className="tag">
              #{t}
              <button
                type="button"
                onClick={() => onChange(tags.filter(tag => tag !== t))}
                className="ml-1 text-zinc-400 hover:text-red-400"
                aria-label={`Quitar tag ${t}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
