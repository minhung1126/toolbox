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
  RefreshCw,
  Shield,
  Trash2,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import { copyToClipboard } from '../utils/clipboard';

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
        api.getSystemCredentials().catch(() => null),
        api.getAllowlist().catch(() => null),
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

  const redirectUri = credentials?.redirect_uri || sysSettings?.redirect_uri || `${window.location.origin}/api/v1/auth/callback`;

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
      const res = await api.updateSystemCredentials(payload);
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
      const res = await api.updateAllowNewUsers(nextVal);
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
      const res = await api.addAllowlistEmail(clean);
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
      const res = await api.removeAllowlistEmail(deleteTargetEmail);
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
      <div className="section-gap" style={{ textAlign: 'center', padding: '3rem' }}>
        <RefreshCw size={28} className="spin" style={{ margin: '0 auto 1rem' }} />
        <p>正在載入系統設定...</p>
      </div>
    );
  }

  const googleCreds = credentials?.credentials?.google || credentials?.google || {};
  const isCredentialsDirty = editingCreds && (
    editClientId.trim() !== (googleCreds.client_id || '') || Boolean(editClientSecret.trim())
  );

  return (
    <div className="section-gap system-settings-page">
      <header className="page-header">
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', margin: '0 0 0.5rem 0' }}>
          <Shield size={26} color="#10b981" /> 系統設定
        </h1>
        <p className="section-desc">管理系統安全密鑰、Google OAuth 憑證配置與控制台存取控制白名單。</p>
      </header>

      {/* 1. Security & System Status Banner */}
      <div className="glass-panel" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
          <Shield size={20} color="#10b981" />
          <h2 style={{ fontSize: '1.1rem', margin: 0, fontWeight: 600 }}>系統密鑰與安全防護狀態</h2>
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
          Toolbox 已啟用零設定自動金鑰管理。主加密金鑰與工作階段簽名金鑰已自動生成並安全保存在 <code>data/.secrets.json</code>，服務重啟或映像升級皆能持久保留。
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            background: 'rgba(16, 185, 129, 0.12)',
            color: '#10b981',
            padding: '0.35rem 0.75rem',
            borderRadius: '20px',
            fontSize: '0.82rem',
            fontWeight: 500,
          }}>
            <CheckCircle2 size={14} /> AES-256 Fernet 憑證保險庫啟用
          </span>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            background: 'rgba(59, 130, 246, 0.12)',
            color: '#60a5fa',
            padding: '0.35rem 0.75rem',
            borderRadius: '20px',
            fontSize: '0.82rem',
            fontWeight: 500,
          }}>
            <Lock size={14} /> Session 簽名金鑰持久化
          </span>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            background: 'rgba(255, 255, 255, 0.08)',
            color: 'var(--text-main)',
            padding: '0.35rem 0.75rem',
            borderRadius: '20px',
            fontSize: '0.82rem',
            fontWeight: 500,
          }}>
            公開位址 (.env)：{credentials?.public_base_url || sysSettings.public_base_url || window.location.origin}
          </span>
        </div>
      </div>

      {/* 2. Google OAuth Credentials Management */}
      <div className="glass-panel" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Key size={20} color="#60a5fa" />
            <h2 style={{ fontSize: '1.1rem', margin: 0, fontWeight: 600 }}>Google OAuth 憑證配置</h2>
          </div>
          {!editingCreds && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setEditingCreds(true);
                setEditClientId(googleCreds.client_id || '');
              }}
            >
              更新憑證
            </button>
          )}
        </div>

        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
          用於控制台登入驗證、Google 試算表讀取與 Google 雲端硬碟讀取。所有 Client Secret 皆在後端加密儲存，前端絕不接收明文密鑰。
        </p>

        {/* Authorized Redirect URI */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.03)',
          borderRadius: '8px',
          padding: '0.75rem 1rem',
          marginBottom: '1.25rem',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>
              Google Cloud 授權的重新導向 URI（依據 .env 的 PUBLIC_BASE_URL 產生）
            </span>
            <code style={{ fontSize: '0.85rem', color: '#93c5fd', wordBreak: 'break-all' }}>{redirectUri}</code>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleCopyRedirectUri}
            style={{ padding: '0.25rem 0.6rem', fontSize: '0.78rem', flexShrink: 0, marginLeft: '1rem' }}
          >
            {copied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
            {copied ? '已複製' : '複製網址'}
          </button>
        </div>

        {editingCreds ? (
          <form onSubmit={handleSaveCredentials} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', marginBottom: '0.35rem', fontWeight: 500 }}>
                Google OAuth Client ID
              </label>
              <input
                type="text"
                className="form-control"
                value={editClientId}
                onChange={(e) => setEditClientId(e.target.value)}
                placeholder="123456789-xxx.apps.googleusercontent.com"
                required
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', marginBottom: '0.35rem', fontWeight: 500 }}>
                Google OAuth Client Secret（留空表示維持原密鑰）
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showSecret ? 'text' : 'password'}
                  className="form-control"
                  value={editClientSecret}
                  onChange={(e) => setEditClientSecret(e.target.value)}
                  placeholder={googleCreds.has_client_secret ? '••••••••••••••••（已保存，輸入可覆蓋）' : 'GOCSPX-xxxxxxxx'}
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
                  }}
                >
                  {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {isCredentialsDirty && (
              <div
                className="info-banner warning-banner"
                style={{
                  background: 'rgba(245, 158, 11, 0.12)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  color: '#fbbf24',
                  padding: '0.6rem 0.8rem',
                  borderRadius: '6px',
                  fontSize: '0.82rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <AlertCircle size={16} />
                <span>Google OAuth 憑證已修改（尚未保存至保險庫）。為保護金鑰安全並避免頻繁寫入，修改後請記得點擊「儲存憑證」按鈕以套用！</span>
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setEditingCreds(false);
                  setEditClientSecret('');
                }}
                disabled={savingCreds}
              >
                取消
              </button>
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={savingCreds}
              >
                {savingCreds ? '儲存中...' : '儲存憑證'}
              </button>
            </div>
          </form>
        ) : (
          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '0.5rem', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>設定狀態：</span>
              <span>
                {googleCreds.configured ? (
                  <strong style={{ color: '#10b981' }}>✓ 已配置並正常運作</strong>
                ) : (
                  <strong style={{ color: '#ef4444' }}>尚未完成設定</strong>
                )}
              </span>

              <span style={{ color: 'var(--text-muted)' }}>Client ID：</span>
              <code style={{ wordBreak: 'break-all', color: '#93c5fd' }}>
                {googleCreds.client_id || '（未設定）'}
              </code>

              <span style={{ color: 'var(--text-muted)' }}>Client Secret：</span>
              <span style={{ color: 'var(--text-muted)' }}>
                {googleCreds.client_secret_masked || '（未設定）'}
              </span>

              <span style={{ color: 'var(--text-muted)' }}>Redirect URI：</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <code style={{ color: '#93c5fd', wordBreak: 'break-all' }}>
                  {redirectUri}
                </code>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleCopyRedirectUri}
                  style={{ padding: '0.15rem 0.5rem', fontSize: '0.75rem' }}
                >
                  {copied ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. Allowed Google Emails (Access Control) */}
      <div className="glass-panel" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
          <UserCheck size={20} color="#10b981" />
          <h2 style={{ fontSize: '1.1rem', margin: 0, fontWeight: 600 }}>允許登入的 Google 帳號名單 (Access Control)</h2>
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
          只有在此白名單內的 Google 帳號能夠登入此控制台。系統已啟用防自鎖保護，禁止管理員刪除自己目前登入的帳號。
        </p>

        {/* Allow New Users Setting */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '8px',
            padding: '0.85rem 1rem',
            marginBottom: '1.25rem',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: allowNewUsers ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: allowNewUsers ? '#10b981' : '#f87171',
                flexShrink: 0,
              }}
            >
              {allowNewUsers ? <UserPlus size={18} /> : <Lock size={18} />}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontWeight: 600, fontSize: '0.92rem' }}>允許新增使用者帳號</span>
                <span
                  style={{
                    fontSize: '0.72rem',
                    padding: '0.15rem 0.5rem',
                    borderRadius: '10px',
                    fontWeight: 600,
                    background: allowNewUsers ? 'rgba(16, 185, 129, 0.15)' : 'rgba(156, 163, 175, 0.15)',
                    color: allowNewUsers ? '#10b981' : 'var(--text-muted)',
                  }}
                >
                  {allowNewUsers ? '已啟用' : '已停用'}
                </span>
              </div>
              <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {allowNewUsers
                  ? '目前允許管理員新增使用者 Google 帳號至系統白名單。'
                  : '目前已鎖定新增功能，禁止新增任何新的使用者 Google 帳號。'}
              </p>
            </div>
          </div>
          <div>
            <button
              type="button"
              className={`btn btn-sm ${allowNewUsers ? 'btn-secondary' : 'btn-primary'}`}
              onClick={handleToggleAllowNewUsers}
              disabled={updatingAllowNewUsers}
              style={{ minWidth: '96px', whiteSpace: 'nowrap' }}
            >
              {updatingAllowNewUsers ? '處理中...' : (allowNewUsers ? '關閉新增' : '開啟新增')}
            </button>
          </div>
        </div>

        {/* Warning Banner if disabled */}
        {!allowNewUsers && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              color: '#fca5a5',
              fontSize: '0.85rem',
              marginBottom: '1rem',
            }}
          >
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <span>目前已關閉新增使用者帳號功能。如需新增成員，請先點擊上方按鈕開啟新增。</span>
          </div>
        )}

        {/* Add Email Form */}
        <form onSubmit={handleAddEmail} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
          <input
            type="email"
            className="form-control"
            placeholder={allowNewUsers ? '輸入要允許登入的 Google Email...' : '已停用新增使用者帳號功能'}
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            disabled={addingEmail || !allowNewUsers}
            style={{ flex: 1 }}
          />
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={addingEmail || !allowNewUsers || !newEmail.trim()}
            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
          >
            <Plus size={16} />
            {addingEmail ? '新增中...' : '新增成員'}
          </button>
        </form>

        {/* Email List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {allowlist.length === 0 ? (
            <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              尚無限制名單（開發模式下所有 Google 帳號皆可登入）
            </div>
          ) : (
            allowlist.map((email) => {
              const isSelf = email.toLowerCase() === currentUserEmail.toLowerCase();
              return (
                <div
                  key={email}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '8px',
                    padding: '0.65rem 1rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{email}</span>
                    {isSelf && (
                      <span style={{
                        fontSize: '0.72rem',
                        background: 'rgba(16, 185, 129, 0.15)',
                        color: '#10b981',
                        padding: '0.15rem 0.5rem',
                        borderRadius: '10px',
                        fontWeight: 600,
                      }}>
                        目前登入身分（您）
                      </span>
                    )}
                  </div>
                  <div>
                    {isSelf ? (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>不可自刪</span>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setDeleteTargetEmail(email)}
                        style={{ color: '#ef4444', padding: '0.3rem 0.5rem' }}
                        title="自白名單中移除此帳號"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

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
