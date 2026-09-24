import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Check, CheckCircle2, Copy, Eye, EyeOff, Key, Lock, RefreshCw, Shield, Video } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../components/Toast';
import { PATHS } from '../routes/paths';
import { copyToClipboard } from '../utils/clipboard';
import '../features/auth/auth.css';

export default function SetupWizardPage() {
  const toast = useToast();
  const navigate = useNavigate();

  const [loadingStatus, setLoadingStatus] = useState(true);
  const [setupStatus, setSetupStatus] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [copied, setCopied] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  // Form State
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [pin, setPin] = useState('');

  const fetchStatus = useCallback(async () => {
    setLoadingStatus(true);
    setErrorMessage(null);
    try {
      const res = await api.getSetupStatus();
      setSetupStatus(res);
      if (res.development_pin) {
        setPin((prev) => prev || res.development_pin);
      }
    } catch (err) {
      setErrorMessage(err.message || '無法取得系統初始設定狀態。');
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const redirectUri = setupStatus?.redirect_uri || `${window.location.origin}/api/v1/auth/callback`;

  const handleCopyRedirectUri = async () => {
    try {
      await copyToClipboard(redirectUri);
      setCopied(true);
      toast.success('已複製 Redirect URI 到剪貼簿');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('複製失敗，請手動選取文字複製。');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!clientId.trim() || !clientSecret.trim()) {
      setErrorMessage('請填寫 Google Client ID 與 Client Secret。');
      return;
    }
    if (!adminEmail.trim()) {
      setErrorMessage('請填寫管理員 Google 帳號 Email。');
      return;
    }
    if (setupStatus?.needs_pin && !pin.trim()) {
      setErrorMessage('請輸入伺服器啟動日誌中顯示的 6 位數安全碼 (PIN)。');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.performSetup({
        googleClientId: clientId.trim(),
        googleClientSecret: clientSecret.trim(),
        adminEmail: adminEmail.trim(),
        pin: pin.trim(),
      });
      toast.success(res.message || '初始設定完成！');
      navigate(PATHS.login, { replace: true });
    } catch (err) {
      setErrorMessage(err.message || '設定失敗，請確認資料後重試。');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingStatus) {
    return (
      <div className="auth-page">
        <div className="login-card login-card-centered" role="status" aria-live="polite">
          <RefreshCw size={32} className="spin setup-loading-icon" aria-hidden="true" />
          <p>正在檢查系統設定狀態...</p>
        </div>
      </div>
    );
  }

  if (setupStatus?.setup_completed && setupStatus?.is_configured) {
    return (
      <div className="auth-page">
        <div className="login-card">
          <div className="login-header">
            <div className="login-logo-box">
              <CheckCircle2 size={36} className="setup-success-icon" aria-hidden="true" />
            </div>
            <h1 className="login-title">系統已完成設定</h1>
            <p className="login-subtitle">Toolbox 服務已正常運行</p>
          </div>
          <p className="login-description">
            此系統已完成初始設定與憑證綁定。若需修改設定，請使用管理員帳號登入後前往「系統設定」頁面。
          </p>
          <div className="login-actions login-actions-stacked">
            <button type="button" className="btn btn-primary" onClick={() => navigate(PATHS.login)}>
              前往登入頁面
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page auth-page-setup">
      <div className="login-card login-card-wide">
        <div className="login-header">
          <div className="login-logo-box">
            <Video size={36} color="var(--text-main)" />
          </div>
          <h1 className="login-title">Toolbox 初始安裝精靈</h1>
          <p className="login-subtitle">歡迎使用創作者工具箱！請完成初次系統憑證配置</p>
        </div>

        <div className="login-badge login-badge-info">
          <Shield size={14} /> 首次運行設定 (Setup Mode)
        </div>

        <p className="login-description">
          Toolbox 已將所有設定全面轉移至網頁控制台，您無須在伺服器編輯複雜的 <code>.env</code> 檔案。請依下列步驟填入
          Google Cloud OAuth 憑證以啟用登入與自動化功能。
        </p>

        {/* Step 1: Authorized Redirect URI */}
        <div className="setup-redirect">
          <div className="setup-redirect-heading">
            <span>步驟 1：Google Cloud 授權的重新導向 URI (Authorized Redirect URI)</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleCopyRedirectUri}>
              {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
              {copied ? '已複製' : '複製網址'}
            </button>
          </div>
          <code className="setup-redirect-code">{redirectUri}</code>
          <p className="setup-redirect-hint">
            請在 Google Cloud Console 的「OAuth 2.0 用戶端 ID」設定中，將上方網址填入「已授權的重新導向 URI」。
          </p>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="login-error-alert" role="alert">
            <AlertCircle size={18} />
            <div className="login-error-content">
              <span>{errorMessage}</span>
            </div>
          </div>
        )}

        {/* Step 2: Form */}
        <form onSubmit={handleSubmit} className="setup-form">
          <div className="setup-field">
            <label className="setup-label" htmlFor="setup-client-id">
              Google OAuth Client ID <span className="setup-required">*</span>
            </label>
            <input
              type="text"
              placeholder="例如：123456789-abc.apps.googleusercontent.com"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              disabled={submitting}
              required
              id="setup-client-id"
              className="form-input setup-input"
            />
          </div>

          <div className="setup-field">
            <label className="setup-label" htmlFor="setup-client-secret">
              Google OAuth Client Secret <span className="setup-required">*</span>
            </label>
            <div className="setup-secret-control">
              <input
                id="setup-client-secret"
                type={showSecret ? 'text' : 'password'}
                className="form-input setup-input setup-input-secret"
                placeholder="例如：GOCSPX-xxxxxxxxxxxxxxxx"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                disabled={submitting}
                required
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="setup-secret-toggle"
                aria-label={showSecret ? '隱藏 Client Secret' : '顯示 Client Secret'}
                aria-pressed={showSecret}
              >
                {showSecret ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
              </button>
            </div>
          </div>

          <div className="setup-field">
            <label className="setup-label" htmlFor="setup-admin-email">
              初始管理員 Google 帳號 Email <span className="setup-required">*</span>
            </label>
            <input
              type="email"
              id="setup-admin-email"
              placeholder="admin@yourcompany.com"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              disabled={submitting}
              required
              className="form-input setup-input"
            />
            <span className="setup-field-hint">
              此帳號將自動加入白名單並取得最高管理權限，稍後可於控制台新增其他成員。
            </span>
          </div>

          {setupStatus?.needs_pin && (
            <div className="setup-pin-panel">
              <label className="setup-pin-label" htmlFor="setup-pin">
                <Key size={15} aria-hidden="true" /> 伺服器初次安裝安全碼 (PIN){' '}
                <span className="setup-required">*</span>
              </label>
              <input
                type="text"
                id="setup-pin"
                className="form-input setup-input setup-pin-input"
                placeholder="請輸入 6 位數安全碼"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                disabled={submitting}
                maxLength={10}
                required
              />
              <span className="setup-field-hint">
                🛡️ 為防止公網環境遭未授權配置，請查看 Docker 或主機啟動日誌獲取一次性安全碼：
                <code className="setup-pin-command">docker compose logs toolbox</code>
              </span>
            </div>
          )}

          <div>
            <button type="submit" className="btn btn-primary setup-submit" disabled={submitting}>
              {submitting ? (
                <>
                  <span className="ui-inline-spinner" aria-hidden="true"></span>
                  正在加密並儲存系統憑證...
                </>
              ) : (
                <>
                  <Lock size={18} />
                  儲存並完成系統初始化
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
