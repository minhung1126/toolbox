import React from 'react';
import { AlertCircle, CheckCircle2, ExternalLink, Eye, EyeOff, Key, Save, XCircle, Youtube } from 'lucide-react';
import { YOUTUBE_ROUTING_MODES } from '../../utils/youtubeRouting';
import { formatTokenDate, tokenStatusLabel } from '../../utils/formatters';

export default function YouTubeSlotCard({
  slot,
  record,
  draft,
  isActive,
  isPrimaryPreferred,
  busy,
  editingSlot,
  handleOpenEditSlot,
  handleUseSystemOAuthForPrimary,
  slotEnabled,
  setSlotEnabled,
  slotLabel,
  setSlotLabel,
  slotClientId,
  setSlotClientId,
  slotClientSecret,
  setSlotClientSecret,
  showSlotSecret,
  setShowSlotSecret,
  isSlotCredsDirty,
  setEditingSlot,
  handleSaveSlotCreds,
  savingSlotCreds,
  showConnections,
  showQuota,
  updateDraft,
  isQuotaDirty,
  startOAuth,
  activateSlot,
  requestDisconnect,
  saveSlot,
  pageBusy,
  authorizationBusy,
  routingMode,
}) {
  return (
    <section className="glass-panel card-padding settings-card card-stack" key={slot}>
      <div className="card-header">
        <div className="card-header-title">
          <Youtube size={20} className="youtube-slot-icon" aria-hidden="true" />
          <h2 className="settings-heading">{record.label}</h2>
        </div>
        {isActive && <span className="badge badge-info">目前作用中</span>}
        {isPrimaryPreferred && <span className="badge badge-info">Auto 優先</span>}
        {record.authenticated ? (
          <span className="badge badge-connected">
            <CheckCircle2 size={14} /> 已授權
          </span>
        ) : (
          <span className="badge badge-disconnected">
            <XCircle size={14} /> {record.configured ? '尚未授權' : '未配置'}
          </span>
        )}
        <button
          type="button"
          className="btn btn-secondary btn-sm youtube-slot-edit-button"
          onClick={() => handleOpenEditSlot(slot)}
        >
          <Key size={13} /> {record.configured ? '修改憑證' : '配置憑證'}
        </button>
      </div>

      {editingSlot === slot && (
        <div className="youtube-slot-editor">
          <h4 className="youtube-slot-editor-title">
            <Key size={16} aria-hidden="true" /> 設定 {record.label} OAuth 憑證
          </h4>

          {slot === 'primary' && (
            <div className="youtube-slot-system-oauth">
              <button
                type="button"
                className="btn btn-secondary btn-sm youtube-slot-system-oauth-button"
                onClick={handleUseSystemOAuthForPrimary}
                disabled={savingSlotCreds}
              >
                ✓ 一鍵共用控制台 Google OAuth 憑證
              </button>
              <div className="youtube-slot-oauth-divider">— 或填寫自訂獨立憑證 —</div>
            </div>
          )}

          {slot === 'secondary' && (
            <div className="youtube-slot-secondary-option">
              <label className="youtube-slot-checkbox-label">
                <input
                  type="checkbox"
                  checked={slotEnabled}
                  onChange={(e) => setSlotEnabled(e.target.checked)}
                  disabled={savingSlotCreds}
                />
                啟用此 Secondary 備用槽位
              </label>
            </div>
          )}

          <div className="youtube-slot-fields">
            <div>
              <label className="youtube-slot-field-label" htmlFor={`${slot}-label`}>
                槽位顯示名稱 (Label)
              </label>
              <input
                id={`${slot}-label`}
                type="text"
                className="form-input"
                value={slotLabel}
                onChange={(e) => setSlotLabel(e.target.value)}
                placeholder="例如：Primary 或 Secondary"
                disabled={savingSlotCreds}
              />
            </div>

            <div>
              <label className="youtube-slot-field-label" htmlFor={`${slot}-client-id`}>
                OAuth Client ID
              </label>
              <input
                id={`${slot}-client-id`}
                type="text"
                className="form-input"
                value={slotClientId}
                onChange={(e) => setSlotClientId(e.target.value)}
                placeholder="請填寫 Google Cloud Console OAuth Client ID"
                disabled={savingSlotCreds}
              />
            </div>

            <div>
              <label className="youtube-slot-field-label" htmlFor={`${slot}-client-secret`}>
                OAuth Client Secret
              </label>
              <div className="youtube-slot-secret-field">
                <input
                  id={`${slot}-client-secret`}
                  type={showSlotSecret ? 'text' : 'password'}
                  className="form-input youtube-slot-secret-input"
                  value={slotClientSecret}
                  onChange={(e) => setSlotClientSecret(e.target.value)}
                  placeholder="••••••••••••••••（輸入可覆蓋更新）"
                  disabled={savingSlotCreds}
                />
                <button
                  type="button"
                  className="youtube-slot-secret-toggle"
                  aria-label={showSlotSecret ? '隱藏 OAuth Client Secret' : '顯示 OAuth Client Secret'}
                  aria-pressed={showSlotSecret}
                  onClick={() => setShowSlotSecret(!showSlotSecret)}
                >
                  {showSlotSecret ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {isSlotCredsDirty(slot) && (
              <div className="info-banner warning-banner youtube-slot-credentials-dirty">
                <AlertCircle size={15} />
                <span>槽位憑證設定已修改（尚未保存）。請記得點擊右下方的「儲存設定」按鈕！</span>
              </div>
            )}

            <div className="youtube-slot-editor-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setEditingSlot(null)}
                disabled={savingSlotCreds}
              >
                取消
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => handleSaveSlotCreds(slot)}
                disabled={savingSlotCreds}
              >
                {savingSlotCreds ? '儲存中...' : '儲存設定'}
              </button>
            </div>
          </div>
        </div>
      )}

      {!record.configured && (
        <div className="info-banner">
          <XCircle size={16} />
          <span>此 slot 尚未由伺服器配置 OAuth Client；前端不會接觸 client secret。</span>
        </div>
      )}
      {record.channel_mismatch && (
        <div className="info-banner">
          <XCircle size={16} />
          <span>此 slot 的 Channel ID 與另一個 slot 不一致，因此不能設為作用中；請重新授權同一頻道。</span>
        </div>
      )}

      <div className="settings-grid">
        <div className="glass-panel settings-info-card">
          <strong>Google 帳號</strong>
          <p>{record.user?.email || '—'}</p>
        </div>
        <div className="glass-panel settings-info-card">
          <strong>YouTube Channel</strong>
          <p>{record.channel_title || record.channel_id || '尚未驗證'}</p>
        </div>
        <div className="glass-panel settings-info-card">
          <strong>Token 狀態</strong>
          <p>{tokenStatusLabel(record.token_status)}</p>
        </div>
        <div className="glass-panel settings-info-card">
          <strong>Token 到期</strong>
          <p>{formatTokenDate(record.token_expires_at)}</p>
        </div>
        <div className="glass-panel settings-info-card">
          <strong>最近 refresh</strong>
          <p>{formatTokenDate(record.last_refreshed_at)}</p>
        </div>
        <div className="glass-panel settings-info-card">
          <strong>Client fingerprint</strong>
          <p>{record.client_fingerprint || '—'}</p>
        </div>
      </div>
      {record.last_refresh_error && (
        <div className="info-banner">
          <XCircle size={16} />
          <span>Token refresh 失敗，請重新授權此 slot。</span>
        </div>
      )}

      {showQuota && (
        <>
          <div className="responsive-grid youtube-quota-grid">
            <div className="form-group">
              <label className="form-label" htmlFor={`${slot}-quota-limit`}>
                Project 一般配額
              </label>
              <input
                id={`${slot}-quota-limit`}
                className="form-input"
                type="number"
                min="1"
                step="1"
                value={draft.quotaLimit}
                onChange={(event) => updateDraft(slot, 'quotaLimit', event.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor={`${slot}-quota-buffer`}>
                安全保留單位
              </label>
              <input
                id={`${slot}-quota-buffer`}
                className="form-input"
                type="number"
                min="0"
                step="1"
                value={draft.quotaBuffer}
                onChange={(event) => updateDraft(slot, 'quotaBuffer', event.target.value)}
              />
            </div>
          </div>
          {isQuotaDirty(slot) && (
            <div className="info-banner warning-banner youtube-slot-quota-dirty">
              <AlertCircle size={16} />
              <span>
                您已修改 {record.label} 的配額設定（尚未儲存）。為避免過度消耗寫入資源，修改後請記得點擊右下方的「儲存
                slot 設定」按鈕！
              </span>
            </div>
          )}
          <p className="section-desc">
            此記錄只記錄 {record.label}；配額已達上限或安全上限時，只影響這個 slot。Auto 模式會在下一個 workflow
            開始時依配額選擇可用 slot。
          </p>
        </>
      )}

      <div className="page-actions settings-card-actions">
        {showConnections && (
          <>
            <button
              className="btn btn-primary"
              onClick={() => startOAuth(slot)}
              type="button"
              disabled={!record.configured || pageBusy || authorizationBusy}
            >
              {busy ? (
                <>
                  <span className="ui-inline-spinner" aria-hidden="true"></span> 處理中...
                </>
              ) : (
                <>
                  <ExternalLink size={16} /> {record.authenticated ? '重新授權' : '連結此 slot'}
                </>
              )}
            </button>
            {routingMode === YOUTUBE_ROUTING_MODES.MANUAL && record.can_be_active && !isActive && (
              <button
                className="btn btn-secondary"
                onClick={() => activateSlot(slot)}
                type="button"
                disabled={pageBusy || authorizationBusy}
              >
                設為作用中
              </button>
            )}
            {record.authenticated && (
              <button
                className="btn"
                onClick={() => requestDisconnect(slot)}
                type="button"
                disabled={pageBusy || authorizationBusy}
              >
                斷開
              </button>
            )}
          </>
        )}
        {showQuota && (
          <button className="btn btn-success" onClick={() => saveSlot(slot)} type="button" disabled={pageBusy}>
            <Save size={16} />
            儲存 slot 設定
          </button>
        )}
      </div>
    </section>
  );
}
