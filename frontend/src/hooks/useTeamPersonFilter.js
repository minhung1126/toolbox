import { useCallback, useEffect, useRef, useState } from 'react';
import { sheetsFilterApi } from '../features/sheets/api/sheetsFilterApi';
import { legacyPersonKey } from '../features/sheets/model/personOptions';

export default function useTeamPersonFilter({
  source = '',
  worksheetName = '',
  enabled = true,
  initialTeam = '',
  initialTeams = /** @type {string[] | undefined} */ (undefined),
  initialQuery = '',
  initialSelectedPeople = /** @type {string[]} */ ([]),
  refreshKey = 0,
  apiClient = sheetsFilterApi,
}) {
  const [teams, setTeams] = useState(/** @type {string[]} */ ([]));
  const [people, setPeople] = useState(
    /** @type {import('../features/sheets/model/personOptions').PersonOption[]} */ ([])
  );
  const [selectedTeams, setSelectedTeams] = useState(initialTeams ?? (initialTeam ? [initialTeam] : []));
  const [query, setQuery] = useState(initialQuery);
  const [selectedPeople, setSelectedPeople] = useState(
    initialSelectedPeople.map((value) => legacyPersonKey(value, initialTeam))
  );
  const [loading, setLoading] = useState(false);
  const [readyKey, setReadyKey] = useState('');
  const [error, setError] = useState('');
  const requestRef = useRef(0);
  const contextKey = source && worksheetName ? `${source}\u0000${worksheetName}` : '';

  const resetSelection = useCallback(
    ({
      team = '',
      teams: nextTeams = /** @type {string[] | undefined} */ (undefined),
      query: nextQuery = '',
      selectedPeople: nextPeople = /** @type {string[]} */ ([]),
    } = {}) => {
      setSelectedTeams(nextTeams ?? (team ? [team] : []));
      setQuery(nextQuery);
      setSelectedPeople(nextPeople.map((value) => legacyPersonKey(value, team)));
    },
    []
  );

  useEffect(() => {
    const requestId = ++requestRef.current;
    setReadyKey('');
    setError('');
    if (!enabled || !contextKey) {
      setTeams([]);
      setPeople([]);
      setLoading(false);
      return undefined;
    }
    // Reconcile against the complete list only after a successful source read.
    // Search and team filters never reload or clear selections.
    setLoading(true);
    apiClient
      .parseSheetOptions(source, worksheetName)
      .then((result) => {
        if (requestRef.current !== requestId) return;
        const nextPeople = result.people || [];
        setTeams(result.teams);
        setPeople(nextPeople);
        setReadyKey(contextKey);
      })
      .catch((err) => {
        if (requestRef.current !== requestId) return;
        setTeams([]);
        setPeople([]);
        setError(`讀取人物清單失敗：${err.message}`);
      })
      .finally(() => {
        if (requestRef.current === requestId) setLoading(false);
      });
    return () => {
      if (requestRef.current === requestId) requestRef.current += 1;
    };
  }, [apiClient, contextKey, enabled, refreshKey, source, worksheetName]);

  return {
    teams,
    people,
    selectedTeams,
    setSelectedTeams,
    query,
    setQuery,
    selectedPeople,
    setSelectedPeople,
    loadingTeams: loading,
    loadingPeople: loading,
    loading,
    ready: Boolean(enabled && readyKey && readyKey === contextKey && !loading),
    error,
    errorType: error ? 'teams' : '',
    resetSelection,
  };
}
