import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowRight, CheckCircle2, Clapperboard, ExternalLink, Eye, EyeOff, Key, PlaySquare, RefreshCw, Save, Settings2, Smartphone, XCircle, Youtube } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { api, normalizeYoutubePlaylistInput } from '../services/api';
import { useToast } from '../components/Toast';
import SourceLinkInput from '../components/SourceLinkInput';
import ConfirmDialog from '../components/ConfirmDialog';
import { YOUTUBE_ROUTING_MODES, youtubeRoutingLabel } from '../utils/youtubeRouting';
import { saveOAuthReturnPath } from '../utils/authReturnPath';
import { PATHS } from '../routes/paths';

const SLOT_ORDER = ['primary', 'secondary'];

export function initialSettings(defaultPlaylistId, quotaLimit, quotaBuffer) {
  return {
    playlistId: defaultPlaylistId || '',
    quotaLimit: quotaLimit ?? 10000,
    quotaBuffer: quotaBuffer ?? 1000,
  };
}

function formatTokenDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-TW');
}

function tokenStatusLabel(status) {
  return {
    active: '正常（會自動更新）',
    refresh_failed: '暫時更新失敗',
    reauthorization_required: '需要重新授權',
    not_connected: '尚未連結',
  }[status] || '未取得狀態';
}

export function normalizeSlotRecord(slot, record) {
  const canBeActive = record?.can_be_active === undefined
    ? Boolean(record?.authenticated)
    : Boolean(record.can_be_active);
  return {
    slot,
    label: record?.label || (slot === 'primary' ? 'Primary' : 'Secondary'),
    configured: Boolean(record?.configured),
    enabled: Boolean(record?.enabled),
    authenticated: Boolean(record?.authenticated),
    can_be_active: canBeActive,
    channel_mismatch: Boolean(record?.channel_mismatch),
    user: record?.user || null,
    channel_id: record?.channel_id || null,
    channel_title: record?.channel_title || null,
    token_status: record?.token_status || 'not_connected',
    token_expires_at: record?.token_expires_at,
    last_refreshed_at: record?.last_refreshed_at,
    last_refresh_error: record?.last_refresh_error,
    client_fingerprint: record?.client_fingerprint,
    quota_limit: Number(record?.quota_limit ?? 10000),
    safety_buffer_units: Number(record?.safety_buffer_units ?? 1000),
  };
}

