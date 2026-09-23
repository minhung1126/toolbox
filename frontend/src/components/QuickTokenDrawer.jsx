import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronUp,
  Code2,
  ExternalLink,
  HelpCircle,
  Key,
  Loader2,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '../services/api';
import { useToast } from './Toast';

export default function QuickTokenDrawer({
  isOpen,
  onClose,
  hasCustomToken = false,
  tokenAccountName = '',
  tokenChannelHandle = '',
  tokenUpdatedAt = '',
  onTokenSaved,
  onTokenCleared,
}) {
  const toast = useToast();
  const [tokenInput, setTokenInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [showGuide, setShowGuide] = useState(false);

  if (!isOpen) return null;

  const handleValidate = async (tokenToTest = null) => {
    const raw = (tokenToTest !== null ? tokenToTest : tokenInput).trim();
    setValidating(true);
    setValidationResult(null);
    try {
      const res = await api.validateYtmusicCustomToken(raw || null);
      setValidationResult({
        valid: true,
        message: res.message || 'Token 驗證成功，可正常讀取 YouTube Music 音樂庫並進行 0 配額排序。',
        accountName: res.account_name,
        channelHandle: res.channel_handle,
      });
      toast.success(res.message || 'YouTube Music Token 驗證成功！');
    } catch (err) {
      const errMsg = err.message || 'Token 驗證失敗或 Cookie 已過期';
      setValidationResult({
        valid: false,
        message: errMsg,
      });
      toast.error(`Token 驗證失敗：${errMsg}`);
    } finally {
      setValidating(false);
    }
  };

  const handleSave = async () => {
    const trimmed = tokenInput.trim();
    if (!trimmed) {
      toast.warning('請先貼入 Cookie、cURL 或 Node.js fetch 代碼');
      return;
    }
    setSaving(true);
    try {
      await api.saveYtmusicCustomToken(trimmed);
      toast.success('YouTube Music 瀏覽器 Token 已成功啟用（0 配額模式）！');
      setTokenInput('');
      setValidationResult(null);
      if (onTokenSaved) {
        await onTokenSaved();
      }
    } catch (err) {
      toast.error(`儲存 Token 失敗：${err.message || '格式不正確'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    try {
      await api.clearYtmusicCustomToken();
      toast.success('已清除自訂 Token，將改用 Google API 模式');
      setValidationResult(null);
      if (onTokenCleared) {
        await onTokenCleared();
      }
    } catch (err) {
      toast.error(`清除 Token 失敗：${err.message || '未知錯誤'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      data-testid="quick-token-drawer"
      style={{
        marginTop: 14,
        padding: '16px 20px',
        borderRadius: 10,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        border: '1px solid rgba(59, 130, 246, 0.35)',
        boxShadow: '0 8px 24px -4px rgba(0, 0, 0, 0.4)',
        animation: 'fadeIn 0.2s ease-in-out',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10,
          marginBottom: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Key size={18} color="var(--primary, #38bdf8)" />
          <strong style={{ fontSize: '0.95rem', color: '#fff' }}>
            YouTube Music 瀏覽器 Token 快速配置（0 配額模式）
          </strong>
          {hasCustomToken && (
            <span className="badge badge-connected" style={{ fontSize: '0.75rem' }}>
              <CheckCircle2 size={11} /> 目前已啟用
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setShowGuide(!showGuide)}
            style={{ fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <HelpCircle size={13} />
            {showGuide ? '收合教學' : '如何取得 Token？'}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onClose}
            aria-label="收合面板"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px' }}
          >
            <ChevronUp size={14} /> 收合面板
          </button>
        </div>
      </div>

      {/* Current token metadata pill if active */}
      {hasCustomToken && (
        <div
          style={{
            marginBottom: 12,
            padding: '8px 12px',
            borderRadius: 6,
            background: 'rgba(34, 197, 94, 0.08)',
            border: '1px solid rgba(34, 197, 94, 0.2)',
            fontSize: '0.8rem',
            color: 'rgba(255,255,255,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <div>
            <span>目前 Token 綁定帳號：</span>
            <strong style={{ color: '#4ade80' }}>{tokenAccountName || '已配置自訂 Token'}</strong>
            {tokenChannelHandle && <span style={{ opacity: 0.7, marginLeft: 4 }}>({tokenChannelHandle})</span>}
            {tokenUpdatedAt && (
              <span style={{ opacity: 0.5, marginLeft: 8 }}>
                （更新於 {new Date(tokenUpdatedAt).toLocaleDateString()}）
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => handleValidate()}
              disabled={validating || saving}
              style={{ padding: '2px 8px', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              {validating ? <Loader2 size={12} className="spin" /> : <ShieldCheck size={12} />}
              檢測有效性
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleClear}
              disabled={validating || saving}
              style={{
                color: 'var(--color-danger, #ef4444)',
                padding: '2px 8px',
                fontSize: '0.75rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Trash2 size={12} /> 清除
            </button>
          </div>
        </div>
      )}

      {/* DevTools Quick Guide (Collapsible) */}
      {showGuide && (
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 8,
            padding: '12px 14px',
            marginBottom: 12,
            fontSize: '0.825rem',
            lineHeight: 1.5,
          }}
        >
          <div
            style={{
              fontWeight: 600,
              color: 'var(--primary, #38bdf8)',
              marginBottom: 6,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Code2 size={15} /> 3 步驟快速取得（最推薦 Copy as cURL）
          </div>
          <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <li>
              開啟{' '}
              <a
                href="https://music.youtube.com"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--primary, #38bdf8)', textDecoration: 'underline' }}
              >
                music.youtube.com <ExternalLink size={11} style={{ verticalAlign: 'middle' }} />
              </a>{' '}
              並確認已登入 Google 帳號。
            </li>
            <li>
              按下鍵盤{' '}
              <kbd
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  padding: '1px 5px',
                  borderRadius: 3,
                  border: '1px solid rgba(255,255,255,0.15)',
                }}
              >
                F12
              </kbd>{' '}
              開啟開發者工具 ➔ 切換至 <strong>Network (網路)</strong> 標籤頁。
            </li>
            <li>
              在 YouTube Music 頁面上隨意點任一歌單或歌曲，於 Network 面板任一請求點右鍵 ➔ <strong>Copy</strong> ➔ 選擇{' '}
              <strong>Copy as cURL (cmd/bash)</strong> 或 <strong>Copy as Node.js fetch</strong>。
            </li>
          </ol>
          <div style={{ marginTop: 8, color: '#f87171', fontSize: '0.775rem' }}>
            ⚠️ 注意：請避免選純前端「Copy as fetch」（瀏覽器會依安全規範剔除 Cookie）。選擇{' '}
            <strong>Copy as cURL</strong> 可 100% 完整附帶認證。
          </div>
        </div>
      )}

      {/* Validation Result Banner */}
      {validationResult && (
        <div
          style={{
            marginBottom: 12,
            padding: '10px 14px',
            borderRadius: 6,
            border: validationResult.valid ? '1px solid rgba(74, 222, 128, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
            background: validationResult.valid ? 'rgba(74, 222, 128, 0.08)' : 'rgba(239, 68, 68, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {validationResult.valid ? (
              <CheckCircle2 size={16} color="#4ade80" />
            ) : (
              <AlertCircle size={16} color="#f87171" />
            )}
            <div>
              <div
                style={{ fontWeight: 600, fontSize: '0.85rem', color: validationResult.valid ? '#4ade80' : '#f87171' }}
              >
                {validationResult.valid ? 'Token 驗證成功' : 'Token 驗證失敗'}
              </div>
              <div style={{ fontSize: '0.775rem', color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>
                {validationResult.message}
                {validationResult.accountName && (
                  <span style={{ marginLeft: 6, opacity: 0.9 }}>
                    （認證帳號：<strong>{validationResult.accountName}</strong>
                    {validationResult.channelHandle ? ` - ${validationResult.channelHandle}` : ''}）
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setValidationResult(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255,255,255,0.5)',
              cursor: 'pointer',
              padding: 2,
            }}
            aria-label="關閉驗證訊息"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Input textarea */}
      <div className="form-group" style={{ margin: '0 0 10px 0' }}>
        <textarea
          className="form-input"
          rows={3}
          value={tokenInput}
          onChange={(e) => setTokenInput(e.target.value)}
          placeholder="在此貼上右鍵複製的『Copy as cURL』、『Copy as Node.js fetch』或 Cookie 字串…"
          style={{ fontFamily: 'monospace', fontSize: '0.825rem', width: '100%', lineHeight: 1.4, resize: 'vertical' }}
          disabled={saving || validating}
        />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={handleSave}
          disabled={saving || validating || !tokenInput.trim()}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          {saving ? <Loader2 size={13} className="spin" /> : <Key size={13} />}
          {saving ? '啟用中…' : '儲存並啟用 0 配額模式'}
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => handleValidate(tokenInput.trim())}
          disabled={saving || validating || !tokenInput.trim()}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          {validating ? <Loader2 size={13} className="spin" /> : <ShieldCheck size={13} />}
          測試此 Token
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} style={{ marginLeft: 'auto' }}>
          取消
        </button>
      </div>
    </div>
  );
}
