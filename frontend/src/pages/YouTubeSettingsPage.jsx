import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { normalizeYoutubePlaylistInput } from '../features/youtube/api/youtubeBatchApi';
import { youtubeSettingsApi } from '../features/youtube/api/youtubeSettingsApi';
import { useToast } from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import { useDebouncedAutosave } from '../hooks/useDebouncedAutosave';
import { YOUTUBE_ROUTING_MODES, youtubeRoutingLabel } from '../utils/youtubeRouting';
import { saveOAuthReturnPath } from '../utils/authReturnPath';
import YouTubeRoutingSection from '../components/youtube/YouTubeRoutingSection';
import YouTubeSlotCard from '../components/youtube/YouTubeSlotCard';
import YouTubePlaylistSection from '../components/youtube/YouTubePlaylistSection';
import YouTubeWorkflowLinks from '../components/youtube/YouTubeWorkflowLinks';

const SLOT_ORDER = ['primary', 'secondary'];

export function initialSettings(defaultPlaylistId, quotaLimit, quotaBuffer) {
  return {
    playlistId: defaultPlaylistId || '',
    quotaLimit: quotaLimit ?? 10000,
    quotaBuffer: quotaBuffer ?? 1000,
  };
}

export function normalizeSlotRecord(slot, record) {
  const canBeActive =
    record?.can_be_active === undefined ? Boolean(record?.authenticated) : Boolean(record.can_be_active);
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

export default function YouTubeSettingsPage({
  authUser,
  sysSettings = {},
  refreshSettings,
  refreshAuthUser,
  section = 'all',
}) {
  const toast = useToast();
  const location = useLocation();
  const showConnections = section === 'all' || section === 'connections';
  const showRouting = section === 'all' || section === 'routing';
  const showQuota = section === 'all' || section === 'quota' || section === 'routing';
  const showPlaylist = section === 'all' || section === 'playlist';
  const showWorkflowLinks = section === 'all';
  const youtube = useMemo(() => authUser?.youtube || {}, [authUser?.youtube]);
  const initial = useMemo(
    () => initialSettings(sysSettings.default_playlist_id, sysSettings.quota_limit, sysSettings.safety_buffer_units),
    [sysSettings.default_playlist_id, sysSettings.quota_limit, sysSettings.safety_buffer_units]
  );
  const slotRecords = useMemo(
    () =>
      SLOT_ORDER.reduce((all, slot) => {
        all[slot] = normalizeSlotRecord(slot, youtube.slots?.[slot]);
        return all;
      }, {}),
    [youtube]
  );
  const [playlistId, setPlaylistId] = useState(initial.playlistId);
  const [slotDrafts, setSlotDrafts] = useState(() =>
    Object.fromEntries(
      SLOT_ORDER.map((slot) => [
        slot,
        {
          quotaLimit: slotRecords[slot].quota_limit,
          quotaBuffer: slotRecords[slot].safety_buffer_units,
        },
      ])
    )
  );
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
  const [playlistAutosaveStatus, setPlaylistAutosaveStatus] = useState(null);

  const {
    mutate: mutatePlaylistAutosave,
    flush: flushPlaylistAutosave,
    reset: resetPlaylistAutosave,
    dirty: isPlaylistDirty,
  } = useDebouncedAutosave({
    value: playlistId,
    delay: 800,
    compareFn: (a, b) => normalizeYoutubePlaylistInput(a) === normalizeYoutubePlaylistInput(b),
    onSave: async (nextValue) => {
      const normalized = normalizeYoutubePlaylistInput(nextValue);
      if (!normalized) return;
      await youtubeSettingsApi.updatePlaylist({ playlistId: normalized });
    },
    onSuccess: async (_nextValue, { notify } = {}) => {
      await refreshSettings?.();
      setPlaylistAutosaveStatus('saved');
      if (notify) {
        setMsg({ type: 'success', text: '預設播放清單已儲存。' });
        toast.success('預設播放清單已儲存');
      }
    },
    onError: (error, { notify } = {}) => {
      setPlaylistAutosaveStatus('error');
      if (notify) {
        setMsg({ type: 'error', text: error.message || '儲存失敗。' });
        toast.error(`儲存失敗：${error.message || '未知錯誤'}`);
      }
    },
  });

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
      await youtubeSettingsApi.updateSlotConfig(slot, payload);
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
      await youtubeSettingsApi.updateSlotConfig('primary', {
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
    if (!isPlaylistDirty) {
      setPlaylistId(initial.playlistId);
      resetPlaylistAutosave(initial.playlistId);
    }
  }, [initial.playlistId, isPlaylistDirty, resetPlaylistAutosave]);

  useEffect(() => {
    setActiveSlot(youtube.active_slot || 'primary');
    const nextRoutingMode = youtube.routing_mode || YOUTUBE_ROUTING_MODES.AUTO_PRIMARY;
    setRoutingMode(nextRoutingMode);
    setRoutingModeDraft(nextRoutingMode);
    setSlotDrafts(
      Object.fromEntries(
        SLOT_ORDER.map((slot) => [
          slot,
          {
            quotaLimit: slotRecords[slot].quota_limit,
            quotaBuffer: slotRecords[slot].safety_buffer_units,
          },
        ])
      )
    );
  }, [slotRecords, youtube.active_slot, youtube.routing_mode]);

  const saveRoutingMode = async () => {
    if (busyAction) return;
    setBusyAction({ kind: 'routing' });
    setMsg(null);
    try {
      await youtubeSettingsApi.updateRoutingMode(routingModeDraft);
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
      await youtubeSettingsApi.updateQuota({
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
      await flushPlaylistAutosave({ notify: true });
      setPlaylistId(normalizedPlaylistId);
    } catch (error) {
      setMsg({ type: 'error', text: error.message || '儲存失敗。' });
      toast.error(`儲存失敗：${error.message || '未知錯誤'}`);
    } finally {
      setBusyAction(null);
    }
  };

  const handlePlaylistChange = (value) => {
    setPlaylistId(value);
    const normalized = normalizeYoutubePlaylistInput(value);
    if (value.trim() && !normalized) {
      setPlaylistAutosaveStatus('invalid');
      return;
    }
    setPlaylistAutosaveStatus('saving');
    mutatePlaylistAutosave(value);
  };

  const isQuotaDirty = (slot) => {
    const d = slotDrafts[slot];
    const rec = slotRecords[slot];
    if (!d || !rec) return false;
    return (
      Number(d.quotaLimit) !== Number(rec.quota_limit) || Number(d.quotaBuffer) !== Number(rec.safety_buffer_units)
    );
  };

  const isRoutingDirty = routingModeDraft !== routingMode;

  const isSlotCredsDirty = (slot) => {
    if (editingSlot !== slot) return false;
    return (
      slotLabel.trim() !== slotRecords[slot].label ||
      (slot === 'secondary' && slotEnabled !== slotRecords[slot].enabled) ||
      Boolean(slotClientId.trim()) ||
      Boolean(slotClientSecret.trim())
    );
  };

  const updateDraft = (slot, field, value) => {
    setSlotDrafts((current) => ({ ...current, [slot]: { ...current[slot], [field]: value } }));
  };

  const startOAuth = async (slot) => {
    if (busyAction) return;
    setBusyAction({ kind: 'authorization', slot });
    try {
      saveOAuthReturnPath('youtube', `${location.pathname}${location.search}`);
      const result = await youtubeSettingsApi.getAuthUrl(slot);
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
      await youtubeSettingsApi.activateSlot(slot);
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
      await youtubeSettingsApi.disconnectSlot(slot, { confirm: true });
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
      {section === 'all' && (
        <header className="page-header">
          <h1>YouTube 設定</h1>
          <p className="section-desc">
            管理兩組 YouTube OAuth slot、頻道一致性、配額優先順序、發布預設資源與各 project 配額。Auto 模式會優先使用
            Primary，配額不足時自動切換 Secondary 並繼續處理。
          </p>
        </header>
      )}

      {msg && (
        <div className="info-banner">
          {msg.type === 'success' ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
          {msg.text}
        </div>
      )}

      {showRouting && (
        <YouTubeRoutingSection
          routingMode={routingMode}
          routingModeDraft={routingModeDraft}
          setRoutingModeDraft={setRoutingModeDraft}
          isRoutingDirty={isRoutingDirty}
          saveRoutingMode={saveRoutingMode}
          pageBusy={pageBusy}
          busyAction={busyAction}
        />
      )}

      {(showConnections || showQuota) && (
        <div
          className={showRouting ? 'youtube-slot-section youtube-slot-section-with-routing' : 'youtube-slot-section'}
        >
          {showRouting && (
            <div className="youtube-slot-section-heading">
              <h3 className="youtube-slot-section-title">各 Slot 配額上限與安全防護緩衝</h3>
              <p className="section-desc youtube-slot-section-description">
                設定各連線槽位的每日 API Quota 額度與自動容錯切換門檻。
              </p>
            </div>
          )}
          <div className="responsive-grid youtube-slot-grid">
            {SLOT_ORDER.map((slot) => {
              const record = slotRecords[slot];
              const draft = slotDrafts[slot];
              const isActive = routingMode === YOUTUBE_ROUTING_MODES.MANUAL && activeSlot === slot;
              const isPrimaryPreferred = routingMode === YOUTUBE_ROUTING_MODES.AUTO_PRIMARY && slot === 'primary';
              const busy = busyAction?.slot === slot;
              return (
                <YouTubeSlotCard
                  key={slot}
                  slot={slot}
                  record={record}
                  draft={draft}
                  isActive={isActive}
                  isPrimaryPreferred={isPrimaryPreferred}
                  busy={busy}
                  editingSlot={editingSlot}
                  handleOpenEditSlot={handleOpenEditSlot}
                  handleUseSystemOAuthForPrimary={handleUseSystemOAuthForPrimary}
                  slotEnabled={slotEnabled}
                  setSlotEnabled={setSlotEnabled}
                  slotLabel={slotLabel}
                  setSlotLabel={setSlotLabel}
                  slotClientId={slotClientId}
                  setSlotClientId={setSlotClientId}
                  slotClientSecret={slotClientSecret}
                  setSlotClientSecret={setSlotClientSecret}
                  showSlotSecret={showSlotSecret}
                  setShowSlotSecret={setShowSlotSecret}
                  isSlotCredsDirty={isSlotCredsDirty}
                  setEditingSlot={setEditingSlot}
                  handleSaveSlotCreds={handleSaveSlotCreds}
                  savingSlotCreds={savingSlotCreds}
                  showConnections={showConnections}
                  showQuota={showQuota}
                  updateDraft={updateDraft}
                  isQuotaDirty={isQuotaDirty}
                  startOAuth={startOAuth}
                  activateSlot={activateSlot}
                  requestDisconnect={requestDisconnect}
                  saveSlot={saveSlot}
                  pageBusy={pageBusy}
                  authorizationBusy={authorizationBusy}
                  routingMode={routingMode}
                />
              );
            })}
          </div>
        </div>
      )}

      {showPlaylist && (
        <YouTubePlaylistSection
          playlistId={playlistId}
          handlePlaylistChange={handlePlaylistChange}
          playlistAutosaveStatus={playlistAutosaveStatus}
          saveResources={saveResources}
          pageBusy={pageBusy}
          busyAction={busyAction}
        />
      )}

      {showWorkflowLinks && <YouTubeWorkflowLinks />}

      <ConfirmDialog
        open={Boolean(disconnectTarget)}
        title={`確認斷開 ${disconnectRecord?.label || 'YouTube'} 授權`}
        message={disconnectMessage}
        confirmText="確認斷開"
        cancelText="取消"
        variant="destructive"
        onConfirm={disconnectSlot}
        onCancel={() => {
          if (!busyAction) setDisconnectTarget(null);
        }}
      />
    </div>
  );
}
