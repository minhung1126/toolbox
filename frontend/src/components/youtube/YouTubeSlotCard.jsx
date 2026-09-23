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
          <Youtube size={20} color="#ff4d6d" />
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
          className="btn btn-secondary btn-sm"
          onClick={() => handleOpenEditSlot(slot)}
          style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem' }}
        >
          <Key size={13} /> {record.configured ? '修改憑證' : '配置憑證'}
        </button>
      </div>

      {editingSlot === slot && (
        <div
          style={{
            background: 'rgba(0, 0, 0, 0.25)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '8px',
            padding: '1rem',
            marginTop: '0.75rem',
          }}
        >
          <h4
            style={{
              fontSize: '0.9rem',
              fontWeight: 600,
              marginBottom: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            <Key size={16} color="#60a5fa" /> 設定 {record.label} OAuth 憑證
          </h4>

          {slot === 'primary' && (
            <div style={{ marginBottom: '0.85rem' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleUseSystemOAuthForPrimary}
                disabled={savingSlotCreds}
                style={{
                  width: '100%',
                  marginBottom: '0.5rem',
                  background: 'rgba(59, 130, 246, 0.15)',
                  borderColor: '#3b82f6',
                  color: '#93c5fd',
                }}
              >
                ✓ 一鍵共用控制台 Google OAuth 憑證
              </button>
              <div style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                — 或填寫自訂獨立憑證 —
              </div>
            </div>
          )}

          {slot === 'secondary' && (
            <div style={{ marginBottom: '0.75rem' }}>
              <label
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}
              >
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div>
              <label
                style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}
              >
                槽位顯示名稱 (Label)
              </label>
              <input
                type="text"
                className="form-input"
                value={slotLabel}
                onChange={(e) => setSlotLabel(e.target.value)}
                placeholder="例如：Primary 或 Secondary"
                disabled={savingSlotCreds}
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label
                style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}
              >
                OAuth Client ID
              </label>
              <input
                type="text"
                className="form-input"
                value={slotClientId}
                onChange={(e) => setSlotClientId(e.target.value)}
                placeholder="請填寫 Google Cloud Console OAuth Client ID"
                disabled={savingSlotCreds}
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label
                style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}
              >
                OAuth Client Secret
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showSlotSecret ? 'text' : 'password'}
                  className="form-input"
                  value={slotClientSecret}
                  onChange={(e) => setSlotClientSecret(e.target.value)}
                  placeholder="••••••••••••••••（輸入可覆蓋更新）"
                  disabled={savingSlotCreds}
                  style={{ width: '100%', paddingRight: '2.5rem' }}
                />
                <button
                  type="button"
                  onClick={() => setShowSlotSecret(!showSlotSecret)}
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
                  {showSlotSecret ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {isSlotCredsDirty(slot) && (
              <div
                className="info-banner warning-banner"
                style={{
                  background: 'rgba(245, 158, 11, 0.12)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  color: '#fbbf24',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  marginTop: '0.5rem',
                }}
              >
                <AlertCircle size={15} />
                <span>槽位憑證設定已修改（尚未保存）。請記得點擊右下方的「儲存設定」按鈕！</span>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.25rem' }}>
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
                margin: '0.75rem 0',
              }}
            >
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
                  <span className="login-spinner"></span> 處理中...
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
