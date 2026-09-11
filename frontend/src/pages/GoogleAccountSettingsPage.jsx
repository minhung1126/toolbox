import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, ExternalLink, FileSpreadsheet, HardDrive, Key, ListVideo, RefreshCw, Unlink, XCircle } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../services/api';
import { useToast } from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import { saveOAuthReturnPath } from '../utils/authReturnPath';
import { PATHS } from '../routes/paths';

const GITHUB_DOCS = {
  google: 'https://github.com/minhung1126/creator-tools/blob/main/docs/GOOGLE_API_SETUP.md',
  deployment: 'https://github.com/minhung1126/creator-tools/blob/main/docs/DEPLOYMENT.md',
};

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

export default function GoogleAccountSettingsPage({ authUser, sysSettings = {}, refreshAuthUser }) {
  const toast = useToast();
  const location = useLocation();
  const [connectingSheets, setConnectingSheets] = useState(false);
  const [connectingDrive, setConnectingDrive] = useState(false);
  const [confirmDisconnectSheets, setConfirmDisconnectSheets] = useState(false);
  const [confirmDisconnectDrive, setConfirmDisconnectDrive] = useState(false);

  const handleStartLoginOAuth = async () => {
    try {
      saveOAuthReturnPath('google', `${location.pathname}${location.search}`);
      const result = await api.getAuthUrl();
      if (result.auth_url) window.location.href = result.auth_url;
    } catch (error) {
      toast.error(`取得控制台登入授權網址失敗：${error.message}`);
    }
  };

  const handleConnectSheets = async () => {
    setConnectingSheets(true);
    try {
      saveOAuthReturnPath('sheets', `${location.pathname}${location.search}`);
      const res = await api.getSheetsAuthUrl();
      if (res?.auth_url) {
        window.location.href = res.auth_url;
      } else {
        toast.error('無法取得 Google 試算表授權網址。');
        setConnectingSheets(false);
      }
    } catch (error) {
      toast.error(`取得 Google 試算表授權網址失敗：${error.message}`);
      setConnectingSheets(false);
    }
  };

  const handleConfirmDisconnectSheets = async () => {
    setConfirmDisconnectSheets(false);
    try {
      await api.disconnectSheets();
      await refreshAuthUser?.();
      toast.success('已解除 Google 試算表授權');
    } catch (error) {
      toast.error(`解除試算表授權失敗：${error.message}`);
    }
  };

  const handleConnectDrive = async () => {
    setConnectingDrive(true);
    try {
      saveOAuthReturnPath('drive', `${location.pathname}${location.search}`);
      const res = await api.getDriveAuthUrl();
      if (res?.auth_url) {
        window.location.href = res.auth_url;
      } else {
        toast.error('無法取得 Google 雲端硬碟授權網址。');
        setConnectingDrive(false);
      }
    } catch (error) {
      toast.error(`取得 Google 雲端硬碟授權網址失敗：${error.message}`);
      setConnectingDrive(false);
    }
  };

  const handleConfirmDisconnectDrive = async () => {
    setConfirmDisconnectDrive(false);
    try {
      await api.disconnectDrive();
      await refreshAuthUser?.();
      toast.success('已解除 Google 雲端硬碟授權');
    } catch (error) {
      toast.error(`解除雲端硬碟授權失敗：${error.message}`);
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
      <div className="glass-panel card-padding settings-card card-stack">
        <div className="card-header">
          <div className="card-header-title"><FileSpreadsheet size={20} color="var(--primary)" /><h2>Google 試算表授權</h2></div>
          {isSheetsConnected ? <span className="badge badge-connected"><CheckCircle2 size={14} /> 已授權試算表</span> : <span className="badge badge-disconnected"><XCircle size={14} /> 尚未授權試算表</span>}
        </div>
        <p className="section-desc">用於唯讀存取工作表資料，支援批次資訊更新、影片發布檢查與試算表結構複製等功能。{sheetsAuth?.user?.email && `（目前授權帳號：${sheetsAuth.user.email}）`}</p>
        {isSheetsConnected ? (
          <div className="page-actions settings-card-actions">
            <button className="btn btn-secondary" type="button" onClick={handleConnectSheets} disabled={connectingSheets}>
              <RefreshCw size={16} /> 重新授權 Google 試算表
            </button>
            <button className="btn btn-danger" type="button" onClick={() => setConfirmDisconnectSheets(true)}>
              <Unlink size={16} /> 解除試算表授權
            </button>
          </div>
        ) : (
          <div>
            <div className="info-banner warning-banner">
              <AlertCircle size={18} />
              <span>尚未連結 Google 試算表。請完成授權以啟用試算表讀取與批次工作流功能。</span>
            </div>
            <div className="page-actions settings-card-actions">
              <button className="btn btn-primary" type="button" onClick={handleConnectSheets} disabled={connectingSheets}>
                <Key size={16} /> 連結 Google 試算表
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 3. Google 雲端硬碟授權 */}
      <div className="glass-panel card-padding settings-card card-stack">
        <div className="card-header">
          <div className="card-header-title"><HardDrive size={20} color="var(--primary)" /><h2>Google 雲端硬碟授權</h2></div>
          {isDriveConnected ? <span className="badge badge-connected"><CheckCircle2 size={14} /> 已授權雲端硬碟</span> : <span className="badge badge-disconnected"><XCircle size={14} /> 尚未授權雲端硬碟</span>}
        </div>
        <p className="section-desc">用於唯讀存取 Google Drive 影片資料夾與檔案，供 YouTube 背景上傳工作讀取來源影片。{driveAuth?.user?.email && `（目前授權帳號：${driveAuth.user.email}）`}</p>
        {isDriveConnected ? (
          <div className="page-actions settings-card-actions">
            <button className="btn btn-secondary" type="button" onClick={handleConnectDrive} disabled={connectingDrive}>
              <RefreshCw size={16} /> 重新授權 Google 雲端硬碟
            </button>
            <button className="btn btn-danger" type="button" onClick={() => setConfirmDisconnectDrive(true)}>
              <Unlink size={16} /> 解除雲端硬碟授權
            </button>
          </div>
        ) : (
          <div>
            <div className="info-banner warning-banner">
              <AlertCircle size={18} />
              <span>尚未連結 Google 雲端硬碟。請完成授權以啟用 Drive 來源解析與影片上傳。</span>
            </div>
            <div className="page-actions settings-card-actions">
              <button className="btn btn-primary" type="button" onClick={handleConnectDrive} disabled={connectingDrive}>
                <Key size={16} /> 連結 Google 雲端硬碟
              </button>
            </div>
          </div>
        )}
      </div>

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
        open={confirmDisconnectSheets}
        title="解除 Google 試算表授權"
        message="確定要解除 Google 試算表授權嗎？解除後各項功能將無法讀取試算表內容，直到重新授權為止。"
        confirmText="確認解除"
        cancelText="取消"
        variant="destructive"
        onConfirm={handleConfirmDisconnectSheets}
        onCancel={() => setConfirmDisconnectSheets(false)}
      />

      <ConfirmDialog
        open={confirmDisconnectDrive}
        title="解除 Google 雲端硬碟授權"
        message="確定要解除 Google 雲端硬碟授權嗎？解除後將無法解析 Drive 資料夾或上傳影片，直到重新授權為止。"
        confirmText="確認解除"
        cancelText="取消"
        variant="destructive"
        onConfirm={handleConfirmDisconnectDrive}
        onCancel={() => setConfirmDisconnectDrive(false)}
      />
    </div>
  );
}
