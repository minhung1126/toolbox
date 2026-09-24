import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '../features/ytmusic/playlist-sort.css';
import {
  AlertTriangle,
  ArrowUpDown,
  Check,
  CheckCircle2,
  Disc3,
  ExternalLink,
  Globe,
  Key,
  ListMusic,
  Loader2,
  Pin,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useToast } from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import { StatusMessage } from '../components/StatusMessage';
import QuickTokenDrawer from '../components/QuickTokenDrawer';
import { useOAuthConnect } from '../hooks/useOAuthConnect';
import useAccountWorkState from '../hooks/useAccountWorkState';
import { PATHS } from '../routes/paths';

import {
  SORT_FIELDS,
  SORT_PRESETS,
  buildAlbumContextMap,
  buildPreviewFromSorted,
  formatDuration,
  getEffectiveSortArtist,
  getFirstArtist,
  getLocaleCollation,
  isGenericArtist,
  isRealAlbum,
  normalizeArtistName,
  sortTracksLocally,
  splitArtists,
} from '../utils/playlistSort';
import TrackSubtitle from '../components/playlist-sort/TrackSubtitle';
import SortKeyRow from '../components/playlist-sort/SortKeyRow';
import PreviewTable, { StatusDot } from '../components/playlist-sort/PreviewTable';
import InteractivePreviewTable from '../components/playlist-sort/InteractivePreviewTable';
import { usePlaylistSortWorkflow } from '../features/ytmusic/hooks/usePlaylistSortWorkflow';
import { playlistSortApi } from '../features/ytmusic/api/playlistSortApi';
import { ytmusicSettingsApi } from '../features/ytmusic/api/ytmusicSettingsApi';

export {
  getLocaleCollation,
  normalizeArtistName,
  sortTracksLocally,
  TrackSubtitle,
  splitArtists,
  getFirstArtist,
  isGenericArtist,
  SORT_PRESETS,
  SORT_FIELDS,
  isRealAlbum,
  buildAlbumContextMap,
  getEffectiveSortArtist,
  buildPreviewFromSorted,
  formatDuration,
  StatusDot,
  SortKeyRow,
  PreviewTable,
  InteractivePreviewTable,
};

