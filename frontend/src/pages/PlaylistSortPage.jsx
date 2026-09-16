import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  CheckCircle2,
  Disc3,
  ListMusic,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { useToast } from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import { StatusMessage } from '../components/StatusMessage';
import { useOAuthConnect } from '../hooks/useOAuthConnect';
import useAccountWorkState from '../hooks/useAccountWorkState';
import { PATHS } from '../routes/paths';

const SORT_PRESETS = [
  { id: 'title-asc', label: '歌名 A → Z', keys: [{ field: 'title', direction: 'asc' }] },
  { id: 'title-desc', label: '歌名 Z → A', keys: [{ field: 'title', direction: 'desc' }] },
  { id: 'artist-asc', label: '頻道／藝人 A → Z', keys: [{ field: 'artist', direction: 'asc' }] },
  { id: 'artist-desc', label: '頻道／藝人 Z → A', keys: [{ field: 'artist', direction: 'desc' }] },
  { id: 'added-newest', label: '新增日期（新 → 舊）', keys: [{ field: 'added_at', direction: 'desc' }] },
  { id: 'added-oldest', label: '新增日期（舊 → 新）', keys: [{ field: 'added_at', direction: 'asc' }] },
  { id: 'published-newest', label: '發布日期（新 → 舊）', keys: [{ field: 'published_at', direction: 'desc' }] },
  { id: 'published-oldest', label: '發布日期（舊 → 新）', keys: [{ field: 'published_at', direction: 'asc' }] },
  { id: 'duration-shortest', label: '長度（短 → 長）', keys: [{ field: 'duration', direction: 'asc' }] },
  { id: 'duration-longest', label: '長度（長 → 短）', keys: [{ field: 'duration', direction: 'desc' }] },
  { id: 'random', label: '隨機排序', keys: [{ field: 'random', direction: 'asc' }] },
  { id: 'custom', label: '自訂排序…', keys: [] },
];

const SORT_FIELDS = [
  { value: 'title', label: '歌名' },
  { value: 'artist', label: '頻道／藝人' },
  { value: 'added_at', label: '新增日期' },
  { value: 'published_at', label: '發布日期' },
  { value: 'duration', label: '長度' },
  { value: 'random', label: '隨機' },
];

function formatDuration(seconds) {
  if (seconds == null || Number.isNaN(seconds) || seconds < 0) return '--:--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function StatusDot({ status }) {
  const isUnchanged = status === 'unchanged';
  const color = isUnchanged ? 'var(--color-success, #22c55e)' : 'var(--color-warning, #eab308)';
  const label = isUnchanged ? '不變' : '移動';
  return (
    <span
      title={label}
      aria-label={label}
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        backgroundColor: color,
        flexShrink: 0,
      }}
    />
  );
}

