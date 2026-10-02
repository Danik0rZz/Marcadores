import { useCallback, useEffect, useRef, useState } from 'react';

const TOAST_DURATION_MS = 4000;

export function useToasts() {
  const [toasts, setToasts] = useState([]);
  // A counter, not Date.now(): two toasts in the same millisecond need distinct keys.
  const nextIdRef = useRef(0);
  const timersRef = useRef(new Set());

  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  const showToast = useCallback((title, message, isError = false) => {
    const id = ++nextIdRef.current;
    setToasts(prev => [...prev, { id, title, message, isError }]);
    const timer = setTimeout(() => {
      timersRef.current.delete(timer);
      setToasts(prev => prev.filter(t => t.id !== id));
    }, TOAST_DURATION_MS);
    timersRef.current.add(timer);
  }, []);

  return { toasts, showToast };
}