export default function PlaylistSortPage({ authUser, refreshAuthUser }) {
  const toast = useToast();

  const ytmusicAuth = authUser?.authorizations?.ytmusic;
  const isYtmusicConnected = Boolean(ytmusicAuth?.connected);
  const hasCustomToken = Boolean(ytmusicAuth?.has_custom_token);
  const tokenAccountName = ytmusicAuth?.account_name || '';
  const tokenChannelHandle = ytmusicAuth?.channel_handle || '';
  const tokenUpdatedAt = ytmusicAuth?.token_updated_at || '';
  const activeYoutubeConnected = Boolean(authUser?.youtube?.slots?.primary?.authenticated);

  // In-place token drawer & defense prompt states
  const [showTokenDrawer, setShowTokenDrawer] = useState(false);
  const [strictFallbackPrompt, setStrictFallbackPrompt] = useState(null);
  const [quotaExceededRecovery, setQuotaExceededRecovery] = useState(null);

  // Playlist selection
  const [playlists, setPlaylists] = useState([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState('');
  const [loadingPlaylists, setLoadingPlaylists] = useState(true);
  const [playlistFilterQuery, setPlaylistFilterQuery] = useState('');

  const filteredPlaylists = useMemo(() => {
    const q = playlistFilterQuery.trim().toLowerCase();
    if (!q) return playlists;
    return playlists.filter(
      (pl) => (pl.title || '').toLowerCase().includes(q) || (pl.description || '').toLowerCase().includes(q)
    );
  }, [playlists, playlistFilterQuery]);

  useEffect(() => {
    if (playlistFilterQuery.trim() && filteredPlaylists.length > 0) {
      if (!filteredPlaylists.some((p) => p.id === selectedPlaylistId)) {
        setSelectedPlaylistId(filteredPlaylists[0].id);
      }
    }
  }, [playlistFilterQuery, filteredPlaylists, selectedPlaylistId]);

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
    setLoadingPlaylists(true);
    try {
      const res = await playlistSortApi.list({
        language: activeLanguage,
        location: activeLocation,
      });
      if (requestId !== playlistRequestId.current) return;
      setPlaylists(res.playlists || []);
      setSelectedPlaylistId((currentId) => currentId || res.playlists?.[0]?.id || '');
    } catch (err) {
      if (requestId === playlistRequestId.current) {
        toast.error(`載入播放清單失敗：${err.message || '未知錯誤'}`);
      }
    } finally {
      if (requestId === playlistRequestId.current) setLoadingPlaylists(false);
    }
  }, [toast, activeLanguage, activeLocation]);

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
  }, [sortConfigReady, sortConfig, preferences?.defaultPreset, selectedPlaylistId]);

  // Preview & Cached Simulation
  const [previewData, setPreviewData] = useState(null);
  const [previewToken, setPreviewToken] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [quotaEstimate, setQuotaEstimate] = useState(null);
  const [cachedOriginalTracks, setCachedOriginalTracks] = useState(null);
  const [isManuallyAdjusted, setIsManuallyAdjusted] = useState(false);

  // Drag state for sort rules
  const [draggedRuleIdx, setDraggedRuleIdx] = useState(null);
  const [dragOverRuleIdx, setDragOverRuleIdx] = useState(null);
  const [newPlaylistTitle, setNewPlaylistTitle] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState(null);

  const activeSortKeys = useMemo(() => {
    if (presetMode === 'custom') return customKeys;
    const preset = SORT_PRESETS.find((p) => p.id === presetMode);
    return preset?.keys || [{ field: 'title', direction: 'asc' }];
  }, [presetMode, customKeys]);

  useEffect(() => {
    fetchPlaylists();
    return () => {
      playlistRequestId.current += 1;
    };
  }, [fetchPlaylists]);

  // Reset preview when selected playlist changes
  useEffect(() => {
    setPreviewData(null);
    setPreviewToken('');
    setQuotaEstimate(null);
    setCachedOriginalTracks(null);
    setIsManuallyAdjusted(false);
    setApplyResult(null);
  }, [selectedPlaylistId]);

  const selectedPlaylist = playlists.find((p) => p.id === selectedPlaylistId);

  // Auto initialize new playlist title when selected playlist changes
  useEffect(() => {
    if (selectedPlaylist?.title) {
      setNewPlaylistTitle(`[已排序] ${selectedPlaylist.title}`);
    }
  }, [selectedPlaylist]);

  // Instant local simulation when cached tracks are present and sort rules change
  useEffect(() => {
    if (!cachedOriginalTracks || cachedOriginalTracks.length === 0) return;

    const locallySorted = sortTracksLocally(cachedOriginalTracks, activeSortKeys, activeCollationLocale);
    const simulatedPreview = buildPreviewFromSorted(cachedOriginalTracks, locallySorted);
    setPreviewData(simulatedPreview);
    setIsManuallyAdjusted(false);
  }, [cachedOriginalTracks, activeSortKeys, activeCollationLocale]);

  const {
    handleApplyClick,
    handleApplyConfirm,
    handlePreview,
    handleReorderTracks,
    handleResetToRuleOrder,
    handleTokenCleared,
    handleTokenSaved,
  } = usePlaylistSortWorkflow({
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
      const next = customKeys.map((k, i) => (i === index ? newKey : k));
      setCustomKeys(next);
      persistConfig({ customKeys: next });
    },
    [customKeys, persistConfig]
  );

  const handleCustomKeyRemove = useCallback(
    (index) => {
      const next = customKeys.filter((_, i) => i !== index);
      setCustomKeys(next);
      persistConfig({ customKeys: next });
    },
    [customKeys, persistConfig]
  );

  const handleAddCustomKey = useCallback(() => {
    if (customKeys.length >= 5) return;
    const next = [...customKeys, { field: 'title', direction: 'asc' }];
    setCustomKeys(next);
    persistConfig({ customKeys: next });
  }, [customKeys, persistConfig]);

  // Build original items for preview table
  const originalItems = cachedOriginalTracks
    ? cachedOriginalTracks
    : previewData?.items
      ? [...previewData.items].sort((a, b) => (a.original_position ?? 0) - (b.original_position ?? 0))
      : [];

  const sortedItems = previewData?.items || [];

  return (
    <div className="section-gap">
      {/* Page Header */}
      <header className="glass-panel page-header card-padding">
        <div className="badge badge-info dashboard-eyebrow">
          <Sparkles size={14} aria-hidden="true" /> YouTube Music
        </div>
        <h1>YouTube Music 播放清單排序</h1>
        <p className="section-desc">
          讀取個人 YouTube Music
          播放清單，以歌手／藝人、專輯名稱、歌曲曲目順序、歌名等多重規則自訂排序。支援拖曳順序與即時快取動態模擬比對，零配額消耗（0
          API Credit）。
        </p>
      </header>

      {/* YouTube Music In-Place Authorization Status */}
      <section className="glass-panel card-padding">
        <div className="playlist-sort-auth-row">
          <div className="playlist-sort-auth-summary">
            <div className="icon-box icon-box-primary playlist-sort-auth-icon">
              <Disc3 size={22} />
            </div>
            <div>
              <div className="playlist-sort-auth-title-row">
                <strong className="playlist-sort-auth-title">YouTube Music 運作模式</strong>
                {hasCustomToken ? (
                  <span className="badge badge-connected" data-testid="badge-ytm-zero-quota">
                    <CheckCircle2 size={12} /> ⚡ 0 配額模式（瀏覽器 Token 已啟用）
                  </span>
                ) : isYtmusicConnected ? (
                  <span className="badge badge-warning playlist-sort-quota-mode">
                    <AlertTriangle size={12} /> Google API 配額模式
                  </span>
                ) : activeYoutubeConnected ? (
                  <span className="badge badge-info">共用 YouTube 頻道授權</span>
                ) : (
                  <span className="badge badge-disconnected">
                    <AlertTriangle size={12} /> 尚未授權
                  </span>
                )}
              </div>
              <p className="playlist-sort-auth-description">
                {hasCustomToken
                  ? `已啟用 YouTube Music 瀏覽器 Token${tokenAccountName ? `（${tokenAccountName}${tokenChannelHandle ? ` / ${tokenChannelHandle}` : ''}）` : ''}。排序作業採用內部協定，消耗 0 Google API 配額。`
                  : isYtmusicConnected
                    ? `目前使用 Google YouTube Data API（每次移動消耗 50 點配額）。建議展開下方快速面板貼上 Token 享受 0 配額免扣點。`
                    : activeYoutubeConnected
                      ? `目前沿用主要 YouTube 頻道（${authUser?.youtube?.slots?.primary?.channel_title || '品牌頻道'}）授權。若要使用個人日常音樂帳號，建議連結專屬帳號或展開面板貼上 Token。`
                      : '尚未連結 YouTube 或 YouTube Music 帳號，請先完成授權以載入個人播放清單。'}
              </p>
            </div>
          </div>
          <div className="playlist-sort-auth-actions">
            {hasCustomToken ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm playlist-sort-auth-action"
                onClick={() => setShowTokenDrawer(!showTokenDrawer)}
              >
                <Key size={14} /> {showTokenDrawer ? '收合 Token 面板' : '更換 / 管理 Token'}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-sm playlist-sort-auth-action"
                onClick={() => setShowTokenDrawer(!showTokenDrawer)}
              >
                <Key size={14} /> ⚡ 貼上 Token 啟用 0 配額
              </button>
            )}
            <Link
              to={PATHS.ytmusicSettings}
              className="btn btn-secondary btn-sm playlist-sort-auth-action"
              title="前往 YouTube Music 設定（可切換歌名與歌手名地區顯示）"
            >
              <Globe size={14} />
              <span>地區：{regionDisplayLabel}</span>
              <Settings size={14} className="playlist-sort-region-settings-icon" />
            </Link>
            {isYtmusicConnected ? (
              <>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={ytmusicOAuth.handleConnect}
                  disabled={ytmusicOAuth.connecting}
                >
                  <RefreshCw size={14} className={ytmusicOAuth.connecting ? 'spin' : ''} /> 重新授權
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm playlist-sort-disconnect"
                  onClick={() => ytmusicOAuth.setConfirmDisconnect(true)}
                >
                  解除授權
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={ytmusicOAuth.handleConnect}
                disabled={ytmusicOAuth.connecting}
              >
                {ytmusicOAuth.connecting ? <Loader2 size={14} className="spin" /> : <Disc3 size={14} />} 連結 YouTube
                Music 專屬帳號
              </button>
            )}
          </div>
        </div>

        {/* In-place Quick Token Collapsible Drawer */}
        <QuickTokenDrawer
          isOpen={showTokenDrawer}
          onClose={() => setShowTokenDrawer(false)}
          hasCustomToken={hasCustomToken}
          tokenAccountName={tokenAccountName}
          tokenChannelHandle={tokenChannelHandle}
          tokenUpdatedAt={tokenUpdatedAt}
          onTokenSaved={handleTokenSaved}
          onTokenCleared={handleTokenCleared}
        />
      </section>

      {/* Step 1: Select Playlist */}
      <section className="glass-panel card-padding">
        <div className="playlist-sort-section-header">
          <h3 className="playlist-sort-section-title">
            <ListMusic size={18} /> 選擇播放清單
          </h3>
          {playlists.length > 0 && (
            <span className="playlist-sort-muted-summary">
              {playlistFilterQuery
                ? `篩選符合 ${filteredPlaylists.length} / 共 ${playlists.length} 個`
                : `共 ${playlists.length} 個播放清單`}
            </span>
          )}
        </div>

        {/* Playlist Name Filter Input */}
        <div className="playlist-sort-filter">
          <Search size={16} className="playlist-sort-filter-icon" aria-hidden="true" />
          <input
            type="text"
            className={`form-input playlist-sort-filter-input${playlistFilterQuery ? ' playlist-sort-filter-input-clearable' : ''}`}
            aria-label="依播放清單名稱或說明篩選"
            placeholder="依播放清單名稱或說明快速篩選…"
            value={playlistFilterQuery}
            onChange={(e) => setPlaylistFilterQuery(e.target.value)}
            disabled={loadingPlaylists || playlists.length === 0}
          />
          {playlistFilterQuery && (
            <button
              type="button"
              className="playlist-sort-filter-clear"
              onClick={() => setPlaylistFilterQuery('')}
              title="清除篩選"
              aria-label="清除篩選"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Pinned Playlists Quick Access Chips */}
        {pinnedPlaylists.length > 0 && (
          <div className="playlist-sort-pinned-list">
            <span className="playlist-sort-pinned-label">
              <Pin size={13} className="playlist-sort-pinned-icon" aria-hidden="true" /> 常用釘選：
            </span>
            {pinnedPlaylists.map((pl) => {
              const isCurrent = pl.id === selectedPlaylistId;
              return (
                <div
                  key={pl.id}
                  className={`badge playlist-sort-pinned-chip${isCurrent ? ' playlist-sort-pinned-chip-active' : ''}`}
                >
                  <button
                    type="button"
                    className="playlist-sort-pinned-select"
                    aria-label={`快速切換至「${pl.title}」`}
                    onClick={() => {
                      setSelectedPlaylistId(pl.id);
                      persistConfig({ selectedPlaylistId: pl.id });
                    }}
                  >
                    <span className="playlist-sort-pinned-title">{pl.title}</span>
                    <span className="playlist-sort-pinned-count">({pl.item_count})</span>
                  </button>
                  <button
                    type="button"
                    className="playlist-sort-pinned-remove"
                    aria-label={`取消釘選「${pl.title}」`}
                    onClick={() => togglePinPlaylist(pl.id)}
                  >
                    <X size={12} aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="playlist-sort-select-row">
          <select
            className="form-select playlist-sort-select"
            aria-label="選擇播放清單"
            value={selectedPlaylistId}
            onChange={(e) => {
              setSelectedPlaylistId(e.target.value);
              persistConfig({ selectedPlaylistId: e.target.value });
            }}
            disabled={loadingPlaylists || filteredPlaylists.length === 0}
          >
            {loadingPlaylists ? (
              <option value="">載入中…</option>
            ) : filteredPlaylists.length === 0 ? (
              <option value="">{playlists.length === 0 ? '找不到播放清單' : '無符合關鍵字的播放清單'}</option>
            ) : (
              <>
                {pinnedFiltered.length > 0 && (
                  <optgroup label="📌 常用釘選清單">
                    {pinnedFiltered.map((pl) => (
                      <option key={pl.id} value={pl.id}>
                        📌 {pl.title} ({pl.item_count} 首)
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label={pinnedFiltered.length > 0 ? '全部播放清單' : '播放清單'}>
                  {unpinnedFiltered.map((pl) => (
                    <option key={pl.id} value={pl.id}>
                      {pl.title} ({pl.item_count} 首)
                    </option>
                  ))}
                </optgroup>
              </>
            )}
          </select>
          <button
            type="button"
            className={`btn playlist-sort-pin-button ${isSelectedPinned ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => togglePinPlaylist(selectedPlaylistId)}
            disabled={!selectedPlaylistId || loadingPlaylists}
            title={isSelectedPinned ? '取消釘選此播放清單' : '釘選目前播放清單至頂端常用'}
            aria-label={isSelectedPinned ? '取消釘選此播放清單' : '釘選目前播放清單至頂端常用'}
          >
            <Pin size={14} className={isSelectedPinned ? 'playlist-sort-pin-icon-active' : undefined} />
            {isSelectedPinned ? '已釘選' : '釘選'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            aria-label="重新整理清單"
            onClick={fetchPlaylists}
            disabled={loadingPlaylists}
            title="重新整理清單"
          >
            <RefreshCw size={14} className={loadingPlaylists ? 'spin' : ''} />
          </button>
        </div>
        {selectedPlaylist && (
          <p className="playlist-sort-selected-description">
            {selectedPlaylist.description || '無說明'} ·{' '}
            {selectedPlaylist.privacy_status === 'private'
              ? '私人'
              : selectedPlaylist.privacy_status === 'unlisted'
                ? '不公開'
                : '公開'}
          </p>
        )}
      </section>

      {/* Step 2: Sort Rules */}
      <section className="glass-panel card-padding">
        <div className="playlist-sort-section-header">
          <h3 className="playlist-sort-section-title">
            <ArrowUpDown size={18} /> 排序規則
          </h3>
          <div className="playlist-sort-config-statuses">
            {savingConfig ? (
              <span className="badge badge-warning playlist-sort-compact-badge">
                <Loader2 size={12} className="spin" /> 儲存設定中…
              </span>
            ) : savedConfig ? (
              <span className="badge badge-connected playlist-sort-compact-badge">
                <CheckCircle2 size={12} /> 排序設定已自動儲存
              </span>
            ) : (
              <span className="badge badge-info playlist-sort-compact-badge">
                <CheckCircle2 size={12} /> 自動記憶設定
              </span>
            )}
            {cachedOriginalTracks && (
              <span className="badge badge-connected playlist-sort-compact-badge">⚡ 即時快取動態模擬中</span>
            )}
          </div>
        </div>

        <div className="playlist-sort-preset-row">
          <select
            className="form-select playlist-sort-preset-select"
            aria-label="排序預設模式"
            value={presetMode}
            onChange={(e) => {
              const next = e.target.value;
              setPresetMode(next);
              persistConfig({ presetMode: next });
            }}
          >
            {SORT_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {presetMode === 'custom' && (
          <div className="playlist-sort-custom-rules">
            <p className="playlist-sort-help">可按住左側圖示拖曳以調整順位優先層級（靠上層者優先排序）：</p>
            {customKeys.map((k, i) => (
              <SortKeyRow
                key={i}
                sortKey={k}
                index={i}
                onChange={handleCustomKeyChange}
                onRemove={handleCustomKeyRemove}
                canRemove={customKeys.length > 1}
                onDragStart={handleRuleDragStart}
                onDragOver={handleRuleDragOver}
                onDrop={handleRuleDrop}
                onDragEnd={handleRuleDragEnd}
                isDragTarget={dragOverRuleIdx === i}
              />
            ))}
            {customKeys.length < 5 && (
              <button type="button" className="btn btn-secondary playlist-sort-add-rule" onClick={handleAddCustomKey}>
                <Plus size={14} /> 新增排序順位
              </button>
            )}
          </div>
        )}

        <div className="playlist-sort-actions">
          <button
            type="button"
            className="btn btn-primary playlist-sort-action"
            onClick={handlePreview}
            disabled={previewing || !selectedPlaylistId || applying}
          >
            {previewing ? <Loader2 size={15} className="spin" /> : <ArrowUpDown size={15} />}
            {previewing ? '預覽中…' : '模擬預覽'}
          </button>
          {cachedOriginalTracks && (
            <button
              type="button"
              className="btn btn-secondary playlist-sort-action playlist-sort-refresh-cache"
              onClick={handlePreview}
              disabled={previewing}
              title="重新向伺服器拉取最新歌曲資料並更新快取"
            >
              <RefreshCw size={14} className={previewing ? 'spin' : ''} /> 重新讀取歌曲快取
            </button>
          )}
        </div>
      </section>

      {/* Step 3: Side-by-Side Live Preview Results */}
      {previewData && (
        <section className="glass-panel card-padding">
          <div className="playlist-sort-section-header playlist-sort-preview-header">
            <h3 className="playlist-sort-section-title">左右比對預覽結果</h3>
            <div className="playlist-sort-preview-stats">
              <span className="playlist-sort-preview-stat">
                <StatusDot status="unchanged" /> 不變 {previewData.unchanged_count} 首
              </span>
              <span className="playlist-sort-preview-stat">
                <StatusDot status="moved" /> 移動 {previewData.moved_count} 首
              </span>
              <span className="playlist-sort-muted-summary">共 {previewData.total} 首</span>
            </div>
          </div>

          <div className="playlist-sort-preview-columns">
            <PreviewTable title="目前原始順序" items={originalItems} sortKeys={activeSortKeys} />
            <InteractivePreviewTable
              title="即時排序結果"
              items={sortedItems}
              icon={ArrowUpDown}
              sortKeys={activeSortKeys}
              onReorder={handleReorderTracks}
              isManuallyAdjusted={isManuallyAdjusted}
              onResetOrder={handleResetToRuleOrder}
            />
          </div>
        </section>
      )}

      {/* Step 4: Apply Configuration */}
      {previewData && (previewData.moved_count > 0 || applyMode === 'new_playlist') && !applyResult && (
        <section className="glass-panel card-padding">
          <h3 className="playlist-sort-apply-heading">套用模式與配額資訊</h3>

          {quotaEstimate && (
            <div className="playlist-sort-quota-estimate">
              {quotaEstimate.total_units === 0 ? (
                <div className="playlist-sort-zero-quota">
                  <CheckCircle2 size={18} />
                  <span>
                    <strong>YouTube Music Token 協定運作中（0 配額）</strong>：本次操作預計移動{' '}
                    {previewData.moved_count} 首歌曲，
                    <strong>消耗 0 Google API 配額點數</strong>。
                  </span>
                </div>
              ) : (
                <StatusMessage tone="warning" title="API 配額消耗預估">
                  <div className="playlist-sort-quota-warning-row">
                    <span>
                      本次排序將移動 <strong>{previewData.moved_count}</strong> 首歌曲， 預估消耗{' '}
                      <strong>{quotaEstimate.total_units?.toLocaleString()}</strong> API 配額點數 （每次移動{' '}
                      {quotaEstimate.units_per_move} 點）。
                    </span>
                    {!hasCustomToken && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm playlist-sort-quota-token-button"
                        onClick={() => setShowTokenDrawer(true)}
                      >
                        <Key size={13} /> 展開面板配置 Token 免消耗配額
                      </button>
                    )}
                  </div>
                </StatusMessage>
              )}
            </div>
          )}

          {/* Sort Mode Selection */}
          <div className="playlist-sort-apply-options">
            <label className="playlist-sort-apply-option">
              <input
                type="radio"
                name="apply_mode"
                value="in_place"
                checked={applyMode === 'in_place'}
                onChange={() => {
                  setApplyMode('in_place');
                  persistConfig({ applyMode: 'in_place' });
                }}
              />
              <span>就地重新排序原播放清單</span>
            </label>
            <label className="playlist-sort-apply-option">
              <input
                type="radio"
                name="apply_mode"
                value="new_playlist"
                checked={applyMode === 'new_playlist'}
                onChange={() => {
                  setApplyMode('new_playlist');
                  persistConfig({ applyMode: 'new_playlist' });
                }}
              />
              <span>另存為新排序歌單（保留原歌單備份）</span>
            </label>
          </div>

          {applyMode === 'new_playlist' && (
            <div className="playlist-sort-new-title-field">
              <label className="form-label" htmlFor="new-playlist-title">
                新播放清單名稱
              </label>
              <input
                id="new-playlist-title"
                type="text"
                className="form-input"
                value={newPlaylistTitle}
                onChange={(e) => setNewPlaylistTitle(e.target.value)}
                placeholder="輸入新播放清單名稱…"
              />
            </div>
          )}

          <div>
            <button
              type="button"
              className="btn btn-primary playlist-sort-action"
              onClick={handleApplyClick}
              disabled={applying}
            >
              {applying ? <Loader2 size={15} className="spin" /> : <Check size={15} />}
              {applying ? '套用中…' : applyMode === 'new_playlist' ? '建立新排序歌單' : '套用排序'}
            </button>
          </div>
        </section>
      )}

      {/* Apply Result */}
      {applyResult && (
        <section className="glass-panel card-padding">
          <StatusMessage
            tone={applyResult.failed > 0 ? 'warning' : 'success'}
            title={applyResult.failed > 0 ? '排序完成（有部分失敗）' : '排序成功套用'}
          >
            <div>
              <span>
                成功移動 <strong>{applyResult.succeeded}</strong> 首，
                {applyResult.failed > 0 && (
                  <>
                    失敗 <strong>{applyResult.failed}</strong> 首，
                  </>
                )}
                消耗 <strong>{applyResult.quota_used?.toLocaleString() ?? 0}</strong> API 配額點數。
              </span>
              {applyResult.new_playlist_url && (
                <div className="playlist-sort-result-link-row">
                  <a
                    href={applyResult.new_playlist_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary btn-sm playlist-sort-auth-action"
                  >
                    <ExternalLink size={14} /> 前往 YouTube Music 查看新歌單
                  </a>
                </div>
              )}
            </div>
          </StatusMessage>
        </section>
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={showConfirm}
        title="確認套用排序"
        onConfirm={handleApplyConfirm}
        onCancel={() => setShowConfirm(false)}
        confirmText="確認套用"
        cancelText="取消"
        busy={applying}
      >
        <div>
          <p>
            即將對播放清單「<strong>{selectedPlaylist?.title || selectedPlaylistId}</strong>」套用排序， 將移動{' '}
            <strong>{previewData?.moved_count || 0}</strong> 首歌曲。
          </p>
          {applyMode === 'new_playlist' ? (
            <p className="playlist-sort-confirm-success">
              ✓ 將保留原始播放清單，並為您建立全新的已排序播放清單「<strong>{newPlaylistTitle}</strong>」。
            </p>
          ) : quotaEstimate?.total_units === 0 ? (
            <p className="playlist-sort-confirm-success">
              ✓ 使用 YouTube Music Token 更新，<strong>消耗 0 API 配額點數</strong>。
            </p>
          ) : (
            quotaEstimate && (
              <p className="playlist-sort-confirm-warning">
                ⚠ 預估消耗 <strong>{quotaEstimate.total_units?.toLocaleString()}</strong> API 配額點數。
                此操作不可自動撤銷。
              </p>
            )
          )}
          <p>確定要繼續嗎？</p>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={ytmusicOAuth.confirmDisconnect}
        title="解除 YouTube Music 授權"
        message="確定要解除 YouTube Music 專屬授權嗎？解除後將無法直接讀取該帳號的個人音樂播放清單，直到重新授權為止。"
        confirmText="確認解除"
        cancelText="取消"
        variant="destructive"
        onConfirm={ytmusicOAuth.handleConfirmDisconnect}
        onCancel={() => ytmusicOAuth.setConfirmDisconnect(false)}
      />

      {/* Strict Defense Dialog against Silent Fallback */}
      <ConfirmDialog
        open={Boolean(strictFallbackPrompt)}
        title="⚠️ YouTube Music Token 認證失效（嚴格防禦保護）"
        confirmText={`以 Google API 配額繼續（消耗 ${strictFallbackPrompt?.quotaUnits || 0} 點）`}
        cancelText="立即更新 Token（維持 0 配額）"
        variant="warning"
        busy={applying}
        onConfirm={() => {
          setStrictFallbackPrompt(null);
          handleApplyConfirm({ forceAllowQuotaFallback: true });
        }}
        onCancel={() => {
          setStrictFallbackPrompt(null);
          setShowTokenDrawer(true);
        }}
      >
        <div>
          <p className="playlist-sort-dialog-danger-title">{strictFallbackPrompt?.message}</p>
          <p>
            系統已依「<strong>嚴格防禦政策</strong>」攔截自動降級，以避免在未經確認的情況下無預警消耗{' '}
            <strong>{strictFallbackPrompt?.quotaUnits}</strong> 點 Google Cloud API 配額。
          </p>
          <p className="playlist-sort-dialog-help">
            💡 <strong>推薦作法</strong>：點擊「立即更新 Token」，展開上方快速面板貼上新的 cURL / Cookie，即可繼續以 0
            配額完成排序。
          </p>
        </div>
      </ConfirmDialog>

      {/* 429 Quota Exceeded Recovery Dialog */}
      <ConfirmDialog
        open={Boolean(quotaExceededRecovery)}
        title="Google API 每日配額已用盡"
        confirmText="⚡ 展開 Token 面板啟用 0 配額救援"
        cancelText="關閉"
        onConfirm={() => {
          setQuotaExceededRecovery(null);
          setShowTokenDrawer(true);
        }}
        onCancel={() => setQuotaExceededRecovery(null)}
      >
        <div>
          <p className="playlist-sort-dialog-danger-title">{quotaExceededRecovery?.message}</p>
          <p>Google YouTube Data API 每日配額已達上限（將於每日太平洋時間午夜重置）。</p>
          <div className="playlist-sort-quota-recovery">
            💡 <strong>即刻救援方案</strong>： 只要貼上 YouTube Music 瀏覽器 Token，即可完全繞過 Google API 配額限制，
            <strong>立刻以 0 配額完成排序</strong>！
          </div>
        </div>
      </ConfirmDialog>
    </div>
  );
}
