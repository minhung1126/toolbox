import { useYtmusicSettingsController } from '../features/ytmusic/hooks/useYtmusicSettingsController';
import YtmusicPreferences from '../features/ytmusic/components/YtmusicPreferences';
import YtmusicTokenSettings from '../features/ytmusic/components/YtmusicTokenSettings';

import React from 'react';
import '../features/ytmusic/ytmusic-settings.css';
import { ArrowRight, ArrowUpDown, Disc3, ListMusic, RefreshCw, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

import ConfirmDialog from '../components/ConfirmDialog';
import ServiceAuthCard from '../components/ServiceAuthCard';

import { PATHS } from '../routes/paths';
import { formatTokenDate, tokenStatusLabel } from '../utils/formatters';

import { REGION_PRESETS, PRESET_OPTIONS } from '../features/ytmusic/model/preferences';
export { REGION_PRESETS };

export default function YtmusicSettingsPage({ authUser, refreshAuthUser }) {
  const {
    isYtmusicConnected,
    hasCustomToken,
    activeYoutubeConnected,
    ytmusicAuth,
    ytmusicOAuth,
    tokenMutationUncertain,
    tokenValidationResult,
    validatingToken,
    savingToken,
    showTokenUpdateForm,
    customTokenInput,
    handleSaveCustomToken,
    setTokenValidationResult,
    handleValidateCustomToken,
    setShowTokenUpdateForm,
    setShowClearTokenConfirm,
    setCustomTokenInput,
    selectedRegion,
    handleRegionChange,
    customLanguage,
    customLocation,
    selectedPreset,
    handlePresetChange,
    savingPrefs,
    setCustomLanguage,
    setCustomLocation,
    handleSavePreferences,
    showClearTokenConfirm,
    handleClearCustomToken,
  } = useYtmusicSettingsController({ authUser, refreshAuthUser });
  return (
    <div className="section-gap settings-page-section">
      <header className="page-header">
        <div className="badge badge-info dashboard-eyebrow">
          <Sparkles size={14} /> YouTube Music
        </div>
        <h1 className="ytmusic-settings-page-title">
          <Disc3 size={28} className="ytmusic-settings-title-icon" /> YouTube Music 設定
        </h1>
        <p className="section-desc">管理 YouTube Music 專屬帳號授權、瀏覽器 Token 憑證與播放清單多重排序預設偏好。</p>
      </header>

      {/* 1. YouTube Music Authorization Status Card */}
      <ServiceAuthCard
        icon={Disc3}
        title="YouTube Music 帳號授權狀態"
        connected={isYtmusicConnected}
        connectedBadgeText={hasCustomToken ? '自訂 Token 連線中' : '專屬帳號已授權'}
        disconnectedBadgeText={activeYoutubeConnected ? '共用 YouTube 授權中' : '尚未授權'}
        description="存取個人 YouTube Music 播放清單與音樂庫，完全獨立於 YouTube 創作者品牌頻道。更新操作採用 YouTube Music 協定，不消耗 YouTube Data API 配額（0 Credit）。"
        accountEmail={
          ytmusicAuth?.user?.email ||
          (hasCustomToken
            ? '已設定自訂瀏覽器 Token'
            : activeYoutubeConnected
              ? `${authUser?.youtube?.slots?.primary?.channel_title}（共用頻道）`
              : undefined)
        }
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
      <YtmusicTokenSettings
        hasCustomToken={hasCustomToken}
        tokenMutationUncertain={tokenMutationUncertain}
        tokenValidationResult={tokenValidationResult}
        validatingToken={validatingToken}
        savingToken={savingToken}
        showTokenUpdateForm={showTokenUpdateForm}
        customTokenInput={customTokenInput}
        handleSaveCustomToken={handleSaveCustomToken}
        setTokenValidationResult={setTokenValidationResult}
        handleValidateCustomToken={handleValidateCustomToken}
        setShowTokenUpdateForm={setShowTokenUpdateForm}
        setShowClearTokenConfirm={setShowClearTokenConfirm}
        setCustomTokenInput={setCustomTokenInput}
      />

      {/* 3. Token Status Grid if connected via OAuth */}
      {isYtmusicConnected && ytmusicAuth && !hasCustomToken && (
        <div className="glass-panel card-padding settings-card">
          <h3 className="ytmusic-settings-section-title">
            <RefreshCw size={16} className="ytmusic-settings-section-icon" aria-hidden="true" /> 憑證健康狀態
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
            <div className="info-banner ytmusic-token-refresh-warning">
              <span>Token 最近更新未成功；請點擊上方「重新授權」以更新憑證。</span>
            </div>
          )}
        </div>
      )}

      {/* 4. YouTube Music Default Preferences */}
      <YtmusicPreferences
        selectedRegion={selectedRegion}
        handleRegionChange={handleRegionChange}
        REGION_PRESETS={REGION_PRESETS}
        customLanguage={customLanguage}
        customLocation={customLocation}
        selectedPreset={selectedPreset}
        handlePresetChange={handlePresetChange}
        PRESET_OPTIONS={PRESET_OPTIONS}
        savingPrefs={savingPrefs}
        setCustomLanguage={setCustomLanguage}
        setCustomLocation={setCustomLocation}
        handleSavePreferences={handleSavePreferences}
      />

      {/* 5. Quick Navigation Card */}
      <div className="glass-panel card-padding settings-card ytmusic-quick-nav">
        <div>
          <h3 className="ytmusic-quick-nav-title">
            <ListMusic size={18} className="ytmusic-quick-nav-icon" /> 播放清單智慧排序
          </h3>
          <p className="section-desc ytmusic-quick-nav-description">
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
