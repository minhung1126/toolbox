import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Key,
  Lock,
  RefreshCw,
  Shield,
  Video,
} from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../components/Toast';
import { PATHS } from '../routes/paths';
import { copyToClipboard } from '../utils/clipboard';

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
      <div className="login-container">
        <div className="login-card glass-panel" style={{ textAlign: 'center', padding: '3rem' }}>
          <RefreshCw size={32} className="spin" style={{ margin: '0 auto 1rem' }} />
          <p>正在檢查系統設定狀態...</p>
        </div>
      </div>
    );
  }

  if (setupStatus?.setup_completed && setupStatus?.is_configured) {
    return (
      <div className="login-container">
        <div className="login-card glass-panel">
          <div className="login-header">
            <div className="login-logo-box">
              <CheckCircle2 size={36} color="var(--success-color, #10b981)" />
            </div>
            <h1 className="login-title">系統已完成設定</h1>
            <p className="login-subtitle">Toolbox 服務已正常運行</p>
          </div>
          <p className="login-description">
            此系統已完成初始設定與憑證綁定。若需修改設定，請使用管理員帳號登入後前往「系統設定」頁面。
          </p>
          <div className="login-actions" style={{ marginTop: '1.5rem' }}>
            <button type="button" className="btn btn-primary" onClick={() => navigate(PATHS.login)}>
              前往登入頁面
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-container" style={{ maxWidth: '640px' }}>
      <div className="login-card glass-panel">
        <div className="login-header">
          <div className="login-logo-box">
            <Video size={36} color="var(--text-main)" />
          </div>
          <h1 className="login-title">Toolbox 初始安裝精靈</h1>
          <p className="login-subtitle">歡迎使用創作者工具箱！請完成初次系統憑證配置</p>
        </div>

        <div className="login-badge" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa' }}>
          <Shield size={14} /> 首次運行設定 (Setup Mode)
        </div>

        <p className="login-description" style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>
          Toolbox 已將所有設定全面轉移至網頁控制台，您無須在伺服器編輯複雜的 <code>.env</code> 檔案。請依下列步驟填入 Google Cloud OAuth 憑證以啟用登入與自動化功能。
        </p>

        {/* Step 1: Authorized Redirect URI */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.04)',
          borderRadius: '8px',
          padding: '1rem',
          marginBottom: '1.5rem',
          border: '1px solid rgba(255, 255, 255, 0.08)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              步驟 1：Google Cloud 授權的重新導向 URI (Authorized Redirect URI)
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleCopyRedirectUri}
              style={{ padding: '0.25rem 0.6rem', fontSize: '0.78rem' }}
            >
              {copied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
              {copied ? '已複製' : '複製網址'}
            </button>
          </div>
          <code style={{
            display: 'block',
            background: 'rgba(0, 0, 0, 0.3)',
            padding: '0.5rem 0.75rem',
            borderRadius: '6px',
            fontSize: '0.85rem',
            wordBreak: 'break-all',
            color: '#93c5fd',
          }}>
            {redirectUri}
          </code>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.5rem', margin: '0.5rem 0 0' }}>
            請在 Google Cloud Console 的「OAuth 2.0 用戶端 ID」設定中，將上方網址填入「已授權的重新導向 URI」。
          </p>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="login-error-alert" style={{ marginBottom: '1.25rem' }}>
            <AlertCircle size={18} />
            <div className="login-error-content">
              <span>{errorMessage}</span>
            </div>
          </div>
        )}

        {/* Step 2: Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '0.35rem' }}>
              Google OAuth Client ID <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="text"
              className="form-input"
              placeholder="例如：123456789-abc.apps.googleusercontent.com"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              disabled={submitting}
              required
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '0.35rem' }}>
              Google OAuth Client Secret <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showSecret ? 'text' : 'password'}
                className="form-input"
                placeholder="例如：GOCSPX-xxxxxxxxxxxxxxxx"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                disabled={submitting}
                required
                style={{ width: '100%', paddingRight: '2.5rem' }}
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                style={{
                  position: 'absolute',
                  right: '0.5rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '0.25rem',
                }}
              >
                {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '0.35rem' }}>
              初始管理員 Google 帳號 Email <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="email"
              className="form-input"
              placeholder="admin@yourcompany.com"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              disabled={submitting}
              required
              style={{ width: '100%' }}
            />
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              此帳號將自動加入白名單並取得最高管理權限，稍後可於控制台新增其他成員。
            </span>
          </div>

          {setupStatus?.needs_pin && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: '8px',
              padding: '0.85rem',
            }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 600, color: '#f87171', marginBottom: '0.35rem' }}>
                <Key size={15} /> 伺服器初次安裝安全碼 (PIN) <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="請輸入 6 位數安全碼"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                disabled={submitting}
                maxLength={10}
                required
                style={{ width: '100%', letterSpacing: '0.2rem', fontWeight: 600 }}
              />
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.35rem' }}>
                🛡️ 為防止公網環境遭未授權配置，請查看 Docker 或主機啟動日誌獲取一次性安全碼：
                <code style={{ display: 'block', marginTop: '0.25rem' }}>docker compose logs toolbox</code>
              </span>
            </div>
          )}

          <div style={{ marginTop: '0.75rem' }}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
              style={{ width: '100%', padding: '0.75rem', fontSize: '1rem', fontWeight: 600 }}
            >
              {submitting ? (
                <>
                  <span className="login-spinner"></span>
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
