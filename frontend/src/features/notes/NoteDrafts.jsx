import { createContext, useContext, useEffect, useRef } from 'react';

const NoteDraftContext = createContext(null);
export function NoteDraftsProvider({ children }) {
  const drafts = useRef(new Map());
  useEffect(() => {
    const warn = (event) => {
      if (drafts.current.size) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  return <NoteDraftContext.Provider value={drafts}>{children}</NoteDraftContext.Provider>;
}
export function useNoteDrafts() {
  return useContext(NoteDraftContext);
}
