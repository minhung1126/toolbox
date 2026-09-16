import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  ArrowUpDown,
  CheckCircle2,
  Disc3,
  ListMusic,
  RefreshCw,
  Sliders,
  Sparkles,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import ConfirmDialog from '../components/ConfirmDialog';
import ServiceAuthCard from '../components/ServiceAuthCard';
import { useOAuthConnect } from '../hooks/useOAuthConnect';
import useAccountWorkState from '../hooks/useAccountWorkState';
import { PATHS } from '../routes/paths';
import { formatTokenDate, tokenStatusLabel } from '../utils/formatters';

const PRESET_OPTIONS = [
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
  const ytmusicAuth = authUser?.authorizations?.ytmusic;
  const isYtmusicConnected = Boolean(ytmusicAuth?.connected);
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
          管理專屬 YouTube Music 帳號授權、個人音樂庫連線狀態與播放清單排序預設偏好。
        </p>
      </header>

      {/* 1. YouTube Music Authorization Status Card */}
      <ServiceAuthCard
        icon={Disc3}
        title="YouTube Music 帳號授權狀態"
        connected={isYtmusicConnected}
        connectedBadgeText="專屬帳號已授權"
        disconnectedBadgeText={activeYoutubeConnected ? '共用 YouTube 授權中' : '尚未授權'}
        description="用於存取個人 YouTube Music 播放清單與音樂庫，完全獨立於 YouTube 創作者品牌頻道。兩者可連結不同 Google 帳號。"
        accountEmail={ytmusicAuth?.user?.email || (activeYoutubeConnected ? `${authUser?.youtube?.slots?.primary?.channel_title}（共用頻道）` : undefined)}
        accountEmailPrefix={isYtmusicConnected ? '專屬音樂帳號：' : '目前共用來源：'}
        warningText={
          activeYoutubeConnected
            ? '目前沿用主要 YouTube 頻道授權。若要管理個人日常生活聆聽的 YouTube Music 專屬歌單，建議點擊下方連結個人音樂 Google 帳號。'
            : '尚未連結 YouTube 或 YouTube Music 帳號。請先完成授權以使用播放清單排序與音樂庫功能。'
        }
        connecting={ytmusicOAuth.connecting}
        onConnect={ytmusicOAuth.handleConnect}
        onDisconnect={() => ytmusicOAuth.setConfirmDisconnect(true)}
        connectText="連結 YouTube Music 專屬帳號"
        reconnectText="重新授權 YouTube Music"
        disconnectText="解除專屬授權"
      />

      {/* 2. Token Status Grid if connected */}
      {isYtmusicConnected && ytmusicAuth && (
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

      {/* 3. YouTube Music Default Preferences */}
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
            style={{ maxWidth: 360 }}
          >
            {PRESET_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 4. Quick Navigation Card */}
      <div className="glass-panel card-padding settings-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h3 style={{ margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
            <ListMusic size={18} color="var(--primary)" /> 播放清單智慧排序
          </h3>
          <p className="section-desc" style={{ margin: 0 }}>
            讀取您的 YouTube Music 播放清單，以自訂排序規則即時雙欄對照並一鍵寫入套用。
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
    </div>
  );
}
