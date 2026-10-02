import React, { useId } from 'react';

function sameText(a, b) {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Category / subcategory / theme inputs with suggestions narrowed by the
 * level above. `values` is { category, subcategory, theme }.
 */
export default function TaxonomyFields({ taxonomy, values, onChange, layout = 'grid' }) {
  const id = useId();
  const { category, subcategory } = values;

  const subcategoryOptions = category
    ? (taxonomy?.subcategories || [])
        .filter(s => sameText(s.category, category))
        .map(s => s.subcategory)
    : (taxonomy?.uniqueSubcategories || []);
  const themeOptions = Array.from(new Set(
    (taxonomy?.themes || [])
      .filter(t => !category || sameText(t.category, category))
      .filter(t => !subcategory || sameText(t.subcategory, subcategory))
      .map(t => t.theme)
  ));

  const fields = [
    { key: 'category', label: 'Categoría *', placeholder: 'ej. Desarrollo', options: taxonomy?.categories || [], required: true },
    { key: 'subcategory', label: 'Subcategoría', placeholder: 'ej. Frontend', options: subcategoryOptions },
    { key: 'theme', label: 'Tema', placeholder: 'ej. Estudio y Referencia Técnica', options: themeOptions }
  ];

  return (
    <div className={layout === 'grid' ? 'grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4' : 'space-y-3'}>
      {fields.map(field => (
        <div key={field.key} className="field">
          <label htmlFor={`${id}-${field.key}`}>{field.label}</label>
          <input
            id={`${id}-${field.key}`}
            type="text"
            required={field.required}
            list={`${id}-${field.key}-options`}
            placeholder={field.placeholder}
            value={values[field.key]}
            onChange={(e) => onChange(field.key, e.target.value)}
            className="input"
          />
          <datalist id={`${id}-${field.key}-options`}>
            {[...new Set(field.options)].map(option => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </div>
      ))}
    </div>
  );
}
