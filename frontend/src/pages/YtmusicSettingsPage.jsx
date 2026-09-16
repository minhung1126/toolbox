import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  ArrowUpDown,
  CheckCircle2,
  Disc3,
  Key,
  ListMusic,
  Loader2,
  RefreshCw,
  Sliders,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { useToast } from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import ServiceAuthCard from '../components/ServiceAuthCard';
import { useOAuthConnect } from '../hooks/useOAuthConnect';
import useAccountWorkState from '../hooks/useAccountWorkState';
import { PATHS } from '../routes/paths';
import { formatTokenDate, tokenStatusLabel } from '../utils/formatters';

const PRESET_OPTIONS = [
  { value: 'album-order', label: '經典完整專輯（藝人 → 年份 → 專輯 → 曲目 #）' },
  { value: 'artist-album-track', label: '藝人專輯曲目（藝人 → 專輯 → 曲目 #）' },
  { value: 'title-asc', label: '歌名 A → Z' },
  { value: 'title-desc', label: '歌名 Z → A' },
  { value: 'artist-asc', label: '頻道／藝人 A → Z' },
  { value: 'artist-desc', label: '頻道／藝人 Z → A' },
  { value: 'added-newest', label: '新增日期（新 → 舊）' },
  { value: 'added-oldest', label: '新增日期（舊 → 新）' },
  { value: 'published-newest', label: '發布日期（新 → 舊）' },
  { value: 'published-oldest', label: '發布日期（舊 → 新）' },
  { value: 'duration-shortest', label: '長度（短 → 長）' },
  { value: 'duration-longest', label: '長度（長 → 短）' },
  { value: 'random', label: '隨機排序' },
];

