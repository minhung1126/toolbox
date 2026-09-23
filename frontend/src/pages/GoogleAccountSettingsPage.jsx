import React from 'react';
import {
  CheckCircle2,
  Disc3,
  ExternalLink,
  FileSpreadsheet,
  Key,
  ListVideo,
  RefreshCw,
  Settings,
  Shield,
  XCircle,
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../services/api';
import { useToast } from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import ServiceAuthCard from '../components/ServiceAuthCard';
import { useOAuthConnect } from '../hooks/useOAuthConnect';
import { saveOAuthReturnPath } from '../utils/authReturnPath';
import { PATHS } from '../routes/paths';
import { formatTokenDate, tokenStatusLabel } from '../utils/formatters';
import { youtubeIsConnected, youtubePreferredUiSlot } from '../utils/youtubeRouting';

const GITHUB_DOCS = {
  google: 'https://github.com/minhung1126/toolbox/blob/main/docs/GOOGLE_API_SETUP.md',
  deployment: 'https://github.com/minhung1126/toolbox/blob/main/docs/DEPLOYMENT.md',
};

export default function GoogleAccountSettingsPage({ authUser, sysSettings = {}, refreshAuthUser }) {
  const toast = useToast();
  const location = useLocation();

  const sheetsOAuth = useOAuthConnect({
    serviceName: 'sheets',
    getAuthUrl: api.getSheetsAuthUrl,
    disconnect: api.disconnectSheets,
    onAfterDisconnect: refreshAuthUser,
    serviceLabel: 'Google 試算表授權',
    successMessage: '已解除 Google 試算表授權',
  });

  const ytmusicOAuth = useOAuthConnect({
    serviceName: 'ytmusic',
    getAuthUrl: api.getYtmusicAuthUrl,
    disconnect: api.disconnectYtmusic,
    onAfterDisconnect: refreshAuthUser,
    serviceLabel: 'YouTube Music 授權',
    successMessage: '已解除 YouTube Music 授權',
  });

  const handleStartLoginOAuth = async () => {
    try {
      saveOAuthReturnPath('google', `${location.pathname}${location.search}`);
      const result = await api.getAuthUrl();
      if (result.auth_url) window.location.href = result.auth_url;
    } catch (error) {
      toast.error(`取得控制台登入授權網址失敗：${error.message}`);
    }
  };

  const sheetsAuth = authUser?.authorizations?.sheets;
  const isSheetsConnected = Boolean(sheetsAuth?.connected || authUser?.google_scopes?.sheets_readonly);
  const ytmusicAuth = authUser?.authorizations?.ytmusic;
  const isYtmusicConnected = Boolean(ytmusicAuth?.connected);
  const isYoutubeConnected = youtubeIsConnected(authUser?.youtube);
  const preferredSlot = youtubePreferredUiSlot(authUser?.youtube);
  const activeYoutubeSlot = authUser?.youtube?.slots?.[preferredSlot] || {};
  const activeYoutubeChannelTitle = activeYoutubeSlot.channel_title;
  const activeYoutubeEmail = activeYoutubeSlot.user?.email;

  return (
    <div className="settings-page-section">
      <div className="info-banner">
        <span>需要申請 API 或部署？</span>
        <a href={GITHUB_DOCS.google} target="_blank" rel="noreferrer">
          Google API 教學 <ExternalLink size={14} />
        </a>
        <a href={GITHUB_DOCS.deployment} target="_blank" rel="noreferrer">
          部署教學 <ExternalLink size={14} />
        </a>
      </div>

      {/* 1. 控制台登入帳號 */}
      <div className="glass-panel card-padding settings-card card-stack">
        <div className="card-header">
          <div className="card-header-title">
            <Key size={20} color="var(--primary)" />
            <h2>控制台登入帳號</h2>
          </div>
          {authUser ? (
            <span className="badge badge-connected">
              <CheckCircle2 size={14} /> 已登入：{authUser.email}
            </span>
          ) : (
            <span className="badge badge-disconnected">
              <XCircle size={14} /> 未登入 Google 帳號
            </span>
          )}
        </div>
        <div className="info-banner">
          <span>
            控制台登入採用獨立的 Google OIDC 認證，僅用於身分識別與個人偏好儲存。Google 試算表與 YouTube
            權限均為模組化獨立授權。
          </span>
        </div>
        <div className="info-banner">
          <span>
            Google Client ID 與 Client Secret 由伺服器端 <code>.env</code> 管理。
            {sysSettings.google_client_configured ? ' ✅ Credentials 已設定。' : ' ⚠️ Credentials 尚未設定。'}
          </span>
        </div>
        {authUser && (
          <div className="settings-grid">
            <div className="glass-panel settings-info-card">
              <strong>Token 狀態</strong>
              <p>{tokenStatusLabel(authUser.token_status)}</p>
            </div>
            <div className="glass-panel settings-info-card">
              <strong>最近更新</strong>
              <p>{formatTokenDate(authUser.last_refreshed_at)}</p>
            </div>
            <div className="glass-panel settings-info-card">
              <strong>目前到期時間</strong>
              <p>{formatTokenDate(authUser.token_expires_at)}</p>
            </div>
          </div>
        )}
        {authUser?.last_refresh_error && (
          <div className="info-banner">
            <XCircle size={16} />
            <span>控制台登入 Token 最近更新未成功；請重新連結控制台 Google 帳號。</span>
          </div>
        )}
        <p className="section-desc">
          控制台 Google Access Token 會在到期前 5 分鐘由後端自動更新，Refresh Token 以加密方式保存於 <code>/data</code>
          ，不放在瀏覽器 Cookie 中。
        </p>
        {sysSettings.redirect_uri && (
          <div className="settings-code-block">
            <p>
              <strong>Google Authorized Redirect URI：</strong>
            </p>
            <code>{sysSettings.redirect_uri}</code>
          </div>
        )}
        <div className="page-actions settings-card-actions">
          <button className="btn btn-primary" onClick={handleStartLoginOAuth} type="button">
            <RefreshCw size={16} /> 重新連結控制台 Google 帳號
          </button>
        </div>
      </div>

      {/* Group 2: 已連線第三方服務授權 */}
      <div style={{ margin: '1.75rem 0 0.75rem 0' }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 0.25rem 0' }}>
          第三方服務授權矩陣
        </h3>
        <p className="section-desc" style={{ margin: 0, fontSize: '0.85rem' }}>
          控制台採用解耦授權設計，各服務權限依需獨立授權，並提供詳細專屬設定頁面。
        </p>
      </div>

      {/* 2. Google 試算表授權 */}
      <ServiceAuthCard
        icon={FileSpreadsheet}
        title="Google 試算表授權"
        connected={isSheetsConnected}
        connectedBadgeText="已授權試算表"
        disconnectedBadgeText="尚未授權試算表"
        description="用於唯讀存取工作表資料，支援批次資訊更新、影片發布檢查與試算表結構複製等功能。詳細偏好與預設試算表請至 Sheet 設定。"
        accountEmail={sheetsAuth?.user?.email}
        warningText="尚未連結 Google 試算表。請完成授權以啟用試算表讀取與批次工作流功能。"
        connecting={sheetsOAuth.connecting}
        onConnect={sheetsOAuth.handleConnect}
        onDisconnect={() => sheetsOAuth.setConfirmDisconnect(true)}
        connectText="連結 Google 試算表"
        reconnectText="重新授權 Google 試算表"
        disconnectText="解除試算表授權"
      />
      <div style={{ margin: '-0.75rem 0 1rem 0', display: 'flex', justifyContent: 'flex-end' }}>
        <Link className="btn btn-secondary btn-sm" to={PATHS.sheetSettings}>
          <FileSpreadsheet size={14} /> 前往 Sheet 模組設定
        </Link>
      </div>

      {/* 3. YouTube Music 帳號授權 */}
      <ServiceAuthCard
        icon={Disc3}
        title="YouTube Music 帳號授權"
        connected={isYtmusicConnected}
        connectedBadgeText="已授權 YouTube Music"
        disconnectedBadgeText="尚未授權 YouTube Music"
        description="用於存取個人 YouTube Music 播放清單與歌曲，獨立於 YouTube 創作者頻道。支援播放清單智慧多重排序與即時雙欄預覽比對。"
        accountEmail={ytmusicAuth?.user?.email}
        warningText="尚未連結 YouTube Music 專屬帳號。若未另外連結，系統將自動沿用主要 YouTube 頻道授權（若有）。建議授權您個人日常聆聽音樂的 Google 帳號。"
        connecting={ytmusicOAuth.connecting}
        onConnect={ytmusicOAuth.handleConnect}
        onDisconnect={() => ytmusicOAuth.setConfirmDisconnect(true)}
        connectText="連結 YouTube Music 帳號"
        reconnectText="重新授權 YouTube Music"
        disconnectText="解除 YouTube Music 授權"
      />
      <div
        style={{
          margin: '-0.75rem 0 1rem 0',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '0.5rem',
          flexWrap: 'wrap',
        }}
      >
        <Link className="btn btn-secondary btn-sm" to={PATHS.ytmusicSettings}>
          <Settings size={14} /> YouTube Music 專屬設定
        </Link>
        <Link className="btn btn-secondary btn-sm" to={PATHS.ytmusicPlaylistSort}>
          <Disc3 size={14} /> 前往 YouTube Music 播放清單排序
        </Link>
      </div>

      {/* 4. YouTube 頻道授權 */}
      <div className="glass-panel card-padding settings-card card-stack">
        <div className="card-header">
          <div className="card-header-title">
            <ListVideo size={20} color="var(--primary)" />
            <h2>YouTube 頻道授權</h2>
          </div>
          {isYoutubeConnected ? (
            <span className="badge badge-connected">
              <CheckCircle2 size={14} /> 已授權：{activeYoutubeChannelTitle || '主要頻道'}
            </span>
          ) : (
            <span className="badge badge-disconnected">
              <XCircle size={14} /> 尚未授權頻道
            </span>
          )}
        </div>
        <p className="section-desc">
          YouTube Data API 授權獨立管理，支援主要 (Primary) 與次要 (Secondary) 雙槽位配額切換、自動容錯分流與 Quota
          安全防護。請至專屬頁面管理各 Slot 頻道授權與連線憑證。
        </p>
        {activeYoutubeEmail && (
          <div className="settings-grid" style={{ marginBottom: '0.5rem' }}>
            <div className="glass-panel settings-info-card">
              <strong>連線帳號</strong>
              <p>{activeYoutubeEmail}</p>
            </div>
          </div>
        )}
        <div className="page-actions settings-card-actions">
          <Link className="btn btn-secondary" to={PATHS.youtubeConnections}>
            <ListVideo size={16} /> 前往 YouTube 頻道授權設定
          </Link>
        </div>
      </div>

      {/* Group 3: 系統安全與維運 */}
      <div style={{ margin: '1.75rem 0 0.75rem 0' }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 0.25rem 0' }}>
          全站系統安全與維運
        </h3>
        <p className="section-desc" style={{ margin: 0, fontSize: '0.85rem' }}>
          平台管理者安全配置、全域 OAuth Client 憑證與存取權限控制。
        </p>
      </div>

      {/* 5. 系統安全與白名單 */}
      <div className="glass-panel card-padding settings-card card-stack">
        <div className="card-header">
          <div className="card-header-title">
            <Shield size={20} color="#10b981" />
            <h2>系統設定與安全</h2>
          </div>
        </div>
        <p className="section-desc">管理系統安全密鑰狀態、Google OAuth Client 憑證保險庫與控制台存取控制白名單。</p>
        <div className="page-actions settings-card-actions">
          <Link className="btn btn-secondary" to={PATHS.systemSettings}>
            <Shield size={16} /> 前往系統設定
          </Link>
        </div>
      </div>

      <ConfirmDialog
        open={sheetsOAuth.confirmDisconnect}
        title="解除 Google 試算表授權"
        message="確定要解除 Google 試算表授權嗎？解除後各項功能將無法讀取試算表內容，直到重新授權為止。"
        confirmText="確認解除"
        cancelText="取消"
        variant="destructive"
        onConfirm={sheetsOAuth.handleConfirmDisconnect}
        onCancel={() => sheetsOAuth.setConfirmDisconnect(false)}
      />

      <ConfirmDialog
        open={ytmusicOAuth.confirmDisconnect}
        title="解除 YouTube Music 授權"
        message="確定要解除 YouTube Music 授權嗎？解除後播放清單排序將無法讀取或更新您的 YouTube Music 播放清單，直到重新授權為止。"
        confirmText="確認解除"
        cancelText="取消"
        variant="destructive"
        onConfirm={ytmusicOAuth.handleConfirmDisconnect}
        onCancel={() => ytmusicOAuth.setConfirmDisconnect(false)}
      />
    </div>
  );
}
