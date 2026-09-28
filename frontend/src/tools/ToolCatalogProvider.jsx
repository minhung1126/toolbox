import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import { getAllTools, reconcileToolCatalog } from './catalog';

const ToolCatalogContext = createContext({
  status: 'ready',
  tools: getAllTools(),
  error: '',
  retry: () => {},
});

export function ToolCatalogProvider({ enabled, children }) {
  const [generation, setGeneration] = useState(0);
  const [state, setState] = useState({ status: 'loading', tools: [], error: '' });

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    Promise.resolve()
      .then(() => api.getTools())
      .then((payload) => reconcileToolCatalog(payload))
      .then((tools) => {
        if (!cancelled) setState({ status: 'ready', tools, error: '' });
      })
      .catch((error) => {
        if (!cancelled) {
          setState({ status: 'error', tools: [], error: error?.message || '工具目錄載入失敗。' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, generation]);

  const retry = useCallback(() => {
    setState({ status: 'loading', tools: [], error: '' });
    setGeneration((current) => current + 1);
  }, []);
  const value = useMemo(() => ({ ...state, retry }), [state, retry]);
  return <ToolCatalogContext.Provider value={value}>{children}</ToolCatalogContext.Provider>;
}

export function useToolCatalog() {
  return useContext(ToolCatalogContext);
}
