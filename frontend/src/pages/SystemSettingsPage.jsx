import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Key,
  Lock,
  Plus,
  Shield,
  Trash2,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import { systemSettingsApi } from '../features/settings/api/systemSettingsApi';
import { useToast } from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import { copyToClipboard } from '../utils/clipboard';
import { Badge, Button, Card, LoadingState, PageHeader } from '../shared/ui';
import './SystemSettingsPage.css';

export default function SystemSettingsPage({ sysSettings = {} }) {
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [credentials, setCredentials] = useState(null);
  const [allowlist, setAllowlist] = useState([]);
  const [currentUserEmail, setCurrentUserEmail] = useState('');
  const [allowNewUsers, setAllowNewUsers] = useState(true);
  const [updatingAllowNewUsers, setUpdatingAllowNewUsers] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [addingEmail, setAddingEmail] = useState(false);
  const [deleteTargetEmail, setDeleteTargetEmail] = useState(null);
  const [deletingEmail, setDeletingEmail] = useState(false);
  const [copied, setCopied] = useState(false);

  // Edit credentials state
  const [editingCreds, setEditingCreds] = useState(false);
  const [editClientId, setEditClientId] = useState('');
  const [editClientSecret, setEditClientSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [savingCreds, setSavingCreds] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [credsRes, allowlistRes] = await Promise.all([
        systemSettingsApi.getCredentials().catch(() => null),
        systemSettingsApi.getAllowlist().catch(() => null),
      ]);
      if (credsRes) {
        setCredentials(credsRes);
        setEditClientId(credsRes.credentials?.google?.client_id || credsRes.google?.client_id || '');
      }
      if (allowlistRes) {
        setAllowlist(allowlistRes.allowed_emails || []);
        setCurrentUserEmail(allowlistRes.current_user_email || '');
        if (typeof allowlistRes.allow_new_users === 'boolean') {
          setAllowNewUsers(allowlistRes.allow_new_users);
        }
      }
    } catch (err) {
      toast.error(`載入系統設定失敗：${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const redirectUri =
    credentials?.redirect_uri || sysSettings?.redirect_uri || `${window.location.origin}/api/v1/auth/callback`;

  const handleCopyRedirectUri = async () => {
    try {
      await copyToClipboard(redirectUri);
      setCopied(true);
      toast.success('已複製 Redirect URI 到剪貼簿');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('複製失敗，請手動複製文字。');
    }
  };

  const handleSaveCredentials = async (e) => {
    e.preventDefault();
    if (!editClientId.trim()) {
      toast.error('Google Client ID 不能為空。');
      return;
    }

    setSavingCreds(true);
    try {
      const payload = {
        google_client_id: editClientId.trim(),
      };
      if (editClientSecret.trim()) {
        payload.google_client_secret = editClientSecret.trim();
      }
      const res = await systemSettingsApi.updateCredentials(payload);
      setCredentials((prev) => ({
        ...prev,
        ...res,
        credentials: res.credentials || prev?.credentials,
      }));
      setEditingCreds(false);
      setEditClientSecret('');
      toast.success('Google OAuth 憑證已更新並加密保存！');
    } catch (err) {
      toast.error(`更新憑證失敗：${err.message}`);
    } finally {
      setSavingCreds(false);
    }
  };

  const handleToggleAllowNewUsers = async () => {
    const nextVal = !allowNewUsers;
    setUpdatingAllowNewUsers(true);
    try {
      const res = await systemSettingsApi.updateAllowNewUsers(nextVal);
      const updatedVal = typeof res.allow_new_users === 'boolean' ? res.allow_new_users : nextVal;
      setAllowNewUsers(updatedVal);
      toast.success(updatedVal ? '已開啟允許新增使用者帳號' : '已關閉允許新增使用者帳號（禁止新增）');
    } catch (err) {
      toast.error(`更新設定失敗：${err.message}`);
    } finally {
      setUpdatingAllowNewUsers(false);
    }
  };

  const handleAddEmail = async (e) => {
    e.preventDefault();
    if (!allowNewUsers) {
      toast.error('目前系統已設定為不允許新增使用者帳號。如需新增，請先開啟允許新增開關。');
      return;
    }
    const clean = newEmail.trim().toLowerCase();
    if (!clean || !clean.includes('@')) {
      toast.error('請輸入有效的 Google 電子郵件信箱。');
      return;
    }
    if (allowlist.includes(clean)) {
      toast.error('該帳號已在白名單中。');
      return;
    }

    setAddingEmail(true);
    try {
      const res = await systemSettingsApi.addAllowlistEmail(clean);
      setAllowlist(res.allowed_emails || []);
      if (typeof res.allow_new_users === 'boolean') {
        setAllowNewUsers(res.allow_new_users);
      }
      setNewEmail('');
      toast.success(`已將 ${clean} 加入白名單`);
    } catch (err) {
      toast.error(`新增成員失敗：${err.message}`);
    } finally {
      setAddingEmail(false);
    }
  };

  const handleConfirmDeleteEmail = async () => {
    if (!deleteTargetEmail) return;
    setDeletingEmail(true);
    try {
      const res = await systemSettingsApi.removeAllowlistEmail(deleteTargetEmail);
      setAllowlist(res.allowed_emails || []);
      toast.success(`已將 ${deleteTargetEmail} 從白名單移除`);
      setDeleteTargetEmail(null);
    } catch (err) {
      toast.error(`移除失敗：${err.message}`);
    } finally {
      setDeletingEmail(false);
    }
  };

  if (loading) {
    return (
      <div className="section-gap">
        <LoadingState>正在載入系統設定...</LoadingState>
      </div>
    );
  }

  const googleCreds = credentials?.credentials?.google || credentials?.google || {};
  const isCredentialsDirty =
    editingCreds && (editClientId.trim() !== (googleCreds.client_id || '') || Boolean(editClientSecret.trim()));

  return (
    <div className="section-gap system-settings-page">
      <PageHeader
        className="system-settings-header"
        title={
          <span className="system-settings-title">
            <Shield size={26} aria-hidden="true" /> 系統設定
          </span>
        }
        description="管理系統安全密鑰、Google OAuth 憑證配置與控制台存取控制白名單。"
      />

      {/* 1. Security & System Status Banner */}
      <Card className="system-settings-card">
        <div className="system-settings-card-header">
          <div className="system-settings-card-title">
            <Shield
              size={20}
              className="system-settings-section-icon system-settings-section-icon-success"
              aria-hidden="true"
            />
            <h2>系統密鑰與安全防護狀態</h2>
          </div>
        </div>
        <p className="section-desc">
          Toolbox 已啟用零設定自動金鑰管理。主加密金鑰與工作階段簽名金鑰已自動生成並安全保存在{' '}
          <code>data/.secrets.json</code>，服務重啟或映像升級皆能持久保留。
        </p>
        <div className="system-settings-status-list">
          <Badge tone="success">
            <CheckCircle2 size={14} /> AES-256 Fernet 憑證保險庫啟用
          </Badge>
          <Badge tone="info">
            <Lock size={14} /> Session 簽名金鑰持久化
          </Badge>
          <Badge tone="info">
            公開位址 (.env)：{credentials?.public_base_url || sysSettings.public_base_url || window.location.origin}
          </Badge>
        </div>
      </Card>

      {/* 2. Google OAuth Credentials Management */}
      <Card className="system-settings-card">
        <div className="system-settings-card-header">
          <div className="system-settings-card-title">
            <Key size={20} className="system-settings-section-icon" aria-hidden="true" />
            <h2>Google OAuth 憑證配置</h2>
          </div>
          {!editingCreds && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setEditingCreds(true);
                setEditClientId(googleCreds.client_id || '');
              }}
            >
              更新憑證
            </Button>
          )}
        </div>

        <p className="section-desc">
          用於控制台登入驗證、Google 試算表讀取與 Google 雲端硬碟讀取。所有 Client Secret
          皆在後端加密儲存，前端絕不接收明文密鑰。
        </p>

        {/* Authorized Redirect URI */}
        <div className="system-settings-redirect-uri">
          <div className="system-settings-redirect-content">
            <span className="form-hint system-settings-redirect-label">
              Google Cloud 授權的重新導向 URI（依據 .env 的 PUBLIC_BASE_URL 產生）
            </span>
            <code>{redirectUri}</code>
          </div>
          <Button variant="secondary" size="sm" onClick={handleCopyRedirectUri}>
            {copied ? (
              <Check size={14} className="system-settings-copy-success" aria-hidden="true" />
            ) : (
              <Copy size={14} aria-hidden="true" />
            )}
            {copied ? '已複製' : '複製網址'}
          </Button>
        </div>

        {editingCreds ? (
          <form onSubmit={handleSaveCredentials} className="system-settings-credentials-form">
            <div className="form-group">
              <label className="form-label" htmlFor="system-oauth-client-id">
                Google OAuth Client ID
              </label>
              <input
                id="system-oauth-client-id"
                type="text"
                className="form-input"
                value={editClientId}
                onChange={(e) => setEditClientId(e.target.value)}
                placeholder="123456789-xxx.apps.googleusercontent.com"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="system-oauth-client-secret">
                Google OAuth Client Secret（留空表示維持原密鑰）
              </label>
              <div className="system-settings-secret-field">
                <input
                  id="system-oauth-client-secret"
                  type={showSecret ? 'text' : 'password'}
                  className="form-input system-settings-secret-input"
                  value={editClientSecret}
                  onChange={(e) => setEditClientSecret(e.target.value)}
                  placeholder={
                    googleCreds.has_client_secret ? '••••••••••••••••（已保存，輸入可覆蓋）' : 'GOCSPX-xxxxxxxx'
                  }
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  aria-label={showSecret ? '隱藏密鑰' : '顯示密鑰'}
                  aria-pressed={showSecret}
                  className="system-settings-secret-toggle"
                >
                  {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {isCredentialsDirty && (
              <div className="info-banner warning-banner">
                <AlertCircle size={16} aria-hidden="true" />
                <span>
                  Google OAuth
                  憑證已修改（尚未保存至保險庫）。為保護金鑰安全並避免頻繁寫入，修改後請記得點擊「儲存憑證」按鈕以套用！
                </span>
              </div>
            )}

            <div className="system-settings-actions">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setEditingCreds(false);
                  setEditClientSecret('');
                }}
                disabled={savingCreds}
              >
                取消
              </Button>
              <Button type="submit" size="sm" disabled={savingCreds}>
                {savingCreds ? '儲存中...' : '儲存憑證'}
              </Button>
            </div>
          </form>
        ) : (
          <div className="system-settings-info-grid">
            <div className="system-settings-info-card">
              <strong>設定狀態</strong>
              <p>
                {googleCreds.configured ? (
                  <span className="system-settings-status-text system-settings-status-text-success">
                    ✓ 已配置並正常運作
                  </span>
                ) : (
                  <span className="system-settings-status-text system-settings-status-text-danger">尚未完成設定</span>
                )}
              </p>
            </div>

            <div className="system-settings-info-card">
              <strong>Client ID</strong>
              <p className="system-settings-client-id">
                <code>{googleCreds.client_id || '（未設定）'}</code>
              </p>
            </div>

            <div className="system-settings-info-card">
              <strong>Client Secret</strong>
              <p>{googleCreds.client_secret_masked || '（未設定）'}</p>
            </div>
          </div>
        )}
      </Card>

      {/* 3. Allowed Google Emails (Access Control) */}
      <Card className="system-settings-card">
        <div className="system-settings-card-header">
          <div className="system-settings-card-title">
            <UserCheck
              size={20}
              className="system-settings-section-icon system-settings-section-icon-success"
              aria-hidden="true"
            />
            <h2>允許登入的 Google 帳號名單 (Access Control)</h2>
          </div>
        </div>
        <p className="section-desc">
          只有在此白名單內的 Google 帳號能夠登入此控制台。系統已啟用防自鎖保護，禁止管理員刪除自己目前登入的帳號。
        </p>

        {/* Allow New Users Setting */}
        <div className="system-settings-allow-users">
          <div className="system-settings-allow-users-summary">
            <div className={`icon-box ${allowNewUsers ? 'icon-box-primary' : 'icon-box-secondary'}`} aria-hidden="true">
              {allowNewUsers ? <UserPlus size={18} /> : <Lock size={18} />}
            </div>
            <div>
              <div className="system-settings-allow-users-title">
                <strong>允許新增使用者帳號</strong>
                <Badge tone={allowNewUsers ? 'success' : 'neutral'}>{allowNewUsers ? '已啟用' : '已停用'}</Badge>
              </div>
              <p className="form-hint system-settings-allow-users-description">
                {allowNewUsers
                  ? '目前允許管理員新增使用者 Google 帳號至系統白名單。'
                  : '目前已鎖定新增功能，禁止新增任何新的使用者 Google 帳號。'}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant={allowNewUsers ? 'secondary' : 'primary'}
            size="sm"
            onClick={handleToggleAllowNewUsers}
            disabled={updatingAllowNewUsers}
            className="system-settings-allow-users-toggle"
          >
            {updatingAllowNewUsers ? '處理中...' : allowNewUsers ? '關閉新增' : '開啟新增'}
          </Button>
        </div>

        {/* Warning Banner if disabled */}
        {!allowNewUsers && (
          <div className="info-banner warning-banner system-settings-warning-banner">
            <AlertCircle size={18} aria-hidden="true" />
            <span>目前已關閉新增使用者帳號功能。如需新增成員，請先點擊上方按鈕開啟新增。</span>
          </div>
        )}

        {/* Add Email Form */}
        <form onSubmit={handleAddEmail} className="system-settings-add-member-form">
          <label className="form-label" htmlFor="system-settings-allowlist-email">
            新增允許登入的 Google Email
          </label>
          <input
            id="system-settings-allowlist-email"
            type="email"
            className="form-input"
            placeholder={allowNewUsers ? '輸入要允許登入的 Google Email...' : '已停用新增使用者帳號功能'}
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            disabled={addingEmail || !allowNewUsers}
            aria-describedby="system-settings-allowlist-help"
          />
          <span id="system-settings-allowlist-help" className="form-hint system-settings-add-member-help">
            輸入要加入系統白名單的 Google 帳號。
          </span>
          <Button
            type="submit"
            className="system-settings-add-button"
            icon={Plus}
            disabled={addingEmail || !allowNewUsers || !newEmail.trim()}
            aria-label={addingEmail ? '新增成員中' : '新增成員'}
          >
            {addingEmail ? '新增中...' : '新增成員'}
          </Button>
        </form>

        {/* Email List */}
        <div className="system-settings-email-list">
          {allowlist.length === 0 ? (
            <div className="system-settings-empty-state">尚無限制名單（開發模式下所有 Google 帳號皆可登入）</div>
          ) : (
            allowlist.map((email) => {
              const isSelf = email.toLowerCase() === currentUserEmail.toLowerCase();
              return (
                <div key={email} className="system-settings-info-card system-settings-email-row">
                  <div className="system-settings-email-meta">
                    <span className="system-settings-email">{email}</span>
                    {isSelf && <Badge tone="success">目前登入身分（您）</Badge>}
                  </div>
                  <div className="system-settings-email-actions">
                    {isSelf ? (
                      <span className="form-hint">不可自刪</span>
                    ) : (
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        onClick={() => setDeleteTargetEmail(email)}
                        icon={Trash2}
                        className="system-settings-remove-button"
                        title="自白名單中移除此帳號"
                        aria-label={`自白名單移除 ${email}`}
                      />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        open={Boolean(deleteTargetEmail)}
        title="確認自白名單中移除帳號"
        message={`確定要移除 ${deleteTargetEmail} 嗎？移除後該帳號將無法登入此控制台。`}
        confirmText={deletingEmail ? '移除中...' : '確認移除'}
        cancelText="取消"
        variant="destructive"
        onConfirm={handleConfirmDeleteEmail}
        onCancel={() => setDeleteTargetEmail(null)}
      />
    </div>
  );
}
