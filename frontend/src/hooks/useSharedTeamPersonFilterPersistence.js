import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sheetsFilterApi } from '../features/sheets/api/sheetsFilterApi';
import { normalizeTeamPersonFilter } from '../utils/teamPersonFilterStorage';

function emptyStatus() {
  return {
    saving: false,
    saved: false,
    error: '',
    lastSaved: null,
  };
}

export default function useSharedTeamPersonFilterPersistence({
  team = '',
  teams,
  query = '',
  selectedPeople = /** @type {string[]} */ ([]),
  ready = false,
  initialSavedFilter,
  onSaved,
  onError,
}) {
  const filter = useMemo(
    () => normalizeTeamPersonFilter({ team, teams, query, selectedPeople }),
    [selectedPeople, team, teams, query]
  );
  const serialized = useMemo(() => JSON.stringify(filter), [filter]);
  const initialSavedSerialized = useMemo(() => {
    if (initialSavedFilter === undefined) return undefined;
    return JSON.stringify(normalizeTeamPersonFilter(initialSavedFilter || {}));
  }, [initialSavedFilter]);
  const recordRef = useRef({
    desiredFilter: null,
    desiredSerialized: '',
    desiredVersion: 0,
    lastSavedVersion: 0,
    lastSavedSerialized: initialSavedSerialized ?? '',
    inFlightPromise: null,
    timer: null,
    timerResolve: null,
    ready: false,
  });
  const mountedRef = useRef(true);
  const onSavedRef = useRef(onSaved);
  const onErrorRef = useRef(onError);
  const [status, setStatus] = useState(emptyStatus);

  useEffect(() => {
    onSavedRef.current = onSaved;
  }, [onSaved]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const updateStatus = useCallback((changes) => {
    if (!mountedRef.current) return;
    setStatus((current) => ({ ...emptyStatus(), ...current, ...changes }));
  }, []);

  const flushSave = useCallback(() => {
    const record = recordRef.current;
    if (record.inFlightPromise) return record.inFlightPromise;
    if (!record.ready || !record.desiredFilter || record.desiredVersion <= record.lastSavedVersion) {
      return Promise.resolve(null);
    }

    const version = record.desiredVersion;
    const nextFilter = record.desiredFilter;
    const nextSerialized = record.desiredSerialized;
    updateStatus({ saving: true, saved: false, error: '' });

    const request = Promise.resolve()
      .then(() => sheetsFilterApi.updateSharedFilter(nextFilter))
      .then((result) => {
        record.inFlightPromise = null;
        record.lastSavedVersion = version;
        record.lastSavedSerialized = nextSerialized;
        onSavedRef.current?.(result);
        const hasNewerValue = record.desiredVersion > version;
        if (!hasNewerValue) {
          updateStatus({ saving: false, saved: true, error: '', lastSaved: nextFilter });
          onErrorRef.current?.('');
        } else {
          updateStatus({ saving: true, saved: false, error: '', lastSaved: nextFilter });
          if (!record.timer) return flushSave();
        }
        return result;
      })
      .catch((error) => {
        record.inFlightPromise = null;
        const hasNewerValue = record.desiredVersion > version;
        if (hasNewerValue) {
          updateStatus({ saving: true, saved: false, error: '' });
          if (!record.timer) return flushSave();
          return null;
        }

        const message = `帳號隊伍／人物篩選同步失敗：${error.message || '未知錯誤'}`;
        updateStatus({ saving: false, saved: false, error: message });
        onErrorRef.current?.(message);
        return null;
      });

    record.inFlightPromise = request;
    return request;
  }, [updateStatus]);

  const scheduleSave = useCallback(
    (delay = 500) => {
      const record = recordRef.current;
      if (record.timer) {
        window.clearTimeout(record.timer);
        record.timer = null;
        record.timerResolve?.(null);
        record.timerResolve = null;
      }
      if (delay <= 0) return flushSave();
      return new Promise((resolve) => {
        record.timerResolve = resolve;
        record.timer = window.setTimeout(() => {
          record.timer = null;
          record.timerResolve = null;
          flushSave().then(resolve);
        }, delay);
      });
    },
    [flushSave]
  );

  const retry = useCallback(() => {
    const record = recordRef.current;
    if (!record.desiredFilter) return Promise.resolve(null);
    record.desiredVersion += 1;
    updateStatus({ saving: true, saved: false, error: '' });
    onErrorRef.current?.('');
    return scheduleSave(0);
  }, [scheduleSave, updateStatus]);

  useEffect(() => {
    const record = recordRef.current;
    if (
      initialSavedSerialized !== undefined &&
      record.lastSavedVersion === 0 &&
      record.desiredVersion === 0 &&
      !record.inFlightPromise
    ) {
      record.lastSavedSerialized = initialSavedSerialized;
    }
    record.ready = ready;
    if (!ready) {
      if (record.timer) window.clearTimeout(record.timer);
      record.timer = null;
      record.timerResolve?.(null);
      record.timerResolve = null;
      updateStatus({ saving: false, saved: false });
      return undefined;
    }

    if (record.lastSavedSerialized === serialized && !record.inFlightPromise && !record.timer) {
      updateStatus({ saving: false, saved: true, error: '' });
      return undefined;
    }

    record.desiredFilter = filter;
    record.desiredSerialized = serialized;
    record.desiredVersion += 1;
    updateStatus({ saving: true, saved: false, error: '' });
    onErrorRef.current?.('');
    scheduleSave();
    return undefined;
  }, [filter, initialSavedSerialized, ready, scheduleSave, serialized, updateStatus]);

  useEffect(() => {
    mountedRef.current = true;
    const record = recordRef.current;
    return () => {
      mountedRef.current = false;
      if (record.timer) {
        window.clearTimeout(record.timer);
        record.timer = null;
        const resolveTimer = record.timerResolve;
        record.timerResolve = null;
        if (record.ready && record.desiredFilter && record.desiredVersion > record.lastSavedVersion) {
          flushSave().then(
            (result) => resolveTimer?.(result),
            () => resolveTimer?.(null)
          );
          return;
        }
        resolveTimer?.(null);
      } else {
        record.timerResolve?.(null);
        record.timerResolve = null;
      }
    };
  }, [flushSave]);

  return {
    saving: status.saving,
    saved: status.saved,
    error: status.error,
    lastSaved: status.lastSaved,
    retry,
  };
}
