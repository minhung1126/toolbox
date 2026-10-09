import { usePlaylistSortState } from './usePlaylistSortState';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useToast } from '../../../components/Toast';

import { useOAuthConnect } from '../../../hooks/useOAuthConnect';
import useAccountWorkState from '../../../hooks/useAccountWorkState';

import { SORT_PRESETS, buildPreviewFromSorted, getLocaleCollation, sortTracksLocally } from '../model/playlistSort';

import { usePlaylistSortWorkflow } from './usePlaylistSortWorkflow';
import { playlistSortApi } from '../api/playlistSortApi';
import { ytmusicSettingsApi } from '../api/ytmusicSettingsApi';
export function usePlaylistSortController({ authUser, refreshAuthUser }) {
  const toast = useToast();
  const { state, setters, dispatch: dispatchWorkflow } = usePlaylistSortState();
  const {
    showTokenDrawer,
    strictFallbackPrompt,
    quotaExceededRecovery,
    playlists,
    selectedPlaylistId,
    loadingPlaylists,
    playlistFilterQuery,
    previewData,
    previewToken,
    previewing,
    quotaEstimate: baseQuotaEstimate,
    cachedOriginalTracks,
    isManuallyAdjusted,
    draggedRuleIdx,
    dragOverRuleIdx,
    newPlaylistTitle,
    showConfirm,
    applying,
    applyResult,
    reconciliationMessage,
  } = state;
  const {
    setShowTokenDrawer,
    setStrictFallbackPrompt,
    setQuotaExceededRecovery,
    setPlaylists,
    setSelectedPlaylistId,
    setLoadingPlaylists,
    setPlaylistFilterQuery,
    setPreviewData,
    setPreviewToken,
    setPreviewing,
    setQuotaEstimate,
    setCachedOriginalTracks,
    setIsManuallyAdjusted,
    setDraggedRuleIdx,
    setDragOverRuleIdx,
    setNewPlaylistTitle,
    setShowConfirm,
    setApplying,
    setApplyResult,
    setReconciliationMessage,
  } = setters;
  const applyInFlightRef = useRef(false);
  const latestWorkflowState = useRef(state);
  latestWorkflowState.current = state;

  const ytmusicAuth = authUser?.authorizations?.ytmusic;
  const isYtmusicConnected = Boolean(ytmusicAuth?.connected);
  const hasCustomToken = Boolean(ytmusicAuth?.has_custom_token);
  const tokenAccountName = ytmusicAuth?.account_name || '';
  const tokenChannelHandle = ytmusicAuth?.channel_handle || '';
  const tokenUpdatedAt = ytmusicAuth?.token_updated_at || '';
  const activeYoutubeConnected = Boolean(authUser?.youtube?.slots?.primary?.authenticated);

  // In-place token drawer & defense prompt states

  // Playlist selection

  const filteredPlaylists = useMemo(() => {
    const q = playlistFilterQuery.trim().toLowerCase();
    if (!q) return playlists;
    return playlists.filter(
      (pl) => (pl.title || '').toLowerCase().includes(q) || (pl.description || '').toLowerCase().includes(q)
    );
  }, [playlists, playlistFilterQuery]);

  useEffect(() => {
    if (applying || applyInFlightRef.current) return;
    if (playlistFilterQuery.trim() && filteredPlaylists.length > 0) {
      if (!filteredPlaylists.some((p) => p.id === selectedPlaylistId)) {
        setSelectedPlaylistId(filteredPlaylists[0].id);
      }
    }
  }, [applying, playlistFilterQuery, filteredPlaylists, selectedPlaylistId, setSelectedPlaylistId]);

  // Preferences (including locale/region defaults to Taiwan)
  const { value: preferences } = useAccountWorkState('ytmusic_preferences', {
    defaultPreset: 'title-asc',
    region: 'TW',
    language: 'zh_TW',
    location: 'TW',
  });

  const activeLanguage = preferences?.language || 'zh_TW';
  const activeLocation = preferences?.location || 'TW';
  const activeCollationLocale = useMemo(() => getLocaleCollation(activeLanguage), [activeLanguage]);

  const regionDisplayLabel = useMemo(() => {
    const loc = (preferences?.location || 'TW').toUpperCase();
    const lang = preferences?.language || 'zh_TW';
    if (loc === 'TW' && (lang === 'zh_TW' || lang === 'zh-TW')) return '🇹🇼 台灣 (繁中)';
    if (loc === 'US' && lang === 'en') return '🇺🇸 美國 (英文)';
    if (loc === 'KR' && lang === 'ko') return '🇰🇷 韓國 (韓文)';
    if (loc === 'JP' && lang === 'ja') return '🇯🇵 日本 (日文)';
    return `🌐 ${lang} / ${loc}`;
  }, [preferences?.location, preferences?.language]);

  // Load playlists
  const playlistRequestId = useRef(0);
  const fetchPlaylists = useCallback(async () => {
    const requestId = ++playlistRequestId.current;
    const initialState = latestWorkflowState.current;
    const protectedPlaylistIdAtStart =
      applyInFlightRef.current ||
      initialState.previewData ||
      initialState.applyResult ||
      initialState.reconciliationMessage
        ? initialState.selectedPlaylistId
        : '';
    setLoadingPlaylists(true);
    try {
      const res = await playlistSortApi.list({
        language: activeLanguage,
        location: activeLocation,
      });
      if (requestId !== playlistRequestId.current) return;
      const latest = latestWorkflowState.current;
      const protectedPlaylistId =
        applyInFlightRef.current ||
        latest.previewData ||
        latest.applyResult ||
        latest.reconciliationMessage ||
        (protectedPlaylistIdAtStart && protectedPlaylistIdAtStart === latest.selectedPlaylistId)
          ? latest.selectedPlaylistId
          : '';
      setPlaylists((current) => {
        const next = res.playlists || [];
        if (!protectedPlaylistId) return next;
        const currentPlaylist = current.find((playlist) => playlist.id === protectedPlaylistId);
        if (!currentPlaylist) return next;
        // Preserve the active preview/write source across delayed library reads.
        // Otherwise a renamed/removed entry can make the filter discard its result.
        return [currentPlaylist, ...next.filter((playlist) => playlist.id !== currentPlaylist.id)];
      });
      setSelectedPlaylistId((currentId) => currentId || res.playlists?.[0]?.id || '');
    } catch (err) {
      if (requestId === playlistRequestId.current) {
        toast.error(`載入播放清單失敗：${err.message || '未知錯誤'}`);
      }
    } finally {
      if (requestId === playlistRequestId.current) setLoadingPlaylists(false);
    }
  }, [setLoadingPlaylists, activeLanguage, activeLocation, setPlaylists, setSelectedPlaylistId, toast]);

  const ytmusicOAuth = useOAuthConnect({
    serviceName: 'ytmusic',
    getAuthUrl: ytmusicSettingsApi.getAuthUrl,
    disconnect: ytmusicSettingsApi.disconnect,
    onAfterDisconnect: async () => {
      await refreshAuthUser?.();
      fetchPlaylists();
    },
    serviceLabel: 'YouTube Music 授權',
    successMessage: '已解除 YouTube Music 授權',
  });

  // Pinned playlists persistence
  const { value: pinnedConfig, save: savePinnedConfig } = useAccountWorkState('ytmusic_pinned_playlists', { ids: [] });

  const pinnedPlaylistIds = useMemo(() => {
    if (Array.isArray(pinnedConfig?.ids)) return pinnedConfig.ids;
    if (Array.isArray(pinnedConfig)) return pinnedConfig;
    return [];
  }, [pinnedConfig]);

  const pinnedPlaylists = useMemo(() => {
    if (!pinnedPlaylistIds.length || !playlists.length) return [];
    return pinnedPlaylistIds.map((id) => playlists.find((p) => p.id === id)).filter(Boolean);
  }, [pinnedPlaylistIds, playlists]);

  const isSelectedPinned = useMemo(() => {
    return selectedPlaylistId ? pinnedPlaylistIds.includes(selectedPlaylistId) : false;
  }, [selectedPlaylistId, pinnedPlaylistIds]);

  const togglePinPlaylist = useCallback(
    (playlistId) => {
      if (!playlistId) return;
      const isPinned = pinnedPlaylistIds.includes(playlistId);
      let next;
      if (isPinned) {
        next = pinnedPlaylistIds.filter((id) => id !== playlistId);
        toast.info('已從常用清單取消釘選');
      } else {
        next = [...pinnedPlaylistIds, playlistId];
        toast.success('已加入常用釘選清單');
      }
      savePinnedConfig({ ids: next }, { debounceMs: 0 })?.then((res) => {
        if (!res) {
          toast.error('儲存常用釘選清單失敗，請稍後重試。');
        }
      });
    },
    [pinnedPlaylistIds, savePinnedConfig, toast]
  );

  // Split filtered playlists into pinned and unpinned
  const { pinnedFiltered, unpinnedFiltered } = useMemo(() => {
    const pinnedSet = new Set(pinnedPlaylistIds);
    const pinned = [];
    const unpinned = [];
    for (const pl of filteredPlaylists) {
      if (pinnedSet.has(pl.id)) {
        pinned.push(pl);
      } else {
        unpinned.push(pl);
      }
    }
    return { pinnedFiltered: pinned, unpinnedFiltered: unpinned };
  }, [filteredPlaylists, pinnedPlaylistIds]);

  // Sort configuration auto-save
  const {
    ready: sortConfigReady,
    value: sortConfig,
    save: saveSortConfig,
    saving: savingConfig,
    saved: savedConfig,
  } = useAccountWorkState('ytmusic_sort_config', {});

  const [presetMode, setPresetMode] = useState(
    () => sortConfig?.presetMode || preferences?.defaultPreset || 'title-asc'
  );
  const [customKeys, setCustomKeys] = useState(() => {
    if (Array.isArray(sortConfig?.customKeys) && sortConfig.customKeys.length > 0) {
      return sortConfig.customKeys;
    }
    return [{ field: 'title', direction: 'asc' }];
  });

  // Apply options
  const [applyMode, setApplyMode] = useState(() => sortConfig?.applyMode || 'in_place'); // 'in_place' | 'new_playlist'

  // Helper to persist current sorting setup
  const persistConfig = useCallback(
    (patch = {}) => {
      saveSortConfig({
        presetMode,
        customKeys,
        applyMode,
        selectedPlaylistId,
        ...patch,
      });
    },
    [presetMode, customKeys, applyMode, selectedPlaylistId, saveSortConfig]
  );

  // Asynchronous restore from persisted sortConfig
  const restoredConfigRef = useRef(false);
  useEffect(() => {
    if (sortConfigReady && !restoredConfigRef.current && sortConfig && typeof sortConfig === 'object') {
      let restored = false;
      if (sortConfig.presetMode) {
        setPresetMode(sortConfig.presetMode);
        restored = true;
      } else if (preferences?.defaultPreset) {
        setPresetMode(preferences.defaultPreset);
      }
      if (Array.isArray(sortConfig.customKeys) && sortConfig.customKeys.length > 0) {
        setCustomKeys(sortConfig.customKeys);
        restored = true;
      }
      if (sortConfig.applyMode) {
        setApplyMode(sortConfig.applyMode);
        restored = true;
      }
      if (sortConfig.selectedPlaylistId && !selectedPlaylistId) {
        setSelectedPlaylistId(sortConfig.selectedPlaylistId);
        restored = true;
      }
      if (restored) {
        restoredConfigRef.current = true;
      }
    }
  }, [sortConfigReady, sortConfig, preferences?.defaultPreset, selectedPlaylistId, setSelectedPlaylistId]);

  // Preview & Cached Simulation

  // Drag state for sort rules

  const activeSortKeys = useMemo(() => {
    if (presetMode === 'custom') return customKeys;
    const preset = SORT_PRESETS.find((p) => p.id === presetMode);
    return preset?.keys || [{ field: 'title', direction: 'asc' }];
  }, [presetMode, customKeys]);

  const quotaEstimate = useMemo(() => {
    if (!baseQuotaEstimate || !previewData) return baseQuotaEstimate;
    const usesToken = baseQuotaEstimate.engine
      ? baseQuotaEstimate.engine === 'ytmusic_innertube'
      : baseQuotaEstimate.units_per_move === 0;
    const unitsPerMove = usesToken ? 0 : baseQuotaEstimate.units_per_move;
    return {
      ...baseQuotaEstimate,
      moved_count: previewData.moved_count,
      total_units: usesToken
        ? 0
        : applyMode === 'new_playlist'
          ? (previewData.total + 1) * unitsPerMove
          : previewData.moved_count * unitsPerMove,
    };
  }, [applyMode, baseQuotaEstimate, previewData]);

  const accountKey = authUser?.sub || authUser?.email || '';
  const previousAccountKey = useRef(accountKey);
  useEffect(() => {
    playlistRequestId.current += 1;
    if (previousAccountKey.current !== accountKey) {
      previousAccountKey.current = accountKey;
      restoredConfigRef.current = false;
      dispatchWorkflow({
        type: 'patch',
        patch: {
          playlists: [],
          selectedPlaylistId: '',
          previewData: null,
          previewToken: '',
          cachedOriginalTracks: null,
          quotaEstimate: null,
          applyResult: null,
          reconciliationMessage: '',
          showConfirm: false,
          strictFallbackPrompt: null,
          applying: false,
          previewing: false,
        },
      });
    }
    fetchPlaylists();
    return () => {
      playlistRequestId.current += 1;
    };
  }, [accountKey, dispatchWorkflow, fetchPlaylists]);

  // Reset preview when selected playlist changes
  useEffect(() => {
    setPreviewData(null);
    setPreviewToken('');
    setQuotaEstimate(null);
    setCachedOriginalTracks(null);
    setIsManuallyAdjusted(false);
    setApplyResult(null);
  }, [
    selectedPlaylistId,
    setApplyResult,
    setCachedOriginalTracks,
    setIsManuallyAdjusted,
    setPreviewData,
    setPreviewToken,
    setQuotaEstimate,
  ]);

  const selectedPlaylist = playlists.find((p) => p.id === selectedPlaylistId);

  // Auto initialize new playlist title when selected playlist changes
  useEffect(() => {
    if (selectedPlaylist?.title) {
      setNewPlaylistTitle(`[已排序] ${selectedPlaylist.title}`);
    }
  }, [selectedPlaylist, setNewPlaylistTitle]);

  // Instant local simulation when cached tracks are present and sort rules change
  useEffect(() => {
    if (!cachedOriginalTracks || cachedOriginalTracks.length === 0) return;

    const locallySorted = sortTracksLocally(cachedOriginalTracks, activeSortKeys, activeCollationLocale);
    const simulatedPreview = buildPreviewFromSorted(cachedOriginalTracks, locallySorted);
    setPreviewData(simulatedPreview);
    setIsManuallyAdjusted(false);
  }, [cachedOriginalTracks, activeSortKeys, activeCollationLocale, setPreviewData, setIsManuallyAdjusted]);

  const {
    handleApplyClick,
    handleApplyConfirm,
    handlePreview,
    handleReorderTracks,
    handleResetToRuleOrder,
    handleTokenCleared,
    handleTokenSaved,
  } = usePlaylistSortWorkflow({
    dispatchWorkflow,
    accountKey: authUser?.sub || authUser?.email || '',
    applyLockRef: applyInFlightRef,
    reconciliationMessage,
    setReconciliationMessage,
    activeLanguage,
    activeLocation,
    activeSortKeys,
    activeCollationLocale,
    applyMode,
    cachedOriginalTracks,
    newPlaylistTitle,
    previewData,
    previewToken,
    quotaEstimate,
    refreshAuthUser,
    selectedPlaylistId,
    toast,
    setApplyResult,
    setApplying,
    setCachedOriginalTracks,
    setIsManuallyAdjusted,
    setPreviewData,
    setPreviewToken,
    setPreviewing,
    setQuotaEstimate,
    setQuotaExceededRecovery,
    setShowConfirm,
    setShowTokenDrawer,
    setStrictFallbackPrompt,
  });

  // Drag & drop handlers for sort rule keys
  const handleRuleDragStart = (e, index) => {
    if (applying) return;
    setDraggedRuleIdx(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleRuleDragOver = (e, index) => {
    e.preventDefault();
    if (dragOverRuleIdx !== index) {
      setDragOverRuleIdx(index);
    }
  };

  const handleRuleDrop = (e, targetIdx) => {
    e.preventDefault();
    if (applying) return;
    if (draggedRuleIdx !== null && draggedRuleIdx !== targetIdx) {
      const next = [...customKeys];
      const [moved] = next.splice(draggedRuleIdx, 1);
      next.splice(targetIdx, 0, moved);
      setCustomKeys(next);
      persistConfig({ customKeys: next });
    }
    setDraggedRuleIdx(null);
    setDragOverRuleIdx(null);
  };

  const handleRuleDragEnd = () => {
    setDraggedRuleIdx(null);
    setDragOverRuleIdx(null);
  };

  const handleCustomKeyChange = useCallback(
    (index, newKey) => {
      if (applying) return;
      const next = customKeys.map((k, i) => (i === index ? newKey : k));
      setCustomKeys(next);
      persistConfig({ customKeys: next });
    },
    [applying, customKeys, persistConfig]
  );

  const handleCustomKeyRemove = useCallback(
    (index) => {
      if (applying) return;
      const next = customKeys.filter((_, i) => i !== index);
      setCustomKeys(next);
      persistConfig({ customKeys: next });
    },
    [applying, customKeys, persistConfig]
  );

  const handleAddCustomKey = useCallback(() => {
    if (applying) return;
    if (customKeys.length >= 5) return;
    const next = [...customKeys, { field: 'title', direction: 'asc' }];
    setCustomKeys(next);
    persistConfig({ customKeys: next });
  }, [applying, customKeys, persistConfig]);

  // Build original items for preview table
  const originalItems = cachedOriginalTracks
    ? cachedOriginalTracks
    : previewData?.items
      ? [...previewData.items].sort((a, b) => (a.original_position ?? 0) - (b.original_position ?? 0))
      : [];

  const sortedItems = previewData?.items || [];

  return {
    hasCustomToken,
    isYtmusicConnected,
    activeYoutubeConnected,
    tokenAccountName,
    tokenChannelHandle,
    showTokenDrawer,
    regionDisplayLabel,
    ytmusicOAuth,
    tokenUpdatedAt,
    handleTokenSaved,
    handleTokenCleared,
    setShowTokenDrawer,
    playlists,
    playlistFilterQuery,
    filteredPlaylists,
    setPlaylistFilterQuery,
    loadingPlaylists,
    pinnedPlaylists,
    selectedPlaylistId,
    setSelectedPlaylistId,
    persistConfig,
    togglePinPlaylist,
    pinnedFiltered,
    unpinnedFiltered,
    isSelectedPinned,
    fetchPlaylists,
    selectedPlaylist,
    savingConfig,
    savedConfig,
    cachedOriginalTracks,
    presetMode,
    customKeys,
    handleAddCustomKey,
    handlePreview,
    previewing,
    applying,
    setPresetMode,
    handleCustomKeyChange,
    handleCustomKeyRemove,
    handleRuleDragStart,
    handleRuleDragOver,
    handleRuleDrop,
    handleRuleDragEnd,
    dragOverRuleIdx,
    previewData,
    originalItems,
    activeSortKeys,
    sortedItems,
    handleReorderTracks,
    isManuallyAdjusted,
    handleResetToRuleOrder,
    applyMode,
    applyResult,
    quotaEstimate,
    newPlaylistTitle,
    handleApplyClick,
    setApplyMode,
    setNewPlaylistTitle,
    reconciliationMessage,
    showConfirm,
    handleApplyConfirm,
    strictFallbackPrompt,
    quotaExceededRecovery,
    setReconciliationMessage,
    setShowConfirm,
    setStrictFallbackPrompt,
    setQuotaExceededRecovery,
  };
}