function SortKeyRow({ sortKey, index, onChange, onRemove, canRemove }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
      <select
        className="form-select"
        value={sortKey.field}
        onChange={(e) => onChange(index, { ...sortKey, field: e.target.value })}
        style={{ flex: 1, minWidth: 0 }}
      >
        {SORT_FIELDS.map((f) => (
          <option key={f.value} value={f.value}>{f.label}</option>
        ))}
      </select>
      <button
        type="button"
        className="btn btn-secondary"
        style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
        onClick={() => onChange(index, { ...sortKey, direction: sortKey.direction === 'asc' ? 'desc' : 'asc' })}
        title={sortKey.direction === 'asc' ? '升冪' : '降冪'}
      >
        {sortKey.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
        {sortKey.direction === 'asc' ? '升冪' : '降冪'}
      </button>
      {canRemove && (
        <button
          type="button"
          className="btn btn-secondary"
          style={{ padding: '6px 8px' }}
          onClick={() => onRemove(index)}
          title="移除"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

function PreviewTable({ title, items, icon: Icon }) {
  return (
    <div style={{ flex: 1, minWidth: 280 }}>
      <h4 style={{ margin: '0 0 8px 0', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
        {Icon && <Icon size={14} />}
        {title}
      </h4>
      <div
        style={{
          maxHeight: 480,
          overflowY: 'auto',
          borderRadius: 8,
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {items.map((item, idx) => (
          <div
            key={item.playlist_item_id || idx}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 10px',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              fontSize: 13,
            }}
          >
            <StatusDot status={item.status} />
            <span style={{ color: 'rgba(255,255,255,0.4)', minWidth: 28, textAlign: 'right', fontSize: 12 }}>
              {idx + 1}
            </span>
            {item.thumbnail_url && (
              <img
                src={item.thumbnail_url}
                alt=""
                style={{ width: 40, height: 30, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }}
                loading="lazy"
              />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.title}>
                {item.title || '（無標題）'}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {item.channel_title || ''}
              </div>
            </div>
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, flexShrink: 0 }}>
              {formatDuration(item.duration_seconds)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PlaylistSortPage({ authUser, refreshAuthUser }) {
  const toast = useToast();

  const ytmusicAuth = authUser?.authorizations?.ytmusic;
  const isYtmusicConnected = Boolean(ytmusicAuth?.connected);
  const activeYoutubeConnected = Boolean(authUser?.youtube?.slots?.primary?.authenticated);

  // Playlist selection
  const [playlists, setPlaylists] = useState([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState('');
  const [loadingPlaylists, setLoadingPlaylists] = useState(true);
  const [playlistFilterQuery, setPlaylistFilterQuery] = useState('');

  const filteredPlaylists = useMemo(() => {
    const q = playlistFilterQuery.trim().toLowerCase();
    if (!q) return playlists;
    return playlists.filter(
      (pl) =>
        (pl.title || '').toLowerCase().includes(q) ||
        (pl.description || '').toLowerCase().includes(q)
    );
  }, [playlists, playlistFilterQuery]);

  useEffect(() => {
    if (playlistFilterQuery.trim() && filteredPlaylists.length > 0) {
      if (!filteredPlaylists.some((p) => p.id === selectedPlaylistId)) {
        setSelectedPlaylistId(filteredPlaylists[0].id);
      }
    }
  }, [playlistFilterQuery, filteredPlaylists, selectedPlaylistId]);

  // Load playlists
  const fetchPlaylists = useCallback(async () => {
    setLoadingPlaylists(true);
    try {
      const res = await api.getPlaylistSortPlaylists();
      setPlaylists(res.playlists || []);
      if ((res.playlists || []).length > 0 && !selectedPlaylistId) {
        setSelectedPlaylistId(res.playlists[0].id);
      }
    } catch (err) {
      toast.error(`載入播放清單失敗：${err.message || '未知錯誤'}`);
    } finally {
      setLoadingPlaylists(false);
    }
  }, [toast, selectedPlaylistId]);

  const ytmusicOAuth = useOAuthConnect({
    serviceName: 'ytmusic',
    getAuthUrl: api.getYtmusicAuthUrl,
    disconnect: api.disconnectYtmusic,
    onAfterDisconnect: async () => {
      await refreshAuthUser?.();
      fetchPlaylists();
    },
    serviceLabel: 'YouTube Music 授權',
    successMessage: '已解除 YouTube Music 授權',
  });

  // Sort configuration
  const { value: preferences } = useAccountWorkState('ytmusic_preferences', { defaultPreset: 'title-asc' });
  const [presetMode, setPresetMode] = useState(preferences?.defaultPreset || 'title-asc');
  const [customKeys, setCustomKeys] = useState([{ field: 'title', direction: 'asc' }]);

  useEffect(() => {
    if (preferences?.defaultPreset) {
      setPresetMode((current) => (current === 'title-asc' ? preferences.defaultPreset : current));
    }
  }, [preferences?.defaultPreset]);

  // Preview
  const [previewData, setPreviewData] = useState(null);
  const [previewToken, setPreviewToken] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [quotaEstimate, setQuotaEstimate] = useState(null);

  // Apply
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset preview when sort or playlist changes
  useEffect(() => {
    setPreviewData(null);
    setPreviewToken('');
    setQuotaEstimate(null);
    setApplyResult(null);
  }, [selectedPlaylistId, presetMode, customKeys]);

  const handlePreview = useCallback(async () => {
    if (!selectedPlaylistId) {
      toast.warning('請先選擇播放清單');
      return;
    }
    if (activeSortKeys.length === 0) {
      toast.warning('請至少指定一個排序欄位');
      return;
    }
    setPreviewing(true);
    setPreviewData(null);
    setApplyResult(null);
    try {
      const res = await api.previewPlaylistSort({
        playlistId: selectedPlaylistId,
        sortKeys: activeSortKeys,
      });
      setPreviewData(res.preview || null);
      setPreviewToken(res.preview_token || '');
      setQuotaEstimate(res.quota_estimate || null);
      const moved = res.preview?.moved_count ?? 0;
      const total = res.preview?.total ?? 0;
      if (moved === 0) {
        toast.success(`清單已是正確順序，無需排序（共 ${total} 首）`);
      } else {
        toast.success(`預覽完成：${moved} 首需移動 / 共 ${total} 首`);
      }
    } catch (err) {
      toast.error(`預覽失敗：${err.message || '未知錯誤'}`);
    } finally {
      setPreviewing(false);
    }
  }, [selectedPlaylistId, activeSortKeys, toast]);

  const handleApplyClick = useCallback(() => {
    if (!previewData || previewData.moved_count === 0) {
      toast.info('清單順序無需變更');
      return;
    }
    setShowConfirm(true);
  }, [previewData, toast]);

  const handleApplyConfirm = useCallback(async () => {
    setShowConfirm(false);
    setApplying(true);
    try {
      const res = await api.applyPlaylistSort({
        playlistId: selectedPlaylistId,
        sortKeys: activeSortKeys,
        previewToken,
      });
      setApplyResult(res);
      const succeeded = res.succeeded ?? 0;
      const failed = res.failed ?? 0;
      if (failed > 0) {
        toast.warning(`排序完成：成功 ${succeeded} / 失敗 ${failed}`);
      } else {
        toast.success(`排序成功套用！已移動 ${succeeded} 首歌曲`);
      }
      setPreviewData(null);
      setPreviewToken('');
      setQuotaEstimate(null);
    } catch (err) {
      toast.error(`套用排序失敗：${err.message || '未知錯誤'}`);
    } finally {
      setApplying(false);
    }
  }, [selectedPlaylistId, activeSortKeys, previewToken, toast]);

  const handleCustomKeyChange = useCallback((index, newKey) => {
    setCustomKeys((prev) => prev.map((k, i) => (i === index ? newKey : k)));
  }, []);

  const handleCustomKeyRemove = useCallback((index) => {
    setCustomKeys((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleAddCustomKey = useCallback(() => {
    setCustomKeys((prev) => {
      if (prev.length >= 3) return prev;
      return [...prev, { field: 'title', direction: 'asc' }];
    });
  }, []);

  const selectedPlaylist = playlists.find((p) => p.id === selectedPlaylistId);

  // Build original/sorted item lists for preview
  const originalItems = previewData?.items
    ? [...previewData.items].sort((a, b) => (a.original_position ?? 0) - (b.original_position ?? 0))
    : [];
  const sortedItems = previewData?.items
    ? [...previewData.items].sort((a, b) => (a.new_position ?? 0) - (b.new_position ?? 0))
    : [];

  return (
    <div className="section-gap">
      {/* Page Header */}
      <header className="glass-panel page-header card-padding">
        <div className="badge badge-info dashboard-eyebrow">
          <Sparkles size={14} aria-hidden="true" /> YouTube Music
        </div>
        <h1>YouTube Music 播放清單排序</h1>
        <p className="section-desc">
          讀取個人 YouTube Music 播放清單，以歌名、藝人/頻道、新增時間、發布日期、長度等欄位自訂多重排序，即時雙欄預覽並一鍵套用。
        </p>
      </header>

      {/* YouTube Music In-Place Authorization Status */}
      <section className="glass-panel card-padding">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="icon-box icon-box-primary" style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8 }}>
              <Disc3 size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: '1rem' }}>YouTube Music 帳號授權</strong>
                {isYtmusicConnected ? (
                  <span className="badge badge-connected"><CheckCircle2 size={12} /> 專屬帳號已授權</span>
                ) : activeYoutubeConnected ? (
                  <span className="badge badge-info">共用 YouTube 頻道授權</span>
                ) : (
                  <span className="badge badge-disconnected"><AlertTriangle size={12} /> 尚未授權</span>
                )}
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)' }}>
                {isYtmusicConnected
                  ? `已連結專屬音樂帳號：${ytmusicAuth?.user?.email || '已授權'}。個人音樂播放清單與 YouTube 創作者工作流獨立管理。`
                  : activeYoutubeConnected
                  ? `目前暫時沿用主要 YouTube 頻道（${authUser?.youtube?.slots?.primary?.channel_title || '品牌頻道'}）授權。若要使用個人日常音樂帳號，建議連結 YouTube Music 專屬帳號。`
                  : '尚未連結 YouTube 或 YouTube Music 帳號，請先完成授權以載入個人播放清單。'}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Link
              to={PATHS.ytmusicSettings}
              className="btn btn-secondary btn-sm"
              title="前往 YouTube Music 設定"
            >
              <Settings size={14} /> 設定
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
                  className="btn btn-secondary btn-sm"
                  style={{ color: 'var(--color-danger, #ef4444)' }}
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
                {ytmusicOAuth.connecting ? <Loader2 size={14} className="spin" /> : <Disc3 size={14} />} 連結 YouTube Music 專屬帳號
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Step 1: Select Playlist */}
      <section className="glass-panel card-padding">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <ListMusic size={18} /> 選擇播放清單
          </h3>
          {playlists.length > 0 && (
            <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)' }}>
              {playlistFilterQuery
                ? `篩選符合 ${filteredPlaylists.length} / 共 ${playlists.length} 個`
                : `共 ${playlists.length} 個播放清單`}
            </span>
          )}
        </div>

        {/* Playlist Name Filter Input */}
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'rgba(255,255,255,0.4)',
              pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            className="form-input"
            placeholder="依播放清單名稱或說明快速篩選…"
            value={playlistFilterQuery}
            onChange={(e) => setPlaylistFilterQuery(e.target.value)}
            disabled={loadingPlaylists || playlists.length === 0}
            style={{ paddingLeft: 32, paddingRight: playlistFilterQuery ? 32 : 12, width: '100%' }}
          />
          {playlistFilterQuery && (
            <button
              type="button"
              onClick={() => setPlaylistFilterQuery('')}
              style={{
                position: 'absolute',
                right: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                color: 'rgba(255,255,255,0.5)',
                cursor: 'pointer',
                padding: 4,
              }}
              title="清除篩選"
              aria-label="清除篩選"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            className="form-select"
            value={selectedPlaylistId}
            onChange={(e) => setSelectedPlaylistId(e.target.value)}
            disabled={loadingPlaylists || filteredPlaylists.length === 0}
            style={{ flex: 1, minWidth: 200 }}
          >
            {loadingPlaylists ? (
              <option value="">載入中…</option>
            ) : filteredPlaylists.length === 0 ? (
              <option value="">
                {playlists.length === 0 ? '找不到播放清單' : '無符合關鍵字的播放清單'}
              </option>
            ) : (
              filteredPlaylists.map((pl) => (
                <option key={pl.id} value={pl.id}>
                  {pl.title} ({pl.item_count} 首)
                </option>
              ))
            )}
          </select>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={fetchPlaylists}
            disabled={loadingPlaylists}
            title="重新整理清單"
          >
            <RefreshCw size={14} className={loadingPlaylists ? 'spin' : ''} />
          </button>
        </div>
        {selectedPlaylist && (
          <p style={{ margin: '8px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
            {selectedPlaylist.description || '無說明'} · {selectedPlaylist.privacy_status === 'private' ? '私人' : selectedPlaylist.privacy_status === 'unlisted' ? '不公開' : '公開'}
          </p>
        )}
      </section>

      {/* Step 2: Sort Rules */}
      <section className="glass-panel card-padding">
        <h3 style={{ margin: '0 0 12px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
          <ArrowUpDown size={18} /> 排序規則
        </h3>
        <div style={{ marginBottom: 12 }}>
          <select
            className="form-select"
            value={presetMode}
            onChange={(e) => setPresetMode(e.target.value)}
            style={{ maxWidth: 300 }}
          >
            {SORT_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </div>

        {presetMode === 'custom' && (
          <div style={{ marginBottom: 12 }}>
            {customKeys.map((k, i) => (
              <SortKeyRow
                key={i}
                sortKey={k}
                index={i}
                onChange={handleCustomKeyChange}
                onRemove={handleCustomKeyRemove}
                canRemove={customKeys.length > 1}
              />
            ))}
            {customKeys.length < 3 && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleAddCustomKey}
                style={{ fontSize: 13, padding: '4px 12px', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <Plus size={14} /> 新增排序順位
              </button>
            )}
          </div>
        )}

        <button
          type="button"
          className="btn btn-primary"
          onClick={handlePreview}
          disabled={previewing || !selectedPlaylistId || applying}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          {previewing ? <Loader2 size={15} className="spin" /> : <ArrowUpDown size={15} />}
          {previewing ? '預覽中…' : '模擬預覽'}
        </button>
      </section>

      {/* Step 3: Preview Results */}
      {previewData && (
        <section className="glass-panel card-padding">
          <h3 style={{ margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
            預覽結果
          </h3>
          <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 14, flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <StatusDot status="unchanged" /> 不變 {previewData.unchanged_count} 首
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <StatusDot status="moved" /> 移動 {previewData.moved_count} 首
            </span>
            <span style={{ color: 'rgba(255,255,255,0.5)' }}>
              共 {previewData.total} 首
            </span>
          </div>

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <PreviewTable title="目前順序" items={originalItems} />
            <PreviewTable title="排序後順序" items={sortedItems} icon={ArrowUpDown} />
          </div>
        </section>
      )}

      {/* Step 4: Apply */}
      {previewData && previewData.moved_count > 0 && !applyResult && (
        <section className="glass-panel card-padding">
          {quotaEstimate && (
            <StatusMessage tone="warning" title="API 配額消耗預估">
              <span>
                本次排序將移動 <strong>{quotaEstimate.moved_count}</strong> 首歌曲，
                預估消耗 <strong>{quotaEstimate.total_units?.toLocaleString()}</strong> API 配額點數
                （每次移動 {quotaEstimate.units_per_move} 點）。
              </span>
            </StatusMessage>
          )}
          <div style={{ marginTop: 12 }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleApplyClick}
              disabled={applying}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {applying ? <Loader2 size={15} className="spin" /> : <Check size={15} />}
              {applying ? '套用中…' : '套用排序'}
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
            <span>
              成功移動 <strong>{applyResult.succeeded}</strong> 首，
              {applyResult.failed > 0 && (<>失敗 <strong>{applyResult.failed}</strong> 首，</>)}
              消耗 <strong>{applyResult.quota_used?.toLocaleString()}</strong> API 配額點數。
            </span>
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
            即將對播放清單「<strong>{selectedPlaylist?.title || selectedPlaylistId}</strong>」套用排序，
            將移動 <strong>{previewData?.moved_count || 0}</strong> 首歌曲。
          </p>
          {quotaEstimate && (
            <p style={{ color: 'var(--color-warning, #eab308)' }}>
              ⚠ 預估消耗 <strong>{quotaEstimate.total_units?.toLocaleString()}</strong> API 配額點數。
              此操作不可自動撤銷。
            </p>
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
    </div>
  );
}
