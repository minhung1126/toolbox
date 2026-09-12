import React from 'react';
import { CheckCircle2, ExternalLink, FileSpreadsheet, HardDrive, Key, ListVideo, RefreshCw, XCircle } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../services/api';
import { useToast } from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import ServiceAuthCard from '../components/ServiceAuthCard';
import { useOAuthConnect } from '../hooks/useOAuthConnect';
import { saveOAuthReturnPath } from '../utils/authReturnPath';
import { PATHS } from '../routes/paths';
import { formatTokenDate, tokenStatusLabel } from '../utils/formatters';

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

  const driveOAuth = useOAuthConnect({
    serviceName: 'drive',
    getAuthUrl: api.getDriveAuthUrl,
    disconnect: api.disconnectDrive,
    onAfterDisconnect: refreshAuthUser,
    serviceLabel: 'Google 雲端硬碟授權',
    successMessage: '已解除 Google 雲端硬碟授權',
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
  const driveAuth = authUser?.authorizations?.drive;
  const isDriveConnected = Boolean(
    driveAuth?.connected
      || (authUser?.google_scopes?.drive_readonly && !authUser?.google_scopes?.drive_reauthorization_required)
  );

  return (
    <div className="settings-page-section">
      <div className="info-banner">
        <span>需要申請 API 或部署？</span>
        <a href={GITHUB_DOCS.google} target="_blank" rel="noreferrer">Google API 教學 <ExternalLink size={14} /></a>
        <a href={GITHUB_DOCS.deployment} target="_blank" rel="noreferrer">部署教學 <ExternalLink size={14} /></a>
      </div>

      {/* 1. 控制台登入帳號 */}
      <div className="glass-panel card-padding settings-card card-stack">
        <div className="card-header">
          <div className="card-header-title"><Key size={20} color="var(--primary)" /><h2>控制台登入帳號</h2></div>
          {authUser ? <span className="badge badge-connected"><CheckCircle2 size={14} /> 已登入：{authUser.email}</span> : <span className="badge badge-disconnected"><XCircle size={14} /> 未登入 Google 帳號</span>}
        </div>
        <div className="info-banner"><span>控制台登入採用獨立的 Google OIDC 認證，僅用於身分識別與個人偏好儲存。Google 試算表、雲端硬碟與 YouTube 權限均為模組化獨立授權。</span></div>
        <div className="info-banner"><span>Google Client ID 與 Client Secret 由伺服器端 <code>.env</code> 管理。{sysSettings.google_client_configured ? ' ✅ Credentials 已設定。' : ' ⚠️ Credentials 尚未設定。'}</span></div>
        {authUser && <div className="settings-grid">
          <div className="glass-panel settings-info-card"><strong>Token 狀態</strong><p>{tokenStatusLabel(authUser.token_status)}</p></div>
          <div className="glass-panel settings-info-card"><strong>最近更新</strong><p>{formatTokenDate(authUser.last_refreshed_at)}</p></div>
          <div className="glass-panel settings-info-card"><strong>目前到期時間</strong><p>{formatTokenDate(authUser.token_expires_at)}</p></div>
        </div>}
        {authUser?.last_refresh_error && <div className="info-banner"><XCircle size={16} /><span>控制台登入 Token 最近更新未成功；請重新連結控制台 Google 帳號。</span></div>}
        <p className="section-desc">控制台 Google Access Token 會在到期前 5 分鐘由後端自動更新，Refresh Token 以加密方式保存於 <code>/data</code>，不放在瀏覽器 Cookie 中。</p>
        {sysSettings.redirect_uri && <div className="settings-code-block"><p><strong>Google Authorized Redirect URI：</strong></p><code>{sysSettings.redirect_uri}</code></div>}
        <div className="page-actions settings-card-actions"><button className="btn btn-primary" onClick={handleStartLoginOAuth} type="button"><RefreshCw size={16} /> 重新連結控制台 Google 帳號</button></div>
      </div>

      {/* 2. Google 試算表授權 */}
      <ServiceAuthCard
        icon={FileSpreadsheet}
        title="Google 試算表授權"
        connected={isSheetsConnected}
        connectedBadgeText="已授權試算表"
        disconnectedBadgeText="尚未授權試算表"
        description="用於唯讀存取工作表資料，支援批次資訊更新、影片發布檢查與試算表結構複製等功能。"
        accountEmail={sheetsAuth?.user?.email}
        warningText="尚未連結 Google 試算表。請完成授權以啟用試算表讀取與批次工作流功能。"
        connecting={sheetsOAuth.connecting}
        onConnect={sheetsOAuth.handleConnect}
        onDisconnect={() => sheetsOAuth.setConfirmDisconnect(true)}
        connectText="連結 Google 試算表"
        reconnectText="重新授權 Google 試算表"
        disconnectText="解除試算表授權"
      />

      {/* 3. Google 雲端硬碟授權 */}
      <ServiceAuthCard
        icon={HardDrive}
        title="Google 雲端硬碟授權"
        connected={isDriveConnected}
        connectedBadgeText="已授權雲端硬碟"
        disconnectedBadgeText="尚未授權雲端硬碟"
        description="用於唯讀存取 Google Drive 影片資料夾與檔案，供 YouTube 背景上傳工作讀取來源影片。"
        accountEmail={driveAuth?.user?.email}
        warningText="尚未連結 Google 雲端硬碟。請完成授權以啟用 Drive 來源解析與影片上傳。"
        connecting={driveOAuth.connecting}
        onConnect={driveOAuth.handleConnect}
        onDisconnect={() => driveOAuth.setConfirmDisconnect(true)}
        connectText="連結 Google 雲端硬碟"
        reconnectText="重新授權 Google 雲端硬碟"
        disconnectText="解除雲端硬碟授權"
      />

      {/* 4. YouTube 頻道授權 */}
      <div className="glass-panel card-padding settings-card card-stack">
        <div className="card-header">
          <div className="card-header-title"><ListVideo size={20} color="var(--primary)" /><h2>YouTube 頻道授權</h2></div>
        </div>
        <p className="section-desc">YouTube Data API 授權獨立管理，支援主要與次要配額 Slot 切換、自動分流與配額防護。請至專屬頁面管理各 Slot 頻道授權。</p>
        <div className="page-actions settings-card-actions">
          <Link className="btn btn-secondary" to={PATHS.youtubeConnections}>
            <ListVideo size={16} /> 前往 YouTube 頻道授權設定
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
        open={driveOAuth.confirmDisconnect}
        title="解除 Google 雲端硬碟授權"
        message="確定要解除 Google 雲端硬碟授權嗎？解除後將無法解析 Drive 資料夾或上傳影片，直到重新授權為止。"
        confirmText="確認解除"
        cancelText="取消"
        variant="destructive"
        onConfirm={driveOAuth.handleConfirmDisconnect}
        onCancel={() => driveOAuth.setConfirmDisconnect(false)}
      />
    </div>
  );
}