export default function YouTubeSettingsPage({ authUser, sysSettings = {}, refreshSettings, refreshAuthUser, section = 'all' }) {
  const toast = useToast();
  const location = useLocation();
  const showConnections = section === 'all' || section === 'connections';
  const showRouting = section === 'all' || section === 'routing';
  const showQuota = section === 'all' || section === 'quota';
  const showPlaylist = section === 'all' || section === 'playlist';
  const showWorkflowLinks = section === 'all';
  const youtube = useMemo(() => authUser?.youtube || {}, [authUser?.youtube]);
  const initial = useMemo(
    () => initialSettings(sysSettings.default_playlist_id, sysSettings.quota_limit, sysSettings.safety_buffer_units),
    [sysSettings.default_playlist_id, sysSettings.quota_limit, sysSettings.safety_buffer_units],
  );
  const slotRecords = useMemo(() => SLOT_ORDER.reduce((all, slot) => {
    all[slot] = normalizeSlotRecord(slot, youtube.slots?.[slot]);
    return all;
  }, {}), [youtube]);
  const [playlistId, setPlaylistId] = useState(initial.playlistId);
  const [slotDrafts, setSlotDrafts] = useState(() => Object.fromEntries(
    SLOT_ORDER.map((slot) => [slot, {
      quotaLimit: slotRecords[slot].quota_limit,
      quotaBuffer: slotRecords[slot].safety_buffer_units,
    }]),
  ));
  const [activeSlot, setActiveSlot] = useState(youtube.active_slot || 'primary');
  const [routingMode, setRoutingMode] = useState(youtube.routing_mode || YOUTUBE_ROUTING_MODES.AUTO_PRIMARY);
  const [routingModeDraft, setRoutingModeDraft] = useState(youtube.routing_mode || YOUTUBE_ROUTING_MODES.AUTO_PRIMARY);
  const [busyAction, setBusyAction] = useState(null);
  const [disconnectTarget, setDisconnectTarget] = useState(null);
  const [msg, setMsg] = useState(null);
  const [editingSlot, setEditingSlot] = useState(null);
  const [slotClientId, setSlotClientId] = useState('');
  const [slotClientSecret, setSlotClientSecret] = useState('');
  const [slotLabel, setSlotLabel] = useState('');
  const [slotEnabled, setSlotEnabled] = useState(false);
  const [savingSlotCreds, setSavingSlotCreds] = useState(false);
  const [showSlotSecret, setShowSlotSecret] = useState(false);
  const playlistSaveTimerRef = useRef(null);
  const [playlistAutosaveStatus, setPlaylistAutosaveStatus] = useState(null);

  const handleOpenEditSlot = (slot) => {
    setEditingSlot(slot);
    setSlotLabel(slotRecords[slot].label);
    setSlotEnabled(slotRecords[slot].enabled);
    setSlotClientId('');
    setSlotClientSecret('');
    setShowSlotSecret(false);
  };

  const handleSaveSlotCreds = async (slot) => {
    setSavingSlotCreds(true);
    try {
      const payload = {
        label: slotLabel.trim() || undefined,
        enabled: slot === 'secondary' ? slotEnabled : undefined,
      };
      if (slotClientId.trim()) {
        payload.client_id = slotClientId.trim();
      }
      if (slotClientSecret.trim()) {
        payload.client_secret = slotClientSecret.trim();
      }
      await api.updateYoutubeSlotConfig(slot, payload);
      if (refreshSettings) await refreshSettings();
      if (refreshAuthUser) await refreshAuthUser();
      setEditingSlot(null);
      toast.success(`${slotRecords[slot].label} 設定已儲存`);
    } catch (err) {
      toast.error(`儲存失敗：${err.message}`);
    } finally {
      setSavingSlotCreds(false);
    }
  };

  const handleUseSystemOAuthForPrimary = async () => {
    setSavingSlotCreds(true);
    try {
      await api.updateYoutubeSlotConfig('primary', {
        use_system_google_oauth: true,
      });
      if (refreshSettings) await refreshSettings();
      if (refreshAuthUser) await refreshAuthUser();
      setEditingSlot(null);
      toast.success('已成功將系統 Google OAuth 憑證同步至 YouTube Primary 槽位！');
    } catch (err) {
      toast.error(`同步失敗：${err.message}`);
    } finally {
      setSavingSlotCreds(false);
    }
  };

  useEffect(() => {
    setPlaylistId(initial.playlistId);
  }, [initial.playlistId]);

  useEffect(() => {
    setActiveSlot(youtube.active_slot || 'primary');
    const nextRoutingMode = youtube.routing_mode || YOUTUBE_ROUTING_MODES.AUTO_PRIMARY;
    setRoutingMode(nextRoutingMode);
    setRoutingModeDraft(nextRoutingMode);
    setSlotDrafts(Object.fromEntries(SLOT_ORDER.map((slot) => [slot, {
      quotaLimit: slotRecords[slot].quota_limit,
      quotaBuffer: slotRecords[slot].safety_buffer_units,
    }])));
  }, [slotRecords, youtube.active_slot, youtube.routing_mode]);

  const saveRoutingMode = async () => {
    if (busyAction) return;
    setBusyAction({ kind: 'routing' });
    setMsg(null);
    try {
      await api.updateYoutubeRoutingMode(routingModeDraft);
      setRoutingMode(routingModeDraft);
      if (refreshSettings) await refreshSettings();
      if (refreshAuthUser) await refreshAuthUser();
      setMsg({ type: 'success', text: `YouTube slot 使用模式已切換為「${youtubeRoutingLabel(routingModeDraft)}」。` });
      toast.success(`已切換為${youtubeRoutingLabel(routingModeDraft)}`);
    } catch (error) {
      setMsg({ type: 'error', text: error.message || '儲存失敗。' });
      toast.error(`儲存失敗：${error.message || '未知錯誤'}`);
    } finally {
      setBusyAction(null);
    }
  };

  const saveSlot = async (slot) => {
    const draft = slotDrafts[slot];
    const limit = Number(draft.quotaLimit);
    const buffer = Number(draft.quotaBuffer);
    if (!Number.isInteger(limit) || limit <= 0 || !Number.isInteger(buffer) || buffer < 0 || buffer >= limit) {
      const message = '配額上限必須大於 0，安全保留必須大於等於 0 且小於配額上限。';
      setMsg({ type: 'error', text: message });
      toast.error(message);
      return;
    }
    setBusyAction({ kind: 'quota', slot });
    setMsg(null);
    try {
      await api.updateYoutubeQuota({
        slot,
        quotaLimit: limit,
        safetyBufferUnits: buffer,
      });
      await refreshSettings();
      if (refreshAuthUser) await refreshAuthUser();
      setMsg({ type: 'success', text: `${slotRecords[slot].label} 設定已儲存。` });
      toast.success(`${slotRecords[slot].label} 設定已儲存`);
    } catch (error) {
      setMsg({ type: 'error', text: error.message || '儲存失敗。' });
      toast.error(`儲存失敗：${error.message || '未知錯誤'}`);
    } finally {
      setBusyAction(null);
    }
  };

  const saveResources = async (event) => {
    if (event) event.preventDefault();
    window.clearTimeout(playlistSaveTimerRef.current);
    const normalizedPlaylistId = normalizeYoutubePlaylistInput(playlistId);
    if (playlistId.trim() && !normalizedPlaylistId) {
      const message = '請輸入合法的 YouTube 播放清單網址或 ID。';
      setMsg({ type: 'error', text: message });
      toast.error(message);
      return;
    }
    setBusyAction({ kind: 'playlist' });
    setMsg(null);
    try {
      await api.updateYoutubePlaylist({
        playlistId: normalizedPlaylistId,
      });
      await refreshSettings();
      setPlaylistId(normalizedPlaylistId);
      setPlaylistAutosaveStatus('saved');
      setMsg({ type: 'success', text: '預設播放清單已儲存。' });
      toast.success('預設播放清單已儲存');
    } catch (error) {
      setPlaylistAutosaveStatus('error');
      setMsg({ type: 'error', text: error.message || '儲存失敗。' });
      toast.error(`儲存失敗：${error.message || '未知錯誤'}`);
    } finally {
      setBusyAction(null);
    }
  };

  const handlePlaylistChange = (value) => {
    setPlaylistId(value);
    window.clearTimeout(playlistSaveTimerRef.current);
    const normalized = normalizeYoutubePlaylistInput(value);
    if (value.trim() && !normalized) {
      setPlaylistAutosaveStatus('invalid');
      return;
    }
    setPlaylistAutosaveStatus('saving');
    playlistSaveTimerRef.current = window.setTimeout(async () => {
      try {
        await api.updateYoutubePlaylist({ playlistId: normalized });
        await refreshSettings?.();
        setPlaylistAutosaveStatus('saved');
      } catch {
        setPlaylistAutosaveStatus('error');
      }
    }, 800);
  };

  useEffect(() => {
    return () => {
      window.clearTimeout(playlistSaveTimerRef.current);
    };
  }, []);

  const isQuotaDirty = (slot) => {
    const d = slotDrafts[slot];
    const rec = slotRecords[slot];
    if (!d || !rec) return false;
    return Number(d.quotaLimit) !== Number(rec.quota_limit) || Number(d.quotaBuffer) !== Number(rec.safety_buffer_units);
  };

  const isRoutingDirty = routingModeDraft !== routingMode;

  const isSlotCredsDirty = (slot) => {
    if (editingSlot !== slot) return false;
    return slotLabel.trim() !== slotRecords[slot].label
      || (slot === 'secondary' && slotEnabled !== slotRecords[slot].enabled)
      || Boolean(slotClientId.trim())
      || Boolean(slotClientSecret.trim());
  };

  const updateDraft = (slot, field, value) => {
    setSlotDrafts((current) => ({ ...current, [slot]: { ...current[slot], [field]: value } }));
  };

  const startOAuth = async (slot) => {
    if (busyAction) return;
    setBusyAction({ kind: 'authorization', slot });
    try {
      saveOAuthReturnPath('youtube', `${location.pathname}${location.search}`);
      const result = await api.getYoutubeAuthUrl(slot);
      if (!result.auth_url) throw new Error('無法取得 Google 授權網址，請稍後再試。');
      window.location.href = result.auth_url;
    } catch (error) {
      toast.error(`取得 ${slotRecords[slot].label} 授權網址失敗：${error.message || '未知錯誤'}`);
      setBusyAction(null);
    }
  };

  const activateSlot = async (slot) => {
    if (busyAction || !slotRecords[slot].can_be_active) return;
    setBusyAction({ kind: 'authorization', slot });
    try {
      await api.activateYoutubeSlot(slot);
      setActiveSlot(slot);
      if (refreshAuthUser) await refreshAuthUser();
      toast.success(`已將 ${slotRecords[slot].label} 設為作用中 slot`);
    } catch (error) {
      toast.error(`切換 slot 失敗：${error.message || '未知錯誤'}`);
    } finally {
      setBusyAction(null);
    }
  };

  const requestDisconnect = (slot) => {
    if (busyAction) return;
    const isActive = routingMode === YOUTUBE_ROUTING_MODES.MANUAL && activeSlot === slot;
    setDisconnectTarget({ slot, isActive });
  };

  const disconnectSlot = async () => {
    if (!disconnectTarget || busyAction) return;
    const { slot } = disconnectTarget;
    setDisconnectTarget(null);
    setBusyAction({ kind: 'authorization', slot });
    try {
      await api.disconnectYoutube(slot, { confirm: true });
      if (refreshAuthUser) await refreshAuthUser();
      toast.success(`${slotRecords[slot].label} 已斷開`);
    } catch (error) {
      toast.error(`斷開失敗：${error.message || '未知錯誤'}`);
    } finally {
      setBusyAction(null);
    }
  };

  const pageBusy = Boolean(busyAction);
  const authorizationBusy = busyAction?.kind === 'authorization';
  const disconnectRecord = disconnectTarget ? slotRecords[disconnectTarget.slot] : null;
  const disconnectMessage = disconnectTarget?.isActive
    ? `這是目前作用中的 ${disconnectRecord?.label || 'YouTube'} 授權組合。斷開後，新的 YouTube request 將暫時無法執行，直到另一個可用組合設為作用中或重新授權。確定要斷開嗎？`
    : `將移除 ${disconnectRecord?.label || '此組合'} 的 YouTube 授權；目前作用中的 request context 不受影響。確定要斷開嗎？`;

  return (
    <div className="section-gap settings-page youtube-settings-page">
      {section === 'all' && <header className="page-header">
        <h1>YouTube 設定</h1>
        <p className="section-desc">管理兩組 YouTube OAuth slot、頻道一致性、配額優先順序、發布預設資源與各 project 配額。Auto 模式會優先使用 Primary，配額不足時自動切換 Secondary 並繼續處理。</p>
      </header>}

      {msg && <div className="info-banner">{msg.type === 'success' ? <CheckCircle2 size={18} /> : <XCircle size={18} />}{msg.text}</div>}

      {showRouting && <section className="glass-panel card-padding settings-card card-stack">
        <div className="card-header">
          <div>
            <h2 className="settings-heading">YouTube slot 使用優先順序</h2>
            <p className="section-desc">目前模式：{youtubeRoutingLabel(routingMode)}。Auto 模式會以本次 workflow 的保守配額預估選擇可用 slot，並在 Primary 恢復後自動優先回到 Primary。</p>
          </div>
          <span className="badge badge-info">{youtubeRoutingLabel(routingMode)}</span>
        </div>
        <div className="settings-grid">
          <div className="form-group">
            <label className="form-label" htmlFor="youtube-routing-mode">路由模式 (Routing Mode)</label>
            <select id="youtube-routing-mode" className="form-select" value={routingModeDraft} onChange={(event) => setRoutingModeDraft(event.target.value)}>
              <option value={YOUTUBE_ROUTING_MODES.AUTO_PRIMARY}>Auto：Primary 優先，配額不足時 Secondary</option>
              <option value={YOUTUBE_ROUTING_MODES.MANUAL}>手動：只使用目前作用中 slot</option>
            </select>
          </div>
          <div className="glass-panel settings-info-card">
            <strong>切換邊界</strong>
            <p>{routingModeDraft === YOUTUBE_ROUTING_MODES.AUTO_PRIMARY ? '每個新的 request／preview 會先選擇可用 slot；執行途中若 quota 不足，會自動切換另一個 slot 並重試目前操作。' : '只使用下方標示的目前作用中 slot，不會自動 fallback。'}</p>
          </div>
        </div>
        {isRoutingDirty && (
          <div
            className="info-banner warning-banner"
            style={{
              background: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              color: '#fbbf24',
              padding: '0.6rem 0.8rem',
              borderRadius: '6px',
              fontSize: '0.82rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginTop: '0.75rem',
            }}
          >
            <AlertCircle size={16} />
            <span>您已將路由模式切換為「{youtubeRoutingLabel(routingModeDraft)}」（尚未儲存）。請記得點擊下方「儲存使用模式」按鈕完成保存！</span>
          </div>
        )}
        <div className="page-actions settings-card-actions">
          <button className="btn btn-success" type="submit" onClick={saveRoutingMode} disabled={pageBusy || !isRoutingDirty}>
            <Save size={18} />{busyAction?.kind === 'routing' ? '儲存中...' : '儲存使用模式'}
          </button>
        </div>
      </section>}

      {(showConnections || showQuota) && <div className="responsive-grid youtube-slot-grid">
        {SLOT_ORDER.map((slot) => {
          const record = slotRecords[slot];
          const draft = slotDrafts[slot];
          const isActive = routingMode === YOUTUBE_ROUTING_MODES.MANUAL && activeSlot === slot;
          const isPrimaryPreferred = routingMode === YOUTUBE_ROUTING_MODES.AUTO_PRIMARY && slot === 'primary';
          const busy = busyAction?.slot === slot;
          return (
            <section className="glass-panel card-padding settings-card card-stack" key={slot}>
              <div className="card-header">
                <div className="card-header-title"><Youtube size={20} color="#ff4d6d" /><h2 className="settings-heading">{record.label}</h2></div>
                {isActive && <span className="badge badge-info">目前作用中</span>}
                {isPrimaryPreferred && <span className="badge badge-info">Auto 優先</span>}
                {record.authenticated
                  ? <span className="badge badge-connected"><CheckCircle2 size={14} /> 已授權</span>
                  : <span className="badge badge-disconnected"><XCircle size={14} /> {record.configured ? '尚未授權' : '未配置'}</span>}
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleOpenEditSlot(slot)}
                  style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem' }}
                >
                  <Key size={13} /> {record.configured ? '修改憑證' : '配置憑證'}
                </button>
              </div>

              {editingSlot === slot && (
                <div style={{ background: 'rgba(0, 0, 0, 0.25)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px', padding: '1rem', marginTop: '0.75rem' }}>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Key size={16} color="#60a5fa" /> 設定 {record.label} OAuth 憑證
                  </h4>

                  {slot === 'primary' && (
                    <div style={{ marginBottom: '0.85rem' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={handleUseSystemOAuthForPrimary}
                        disabled={savingSlotCreds}
                        style={{ width: '100%', marginBottom: '0.5rem', background: 'rgba(59, 130, 246, 0.15)', borderColor: '#3b82f6', color: '#93c5fd' }}
                      >
                        ✓ 一鍵共用控制台 Google OAuth 憑證
                      </button>
                      <div style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>— 或填寫自訂獨立憑證 —</div>
                    </div>
                  )}

                  {slot === 'secondary' && (
                    <div style={{ marginBottom: '0.75rem' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={slotEnabled}
                          onChange={(e) => setSlotEnabled(e.target.checked)}
                          disabled={savingSlotCreds}
                        />
                        啟用此 Secondary 備用槽位
                      </label>
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                        槽位顯示名稱 (Label)
                      </label>
                      <input
                        type="text"
                        className="form-control form-input"
                        value={slotLabel}
                        onChange={(e) => setSlotLabel(e.target.value)}
                        placeholder="例如：Primary 或 Secondary"
                        disabled={savingSlotCreds}
                        style={{ width: '100%' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                        OAuth Client ID
                      </label>
                      <input
                        type="text"
                        className="form-control form-input"
                        value={slotClientId}
                        onChange={(e) => setSlotClientId(e.target.value)}
                        placeholder="請填寫 Google Cloud Console OAuth Client ID"
                        disabled={savingSlotCreds}
                        style={{ width: '100%' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                        OAuth Client Secret
                      </label>
                      <div style={{ position: 'relative' }}>
                        <input
                          type={showSlotSecret ? 'text' : 'password'}
                          className="form-control form-input"
                          value={slotClientSecret}
                          onChange={(e) => setSlotClientSecret(e.target.value)}
                          placeholder="••••••••••••••••（輸入可覆蓋更新）"
                          disabled={savingSlotCreds}
                          style={{ width: '100%', paddingRight: '2.5rem' }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowSlotSecret(!showSlotSecret)}
                          style={{
                            position: 'absolute',
                            right: '0.5rem',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                          }}
                        >
                          {showSlotSecret ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                    </div>

                    {isSlotCredsDirty(slot) && (
                      <div
                        className="info-banner warning-banner"
                        style={{
                          background: 'rgba(245, 158, 11, 0.12)',
                          border: '1px solid rgba(245, 158, 11, 0.3)',
                          color: '#fbbf24',
                          padding: '0.5rem 0.75rem',
                          borderRadius: '6px',
                          fontSize: '0.8rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          marginTop: '0.5rem',
                        }}
                      >
                        <AlertCircle size={15} />
                        <span>槽位憑證設定已修改（尚未保存）。請記得點擊右下方的「儲存設定」按鈕！</span>
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.25rem' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setEditingSlot(null)}
                        disabled={savingSlotCreds}
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => handleSaveSlotCreds(slot)}
                        disabled={savingSlotCreds}
                      >
                        {savingSlotCreds ? '儲存中...' : '儲存設定'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {!record.configured && <div className="info-banner"><XCircle size={16} /><span>此 slot 尚未由伺服器配置 OAuth Client；前端不會接觸 client secret。</span></div>}
              {record.channel_mismatch && <div className="info-banner"><XCircle size={16} /><span>此 slot 的 Channel ID 與另一個 slot 不一致，因此不能設為作用中；請重新授權同一頻道。</span></div>}

              <div className="settings-grid">
                <div className="glass-panel settings-info-card"><strong>Google 帳號</strong><p>{record.user?.email || '—'}</p></div>
                <div className="glass-panel settings-info-card"><strong>YouTube Channel</strong><p>{record.channel_title || record.channel_id || '尚未驗證'}</p></div>
                <div className="glass-panel settings-info-card"><strong>Token 狀態</strong><p>{tokenStatusLabel(record.token_status)}</p></div>
                <div className="glass-panel settings-info-card"><strong>Token 到期</strong><p>{formatTokenDate(record.token_expires_at)}</p></div>
                <div className="glass-panel settings-info-card"><strong>最近 refresh</strong><p>{formatTokenDate(record.last_refreshed_at)}</p></div>
                <div className="glass-panel settings-info-card"><strong>Client fingerprint</strong><p>{record.client_fingerprint || '—'}</p></div>
              </div>
              {record.last_refresh_error && <div className="info-banner"><XCircle size={16} /><span>Token refresh 失敗，請重新授權此 slot。</span></div>}

              {showQuota && <>
                <div className="responsive-grid youtube-quota-grid">
                  <div className="form-group">
                    <label className="form-label" htmlFor={`${slot}-quota-limit`}>Project 一般配額</label>
                    <input id={`${slot}-quota-limit`} className="form-input" type="number" min="1" step="1" value={draft.quotaLimit} onChange={(event) => updateDraft(slot, 'quotaLimit', event.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor={`${slot}-quota-buffer`}>安全保留單位</label>
                    <input id={`${slot}-quota-buffer`} className="form-input" type="number" min="0" step="1" value={draft.quotaBuffer} onChange={(event) => updateDraft(slot, 'quotaBuffer', event.target.value)} />
                  </div>
                </div>
                {isQuotaDirty(slot) && (
                  <div
                    className="info-banner warning-banner"
                    style={{
                      background: 'rgba(245, 158, 11, 0.12)',
                      border: '1px solid rgba(245, 158, 11, 0.3)',
                      color: '#fbbf24',
                      padding: '0.6rem 0.8rem',
                      borderRadius: '6px',
                      fontSize: '0.82rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      margin: '0.75rem 0',
                    }}
                  >
                    <AlertCircle size={16} />
                    <span>您已修改 {record.label} 的配額設定（尚未儲存）。為避免過度消耗寫入資源，修改後請記得點擊右下方的「儲存 slot 設定」按鈕！</span>
                  </div>
                )}
                <p className="section-desc">此記錄只記錄 {record.label}；配額已達上限或安全上限時，只影響這個 slot。Auto 模式會在下一個 workflow 開始時依配額選擇可用 slot。</p>
              </>}

              <div className="page-actions settings-card-actions">
                {showConnections && <>
                  <button className="btn btn-primary" onClick={() => startOAuth(slot)} type="button" disabled={!record.configured || pageBusy || authorizationBusy}>
                    {busy ? <><span className="login-spinner"></span> 處理中...</> : <><ExternalLink size={16} /> {record.authenticated ? '重新授權' : '連結此 slot'}</>}
                  </button>
                  {routingMode === YOUTUBE_ROUTING_MODES.MANUAL && record.can_be_active && !isActive && <button className="btn btn-secondary" onClick={() => activateSlot(slot)} type="button" disabled={pageBusy || authorizationBusy}>設為作用中</button>}
                  {record.authenticated && <button className="btn" onClick={() => requestDisconnect(slot)} type="button" disabled={pageBusy || authorizationBusy}>斷開</button>}
                </>}
                {showQuota && <button className="btn btn-success" onClick={() => saveSlot(slot)} type="button" disabled={pageBusy}><Save size={16} />儲存 slot 設定</button>}
              </div>
            </section>
          );
        })}
      </div>}

      {showPlaylist && <form className="glass-panel card-padding settings-card card-stack" onSubmit={saveResources}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h2 className="settings-heading"><PlaySquare size={20} color="var(--secondary)" /> 共用 To-Post 播放清單</h2>
            <p className="section-desc">這是目前帳號所有 YouTube 子頁面共用的 To-Post 播放清單；新上傳、Video、Shorts 與發布草稿流程都會以這個設定為準。</p>
          </div>
          {playlistAutosaveStatus === 'saving' && (
            <span className="badge badge-info"><RefreshCw size={12} className="spin" /> 自動儲存中...</span>
          )}
          {playlistAutosaveStatus === 'saved' && (
            <span className="badge badge-connected"><CheckCircle2 size={12} /> 已自動儲存</span>
          )}
          {playlistAutosaveStatus === 'invalid' && (
            <span className="badge badge-warning">播放清單網址格式不完整</span>
          )}
          {playlistAutosaveStatus === 'error' && (
            <span className="badge badge-disconnected">自動儲存失敗，請手動儲存</span>
          )}
        </div>
        <div className="form-group">
          <label className="form-label"><PlaySquare size={14} /> 共用 To-Post 播放清單</label>
          <SourceLinkInput value={playlistId} onChange={(event) => handlePlaylistChange(event.target.value)} sourceType="youtube-playlist" placeholder="YouTube Playlist ID 或網址" />
          <p className="section-desc">修改後會自動儲存至目前登入的 Google 帳號；換瀏覽器或重新登入仍可取回。</p>
        </div>
        <div className="page-actions settings-card-actions"><button className="btn btn-success" type="submit" disabled={pageBusy}><Save size={18} />{busyAction?.kind === 'playlist' ? '儲存中...' : '儲存預設播放清單'}</button></div>
      </form>}

      {showWorkflowLinks && <section className="glass-panel card-padding settings-card card-stack">
        <div>
          <h2 className="settings-heading">YouTube 草稿工作流設定</h2>
          <p className="section-desc">Video 與 Shorts 的工作表、欄位與工作流資源會分別保存；Sheet 內容複製、Video、Shorts 共用團體與人物篩選。</p>
        </div>
        <div className="responsive-grid youtube-workflow-grid">
          <div className="glass-panel youtube-workflow-card card-stack">
            <h3 className="youtube-workflow-heading"><Clapperboard size={18} /> Video 草稿</h3>
            <p className="section-desc">管理 Video 專屬工作表與欄位，人物篩選會與其他流程共用。</p>
            <Link className="btn btn-secondary settings-inline-button" to={PATHS.youtubeVideoDrafts}>前往 Video 設定 <ArrowRight size={16} /></Link>
          </div>
          <div className="glass-panel youtube-workflow-card card-stack">
            <h3 className="youtube-workflow-heading"><Smartphone size={18} /> Shorts 草稿</h3>
            <p className="section-desc">管理 Shorts 專屬工作表與欄位，人物篩選會與其他流程共用。</p>
            <Link className="btn btn-secondary settings-inline-button" to={PATHS.youtubeShortsDrafts}>前往 Shorts 設定 <ArrowRight size={16} /></Link>
          </div>
        </div>
      </section>}

      <ConfirmDialog
        open={Boolean(disconnectTarget)}
        title={`確認斷開 ${disconnectRecord?.label || 'YouTube'} 授權`}
        message={disconnectMessage}
        confirmText="確認斷開"
        cancelText="取消"
        variant="destructive"
        onConfirm={disconnectSlot}
        onCancel={() => { if (!busyAction) setDisconnectTarget(null); }}
      />
    </div>
  );
}
