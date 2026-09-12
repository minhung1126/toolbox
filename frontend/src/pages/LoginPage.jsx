import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { saveOAuthReturnPath } from '../utils/authReturnPath';
import { PATHS } from '../routes/paths';
import { 
  Video, 
  LogIn, 
  CheckCircle2, 
  AlertCircle, 
  Lock,
  RefreshCw,
} from 'lucide-react';

export default function LoginPage({ initialError, returnTo }) {
  const [loggingIn, setLoggingIn] = useState(false);
  const [oauthError, setOauthError] = useState(initialError || null);
  const [readinessError, setReadinessError] = useState(null);
  const [authConfig, setAuthConfig] = useState(null);
  const [checkingConfig, setCheckingConfig] = useState(true);

  const checkLoginReadiness = useCallback(async () => {
    setCheckingConfig(true);
    try {
      const config = await api.getAuthConfig();
      setAuthConfig(config);
      if (!config.has_client_id || !config.has_client_secret) {
        setReadinessError('Google 登入尚未完成系統設定，請聯絡管理者補齊 OAuth 憑證。');
      } else {
        setReadinessError(null);
      }
    } catch (error) {
      setAuthConfig(null);
      setReadinessError(error.message || '無法檢查 Google 登入服務狀態，請稍後重試。');
    } finally {
      setCheckingConfig(false);
    }
  }, []);

  useEffect(() => { checkLoginReadiness(); }, [checkLoginReadiness]);

  const handleGoogleLogin = async () => {
    setLoggingIn(true);
    setOauthError(null);
    try {
      saveOAuthReturnPath('google', returnTo || '/dashboard');
      const res = await api.getAuthUrl();
      if (res && res.auth_url) {
        window.location.href = res.auth_url;
      } else {
        setOauthError('無法取得 Google 授權網址，請確認後端設定。');
        setLoggingIn(false);
      }
    } catch (err) {
      console.error('Google auth error:', err);
      setOauthError(err.message || '連線至 Google 授權服務失敗，請稍後重試。');
      setLoggingIn(false);
    }
  };

  const loginReady = Boolean(authConfig?.has_client_id && authConfig?.has_client_secret);

  return (
    <div className="login-container">
      <div className="login-card glass-panel">
        {/* Header Branding */}
        <div className="login-header">
          <div className="login-logo-box">
            <Video size={36} color="var(--text-main)" />
          </div>
          <h1 className="login-title">Creator Tools</h1>
          <p className="login-subtitle">創作者自動化控制台系統</p>
        </div>

        {/* Security Badge */}
        <div className="login-badge">
          <Lock size={14} /> 需要授權存取
        </div>

        {/* Description */}
        <p className="login-description">
          歡迎使用 Toolbox 控制台。請使用 Google 帳號登入系統；Google 試算表、Google 雲端硬碟與 YouTube 頻道授權皆已獨立拆開，可在登入後於各自對應頁面中依需要授權。
        </p>

        {/* Feature List */}
        <div className="login-features">
          <div className="feature-item">
            <CheckCircle2 size={18} className="feature-icon" />
            <span>獨立的身分認證：僅索取基本個人資料與 Email 驗證控制台身分</span>
          </div>
          <div className="feature-item">
            <CheckCircle2 size={18} className="feature-icon" />
            <span><strong>模組化權限拆分</strong>：Google 試算表、雲端硬碟、YouTube 頻道分別獨立授權</span>
          </div>
          <div className="feature-item">
            <CheckCircle2 size={18} className="feature-icon" />
            <span>安全的 <strong>Session Cookie</strong> 加密傳輸與憑證管理</span>
          </div>
        </div>

        {/* OAuth callback and readiness errors are kept separate so a readiness refresh cannot hide a failed login. */}
          {oauthError && (
            <div className="login-error-alert">
              <AlertCircle size={18} />
              <div className="login-error-content">
              <span>{oauthError}</span>
            </div>
          </div>
        )}
        {readinessError && (
          <div className="login-error-alert">
            <AlertCircle size={18} />
            <div className="login-error-content">
              <span>{readinessError}</span>
              {!loginReady && !checkingConfig && (
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
                  <Link to={PATHS.setup} className="btn btn-primary btn-sm">
                    前往初次安裝精靈
                  </Link>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={checkLoginReadiness}>
                    <RefreshCw size={14} />重新檢查
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Login Action Button */}
        <div className="login-actions">
          <button 
            className="btn btn-primary login-btn"
            onClick={handleGoogleLogin}
            disabled={loggingIn || checkingConfig || !loginReady}
          >
            {checkingConfig ? (
              <>
                <span className="login-spinner"></span>
                正在檢查登入服務...
              </>
            ) : loggingIn ? (
              <>
                <span className="login-spinner"></span>
                正在傳送至 Google 授權...
              </>
            ) : (
              <>
                <LogIn size={20} />
                使用 Google 帳號登入
              </>
            )}
          </button>
        </div>

        <p className="login-footer">
          點擊登入會使用 Google OAuth 2.0 登入控制台；各項工具功能（試算表、雲端硬碟、YouTube 等）可在登入後分別獨立授權。
        </p>
      </div>
    </div>
  );
}
