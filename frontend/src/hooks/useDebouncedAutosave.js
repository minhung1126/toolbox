import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Hook to manage debounced autosaving of state, ensuring pending changes are
 * flushed reliably when the component unmounts without duplicate executions.
 */
export function useDebouncedAutosave({
  value,
  onSave,
  delay = 500,
  compareFn,
  onSuccess,
  onError,
}) {
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const latestValueRef = useRef(value);
  const mountedRef = useRef(true);
  const saveTimerRef = useRef(null);
  const saveChainRef = useRef(Promise.resolve());
  const pendingSaveRef = useRef(null);
  const queueSaveRef = useRef(null);
  const editVersionRef = useRef(0);
  const dirtyRef = useRef(false);

  const isSame = useCallback((a, b) => {
    if (compareFn) return compareFn(a, b);
    return a === b;
  }, [compareFn]);

  const queueSave = useCallback((nextData, { notify = false } = {}) => {
    const version = editVersionRef.current;
    const pendingSave = { version, data: nextData, promise: null };
    pendingSaveRef.current = pendingSave;
    const request = saveChainRef.current.catch(() => undefined).then(async () => {
      if (version !== editVersionRef.current) return;
      if (mountedRef.current) {
        setSaving(true);
      }
      try {
        await onSave(nextData);
        if (version !== editVersionRef.current) return;
        dirtyRef.current = false;
        if (mountedRef.current) {
          setDirty(false);
        }
        if (!mountedRef.current) return;
        await onSuccess?.(nextData, { notify });
      } catch (error) {
        if (version !== editVersionRef.current || !mountedRef.current) return;
        onError?.(error, { notify });
      } finally {
        if (version === editVersionRef.current && mountedRef.current) {
          setSaving(false);
        }
      }
    });
    pendingSave.promise = request;
    pendingSaveRef.current = pendingSave;
    saveChainRef.current = request;
    request.then(
      () => { if (pendingSaveRef.current === pendingSave) pendingSaveRef.current = null; },
      () => { if (pendingSaveRef.current === pendingSave) pendingSaveRef.current = null; },
    );
    return request;
  }, [onSave, onSuccess, onError]);

  queueSaveRef.current = queueSave;

  const scheduleSave = useCallback((nextData) => {
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      queueSave(nextData);
    }, delay);
  }, [delay, queueSave]);

  const mutate = useCallback((nextData) => {
    editVersionRef.current += 1;
    latestValueRef.current = nextData;
    dirtyRef.current = true;
    setDirty(true);
    scheduleSave(nextData);
  }, [scheduleSave]);

  const flush = useCallback(async (options = { notify: true }) => {
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    return queueSave(latestValueRef.current, options);
  }, [queueSave]);

  const reset = useCallback((nextData) => {
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    dirtyRef.current = false;
    setDirty(false);
    latestValueRef.current = nextData;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      if (!dirtyRef.current) return;

      const latestData = latestValueRef.current;
      const pendingSave = pendingSaveRef.current;
      const hasPendingLatestSave = pendingSave
        && pendingSave.version === editVersionRef.current
        && isSame(pendingSave.data, latestData);
      if (!hasPendingLatestSave) {
        queueSaveRef.current?.(latestData);
      }
    };
  }, [isSame]);

  return {
    saving,
    dirty,
    mutate,
    flush,
    reset,
    latestValueRef,
  };
}

export default useDebouncedAutosave;
