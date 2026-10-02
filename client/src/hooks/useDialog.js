import { useEffect, useRef } from 'react';

// Open dialogs, innermost last. Only the top one reacts to Escape and Tab, so
// pressing Escape over a stacked modal closes that modal alone.
const openDialogs = [];

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

function focusableIn(node) {
  return [...node.querySelectorAll(FOCUSABLE)].filter(el => el.getClientRects().length > 0);
}

/**
 * Modal dialog behavior for an element rendered while `isOpen`:
 * Escape closes (top dialog only), Tab stays inside, focus moves in on open
 * (to `[data-autofocus]` or the first control) and returns to the opener on close.
 *
 * @param {boolean} isOpen
 * @param {() => void} onClose
 * @returns {import('react').RefObject<HTMLElement>} attach to the dialog element (give it tabIndex={-1})
 */
export function useDialog(isOpen, onClose) {
  const ref = useRef(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const node = ref.current;
    if (!isOpen || !node) return undefined;

    const entry = { node };
    openDialogs.push(entry);
    const opener = document.activeElement;

    if (!node.contains(document.activeElement)) {
      (node.querySelector('[data-autofocus]') || focusableIn(node)[0] || node).focus();
    }

    const handleKeyDown = (e) => {
      if (openDialogs[openDialogs.length - 1] !== entry) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current?.();
        return;
      }

      if (e.key === 'Tab') {
        const items = focusableIn(node);
        if (items.length === 0) {
          e.preventDefault();
          return;
        }
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && (document.activeElement === first || !node.contains(document.activeElement))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      openDialogs.splice(openDialogs.indexOf(entry), 1);
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [isOpen]);

  return ref;
}

/** True while any dialog is open, e.g. to pause global keyboard shortcuts. */
export function isAnyDialogOpen() {
  return openDialogs.length > 0;
}
