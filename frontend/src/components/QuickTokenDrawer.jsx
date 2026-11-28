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
import { isAmbiguousYtmusicSettingsMutation, ytmusicSettingsApi } from '../features/ytmusic/api/ytmusicSettingsApi';
import ConfirmDialog from './ConfirmDialog';
import { useToast } from './Toast';
import '../features/ytmusic/quick-token-drawer.css';

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
  const [tokenMutationUncertain, setTokenMutationUncertain] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [showGuide, setShowGuide] = useState(false);

  if (!isOpen) return null;

  const busy = saving || validating || tokenMutationUncertain;

  const handleValidate = async (tokenToTest = null) => {
    if (saving || validating) return;
    const raw = (tokenToTest !== null ? tokenToTest : tokenInput).trim();
    setValidating(true);
    setValidationResult(null);
    try {
      const res = await ytmusicSettingsApi.validate(raw || null);
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
    if (busy) return;
    const trimmed = tokenInput.trim();
    if (!trimmed) {
      toast.warning('請先貼入 Cookie、cURL 或 Node.js fetch 代碼');
      return;
    }
    setSaving(true);
    try {
      await ytmusicSettingsApi.save(trimmed);
      toast.success('YouTube Music 瀏覽器 Token 已成功啟用（0 配額模式）！');
      setTokenInput('');
      setValidationResult(null);
      if (onTokenSaved) {
        try {
          await onTokenSaved();
        } catch {
          toast.warning('Token 已儲存，但授權狀態無法重新讀取；請重新整理頁面。');
        }
      }
    } catch (err) {
      if (isAmbiguousYtmusicSettingsMutation(err)) {
        setTokenMutationUncertain(true);
        toast.error('無法確認 Token 是否已儲存；請先核對授權狀態，勿直接重送。');
        try {
          await onTokenSaved?.();
          if (onTokenSaved) setTokenMutationUncertain(false);
        } catch {
          // Keep uncertain lock when status refresh fails.
        }
      } else {
        toast.error(`儲存 Token 失敗：${err.message || '格式不正確'}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmClear = async () => {
    if (busy) return;
    setShowClearConfirm(false);
    setSaving(true);
    try {
      await ytmusicSettingsApi.clear();
      toast.success('已清除自訂 Token，將改用 Google API 模式');
      setValidationResult(null);
      if (onTokenCleared) {
        try {
          await onTokenCleared();
        } catch {
          toast.warning('Token 已清除，但授權狀態無法重新讀取；請重新整理頁面。');
        }
      }
    } catch (err) {
      if (isAmbiguousYtmusicSettingsMutation(err)) {
        setTokenMutationUncertain(true);
        toast.error('無法確認 Token 是否已清除；請先核對授權狀態，勿直接重送。');
        try {
          await onTokenCleared?.();
          if (onTokenCleared) setTokenMutationUncertain(false);
        } catch {
          // Keep uncertain lock when status refresh fails.
        }
      } else {
        toast.error(`清除 Token 失敗：${err.message || '未知錯誤'}`);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="quick-token-drawer" data-testid="quick-token-drawer">
      {/* Header */}
      <div className="quick-token-header">
        <div className="quick-token-heading">
          <Key size={18} className="quick-token-heading-icon" aria-hidden="true" />
          <strong className="quick-token-heading-title">YouTube Music 瀏覽器 Token 快速配置（0 配額模式）</strong>
          {hasCustomToken && (
            <span className="badge badge-connected quick-token-active-badge">
              <CheckCircle2 size={11} /> 目前已啟用
            </span>
          )}
        </div>
        <div className="quick-token-header-actions">
          <button
            type="button"
            onClick={() => setShowGuide(!showGuide)}
            className="btn btn-secondary btn-sm quick-token-header-button"
          >
            <HelpCircle size={13} />
            {showGuide ? '收合教學' : '如何取得 Token？'}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="收合面板"
            className="btn btn-secondary btn-sm quick-token-header-button quick-token-collapse-button"
          >
            <ChevronUp size={14} /> 收合面板
          </button>
        </div>
      </div>

      {/* Current token metadata pill if active */}
      {hasCustomToken && (
        <div className="quick-token-metadata">
          <div>
            <span>目前 Token 綁定帳號：</span>
            <strong className="quick-token-account-name">{tokenAccountName || '已配置自訂 Token'}</strong>
            {tokenChannelHandle && <span className="quick-token-channel-handle">({tokenChannelHandle})</span>}
            {tokenUpdatedAt && (
              <span className="quick-token-updated-at">（更新於 {new Date(tokenUpdatedAt).toLocaleDateString()}）</span>
            )}
          </div>
          <div className="quick-token-metadata-actions">
            <button
              type="button"
              onClick={() => handleValidate()}
              disabled={validating || saving}
              className="btn btn-secondary btn-sm quick-token-small-button"
            >
              {validating ? <Loader2 size={12} className="spin" /> : <ShieldCheck size={12} />}
              檢測有效性
            </button>
            <button
              type="button"
              onClick={() => setShowClearConfirm(true)}
              disabled={busy}
              className="btn btn-secondary btn-sm quick-token-small-button quick-token-clear-button"
            >
              <Trash2 size={12} /> 清除
            </button>
          </div>
        </div>
      )}

      {/* DevTools Quick Guide (Collapsible) */}
      {showGuide && (
        <div className="quick-token-guide">
          <div className="quick-token-guide-title">
            <Code2 size={15} /> 3 步驟快速取得（最推薦 Copy as cURL）
          </div>
          <ol className="quick-token-guide-steps">
            <li>
              開啟{' '}
              <a
                href="https://music.youtube.com"
                target="_blank"
                rel="noopener noreferrer"
                className="quick-token-guide-link"
              >
                music.youtube.com <ExternalLink size={11} aria-hidden="true" />
              </a>{' '}
              並確認已登入 Google 帳號。
            </li>
            <li>
              按下鍵盤 <kbd className="quick-token-keyboard-key">F12</kbd> 開啟開發者工具 ➔ 切換至{' '}
              <strong>Network (網路)</strong> 標籤頁。
            </li>
            <li>
              在 YouTube Music 頁面上隨意點任一歌單或歌曲，於 Network 面板任一請求點右鍵 ➔ <strong>Copy</strong> ➔ 選擇{' '}
              <strong>Copy as cURL (cmd/bash)</strong> 或 <strong>Copy as Node.js fetch</strong>。
            </li>
          </ol>
          <div className="quick-token-guide-warning">
            ⚠️ 注意：請避免選純前端「Copy as fetch」（瀏覽器會依安全規範剔除 Cookie）。選擇{' '}
            <strong>Copy as cURL</strong> 可 100% 完整附帶認證。
          </div>
        </div>
      )}

      {/* Validation Result Banner */}
      {validationResult && (
        <div
          className={`quick-token-validation ${validationResult.valid ? 'quick-token-validation-valid' : 'quick-token-validation-invalid'}`}
        >
          <div className="quick-token-validation-content">
            {validationResult.valid ? (
              <CheckCircle2 size={16} className="quick-token-validation-icon" aria-hidden="true" />
            ) : (
              <AlertCircle size={16} className="quick-token-validation-icon" aria-hidden="true" />
            )}
            <div className="quick-token-validation-copy">
              <div>
                <div className="quick-token-validation-title">
                  {validationResult.valid ? 'Token 驗證成功' : 'Token 驗證失敗'}
                </div>
                <div className="quick-token-validation-message">
                  {validationResult.message}
                  {validationResult.accountName && (
                    <span className="quick-token-validation-account">
                      （認證帳號：<strong>{validationResult.accountName}</strong>
                      {validationResult.channelHandle ? ` - ${validationResult.channelHandle}` : ''}）
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setValidationResult(null)}
            className="quick-token-dismiss"
            aria-label="關閉驗證訊息"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}

      {tokenMutationUncertain && (
        <div className="quick-token-validation quick-token-validation-invalid" role="alert">
          <div className="quick-token-validation-content">
            <AlertCircle size={16} className="quick-token-validation-icon" aria-hidden="true" />
            <div className="quick-token-validation-copy">
              <div className="quick-token-validation-title">無法確認 Token 變更結果</div>
              <div className="quick-token-validation-message">請先重新整理或核對帳號授權狀態後再操作。</div>
            </div>
          </div>
        </div>
      )}

      {/* Input textarea */}
      <div className="form-group quick-token-textarea-group">
        <textarea
          rows={3}
          value={tokenInput}
          onChange={(e) => setTokenInput(e.target.value)}
          placeholder="在此貼上右鍵複製的『Copy as cURL』、『Copy as Node.js fetch』或 Cookie 字串…"
          className="form-input quick-token-textarea"
          disabled={busy}
        />
      </div>

      {/* Actions */}
      <div className="quick-token-actions">
        <button
          type="button"
          onClick={handleSave}
          disabled={busy || !tokenInput.trim()}
          className="btn btn-primary btn-sm quick-token-action"
        >
          {saving ? <Loader2 size={13} className="spin" /> : <Key size={13} />}
          {saving ? '啟用中…' : '儲存並啟用 0 配額模式'}
        </button>
        <button
          type="button"
          onClick={() => handleValidate(tokenInput.trim())}
          disabled={saving || validating || !tokenInput.trim()}
          className="btn btn-secondary btn-sm quick-token-action"
        >
          {validating ? <Loader2 size={13} className="spin" /> : <ShieldCheck size={13} />}
          測試此 Token
        </button>
        <button type="button" className="btn btn-secondary btn-sm quick-token-cancel" onClick={onClose}>
          取消
        </button>
      </div>

      <ConfirmDialog
        open={showClearConfirm}
        title="清除自訂 Token"
        message="確定要清除 YouTube Music 自訂 Token 嗎？清除後將改用 Google OAuth / API 模式。"
        confirmText="確認清除"
        cancelText="取消"
        variant="destructive"
        busy={saving}
        onConfirm={handleConfirmClear}
        onCancel={() => {
          if (!saving) setShowClearConfirm(false);
        }}
      />
    </div>
  );
}