export default function YtmusicSettingsPage({ authUser, refreshAuthUser }) {
  const toast = useToast();
  const ytmusicAuth = authUser?.authorizations?.ytmusic;
  const isYtmusicConnected = Boolean(ytmusicAuth?.connected);
  const hasCustomToken = Boolean(ytmusicAuth?.has_custom_token);
  const activeYoutubeConnected = Boolean(authUser?.youtube?.slots?.primary?.authenticated);

  const ytmusicOAuth = useOAuthConnect({
    serviceName: 'ytmusic',
    getAuthUrl: api.getYtmusicAuthUrl,
    disconnect: api.disconnectYtmusic,
    onAfterDisconnect: refreshAuthUser,
    serviceLabel: 'YouTube Music 授權',
    successMessage: '已解除 YouTube Music 授權',
  });

  const { value: preferences, save: savePreferences } = useAccountWorkState(
    'ytmusic_preferences',
    { defaultPreset: 'title-asc' }
  );

  const [selectedPreset, setSelectedPreset] = useState(preferences?.defaultPreset || 'title-asc');
  const [customTokenInput, setCustomTokenInput] = useState('');
  const [savingToken, setSavingToken] = useState(false);
  const [showClearTokenConfirm, setShowClearTokenConfirm] = useState(false);

  useEffect(() => {
    if (preferences?.defaultPreset) {
      setSelectedPreset(preferences.defaultPreset);
    }
  }, [preferences?.defaultPreset]);

  const handlePresetChange = (e) => {
    const nextPreset = e.target.value;
    setSelectedPreset(nextPreset);
    savePreferences({ ...preferences, defaultPreset: nextPreset });
  };

  const handleSaveCustomToken = async () => {
    const trimmed = customTokenInput.trim();
    if (!trimmed) {
      toast.warning('請輸入 Cookie 或 Request Headers 內容');
      return;
    }
    setSavingToken(true);
    try {
      await api.saveYtmusicCustomToken(trimmed);
      toast.success('YouTube Music 自訂 Token 已成功儲存！');
      setCustomTokenInput('');
      await refreshAuthUser?.();
    } catch (err) {
      toast.error(`儲存 Token 失敗：${err.message || '格式不正確'}`);
    } finally {
      setSavingToken(false);
    }
  };

  const handleClearCustomToken = async () => {
    setShowClearTokenConfirm(false);
    setSavingToken(true);
    try {
      await api.clearYtmusicCustomToken();
      toast.success('已清除 YouTube Music 自訂 Token');
      await refreshAuthUser?.();
    } catch (err) {
      toast.error(`清除 Token 失敗：${err.message || '未知錯誤'}`);
    } finally {
      setSavingToken(false);
    }
  };

  return (
    <div className="section-gap settings-page-section">
      <header className="page-header">
        <div className="badge badge-info dashboard-eyebrow">
          <Sparkles size={14} /> YouTube Music
        </div>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', margin: '0 0 0.5rem 0' }}>
          <Disc3 size={28} color="var(--primary)" /> YouTube Music 設定
        </h1>
        <p className="section-desc">
          管理 YouTube Music 專屬帳號授權、瀏覽器 Token 憑證與播放清單多重排序預設偏好。
        </p>
      </header>

      {/* 1. YouTube Music Authorization Status Card */}
      <ServiceAuthCard
        icon={Disc3}
        title="YouTube Music 帳號授權狀態"
        connected={isYtmusicConnected}
        connectedBadgeText={hasCustomToken ? '自訂 Token 連線中' : '專屬帳號已授權'}
        disconnectedBadgeText={activeYoutubeConnected ? '共用 YouTube 授權中' : '尚未授權'}
        description="存取個人 YouTube Music 播放清單與音樂庫，完全獨立於 YouTube 創作者品牌頻道。更新操作採用 YouTube Music 協定，不消耗 YouTube Data API 配額（0 Credit）。"
        accountEmail={ytmusicAuth?.user?.email || (hasCustomToken ? '已設定自訂瀏覽器 Token' : activeYoutubeConnected ? `${authUser?.youtube?.slots?.primary?.channel_title}（共用頻道）` : undefined)}
        accountEmailPrefix={isYtmusicConnected ? (hasCustomToken ? '憑證模式：' : '專屬音樂帳號：') : '目前共用來源：'}
        warningText={
          activeYoutubeConnected && !hasCustomToken
            ? '目前沿用主要 YouTube 頻道授權。若要管理個人日常生活聆聽的 YouTube Music 專屬歌單，建議點擊下方連結個人音樂 Google 帳號或填入瀏覽器 Token。'
            : !isYtmusicConnected
            ? '尚未連結 YouTube 或 YouTube Music 帳號。請先完成授權以使用播放清單排序與音樂庫功能。'
            : undefined
        }
        connecting={ytmusicOAuth.connecting}
        onConnect={ytmusicOAuth.handleConnect}
        onDisconnect={() => ytmusicOAuth.setConfirmDisconnect(true)}
        connectText="連結 YouTube Music 專屬帳號"
        reconnectText="重新授權 YouTube Music"
        disconnectText="解除專屬授權"
      />

      {/* 2. Custom Browser Token / Cookie Setup Card */}
      <div className="glass-panel card-padding settings-card card-stack">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h2 className="settings-heading" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 4px 0' }}>
              <Key size={20} color="var(--primary)" /> 自訂 YouTube Music 瀏覽器 Token／Cookie
            </h2>
            <p className="section-desc" style={{ margin: 0 }}>
              支援直接貼上來自 music.youtube.com 的 Cookie 或 Network Headers。使用 Token 排序可直接讀取專輯、曲目序號且 <strong>消耗 0 Google API 配額</strong>。
            </p>
          </div>
          {hasCustomToken && (
            <span className="badge badge-connected">
              <CheckCircle2 size={12} /> 自訂 Token 已啟用 (0 Quota 模式)
            </span>
          )}
        </div>

        {hasCustomToken ? (
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, background: 'rgba(255,255,255,0.03)', padding: '12px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)' }}>
            <div>
              <strong>已啟用自訂瀏覽器 Token</strong>
              <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)' }}>
                系統將優先使用此 Token 進行 YouTube Music 播放清單與曲目操作。
              </p>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ color: 'var(--color-danger, #ef4444)', display: 'flex', alignItems: 'center', gap: 4 }}
              onClick={() => setShowClearTokenConfirm(true)}
              disabled={savingToken}
            >
              <Trash2 size={14} /> 清除自訂 Token
            </button>
          </div>
        ) : (
          <div style={{ marginTop: 12 }}>
            <div className="form-group">
              <label className="form-label" htmlFor="ytmusic-custom-token-input">
                貼上 Cookie 或 Request Headers（選填）
              </label>
              <textarea
                id="ytmusic-custom-token-input"
                className="form-input"
                rows={3}
                placeholder="貼上瀏覽器開發者工具中的 Cookie: SID=... 或完整的 Request Headers..."
                value={customTokenInput}
                onChange={(e) => setCustomTokenInput(e.target.value)}
                style={{ fontFamily: 'monospace', fontSize: '0.85rem', width: '100%' }}
                disabled={savingToken}
              />
              <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.45)', display: 'block', marginTop: 4 }}>
                提示：可在瀏覽器開啟 music.youtube.com ➔ 開發者工具 (F12) ➔ Network (網路) ➔ 複製任一請求的 Cookie 或 Request Headers 貼於此處。
              </span>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleSaveCustomToken}
              disabled={savingToken || !customTokenInput.trim()}
              style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}
            >
              {savingToken ? <Loader2 size={14} className="spin" /> : <Key size={14} />}
              儲存自訂 Token
            </button>
          </div>
        )}
      </div>

      {/* 3. Token Status Grid if connected via OAuth */}
      {isYtmusicConnected && ytmusicAuth && !hasCustomToken && (
        <div className="glass-panel card-padding settings-card">
          <h3 style={{ margin: '0 0 12px 0', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <RefreshCw size={16} color="var(--primary)" /> 憑證健康狀態
          </h3>
          <div className="settings-grid">
            <div className="glass-panel settings-info-card">
              <strong>Token 狀態</strong>
              <p>{tokenStatusLabel(ytmusicAuth.token_status)}</p>
            </div>
            <div className="glass-panel settings-info-card">
              <strong>最近重新整理</strong>
              <p>{formatTokenDate(ytmusicAuth.last_refreshed_at)}</p>
            </div>
            <div className="glass-panel settings-info-card">
              <strong>目前 Token 到期時間</strong>
              <p>{formatTokenDate(ytmusicAuth.token_expires_at)}</p>
            </div>
          </div>
          {ytmusicAuth.last_refresh_error && (
            <div className="info-banner" style={{ marginTop: 12 }}>
              <span>Token 最近更新未成功；請點擊上方「重新授權」以更新憑證。</span>
            </div>
          )}
        </div>
      )}

      {/* 4. YouTube Music Default Preferences */}
      <div className="glass-panel card-padding settings-card card-stack">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h2 className="settings-heading" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 4px 0' }}>
              <Sliders size={20} color="var(--accent)" /> 播放清單排序預設偏好
            </h2>
            <p className="section-desc" style={{ margin: 0 }}>
              設定進入播放清單排序頁面時的預設排序規則，修改後將自動保存於個人偏好。
            </p>
          </div>
          <span className="badge badge-connected">
            <CheckCircle2 size={12} /> 自動儲存
          </span>
        </div>

        <div className="form-group" style={{ marginTop: 12 }}>
          <label className="form-label" htmlFor="ytmusic-default-preset">
            預設排序規則
          </label>
          <select
            id="ytmusic-default-preset"
            className="form-select"
            value={selectedPreset}
            onChange={handlePresetChange}
            style={{ maxWidth: 440 }}
          >
            {PRESET_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 5. Quick Navigation Card */}
      <div className="glass-panel card-padding settings-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h3 style={{ margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
            <ListMusic size={18} color="var(--primary)" /> 播放清單智慧排序
          </h3>
          <p className="section-desc" style={{ margin: 0 }}>
            讀取您的 YouTube Music 播放清單，以藝人、專輯、曲目第幾首等多重規則排序，零配額消耗更新。
          </p>
        </div>
        <Link className="btn btn-primary" to={PATHS.ytmusicPlaylistSort}>
          <ArrowUpDown size={16} /> 進入播放清單排序 <ArrowRight size={16} />
        </Link>
      </div>

      <ConfirmDialog
        open={ytmusicOAuth.confirmDisconnect}
        title="解除 YouTube Music 授權"
        message="確定要解除 YouTube Music 專屬授權嗎？解除後各功能將無法讀取您的個人音樂歌單，直到重新授權為止。"
        confirmText="確認解除"
        cancelText="取消"
        variant="destructive"
        onConfirm={ytmusicOAuth.handleConfirmDisconnect}
        onCancel={() => ytmusicOAuth.setConfirmDisconnect(false)}
      />

      <ConfirmDialog
        open={showClearTokenConfirm}
        title="清除自訂 Token"
        message="確定要清除 YouTube Music 自訂 Token 嗎？清除後系統將回退使用 Google OAuth 授權連線。"
        confirmText="確認清除"
        cancelText="取消"
        variant="destructive"
        onConfirm={handleClearCustomToken}
        onCancel={() => setShowClearTokenConfirm(false)}
      />
    </div>
  );
}
