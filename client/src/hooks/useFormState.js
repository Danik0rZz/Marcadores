import { useCallback, useState } from 'react';

/**
 * Form state as one object plus a dirty flag against its initial values.
 * Mount the form with a `key` per edited item so it starts fresh each time.
 *
 * @template T
 * @param {T} initialValues
 * @returns {[T, (key: keyof T, value: unknown) => void, boolean, (updater: (prev: T) => T) => void]}
 */
export function useFormState(initialValues) {
  const [initialValuesSnapshot] = useState(initialValues);
  const [values, setValues] = useState(initialValues);

  const setField = useCallback((key, value) => {
    setValues(prev => ({ ...prev, [key]: value }));
  }, []);

  const isDirty = JSON.stringify(values) !== JSON.stringify(initialValuesSnapshot);

  return [values, setField, isDirty, setValues];
}

/** Closes immediately when clean; asks before throwing away edits. */
export function confirmDiscard(isDirty) {
  return !isDirty || window.confirm('Tenés cambios sin guardar. ¿Descartarlos?');
}
