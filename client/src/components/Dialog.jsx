import React from 'react';
import { useDialog } from '../hooks/useDialog';

/**
 * Accessible modal shell: role="dialog", Escape / backdrop close, focus trap.
 * Render it only while open; `labelledBy` is the id of the dialog's heading.
 */
export default function Dialog({
  onClose,
  labelledBy,
  className = 'modal',
  layerClassName = 'modal-layer',
  children
}) {
  const ref = useDialog(true, onClose);

  return (
    <div
      className={layerClassName}
      // mousedown, not click: a text selection dragged out of the dialog must not close it
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={className}
      >
        {children}
      </div>
    </div>
  );
}
