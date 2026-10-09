import { Button } from '../../../shared/ui';
import {
  AlertCircle,
  CheckCircle2,
  Code2,
  ExternalLink,
  HelpCircle,
  Info,
  Key,
  Loader2,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { StatusMessage } from '../../../components/StatusMessage';
export default function YtmusicTokenSettings({
  hasCustomToken,
  tokenMutationUncertain,
  tokenValidationResult,
  validatingToken,
  savingToken,
  showTokenUpdateForm,
  customTokenInput,
  handleSaveCustomToken,
  setTokenValidationResult,
  handleValidateCustomToken,
  setShowTokenUpdateForm,
  setShowClearTokenConfirm,
  setCustomTokenInput,
}) {
  return (
    <div className="glass-panel card-padding settings-card card-stack">
      <div className="ytmusic-settings-card-header">
        <div>
          <h2 className="settings-heading ytmusic-settings-card-title">
            <Key size={20} aria-hidden="true" /> 自訂 YouTube Music 瀏覽器 Token／Cookie
          </h2>
          <p className="section-desc ytmusic-settings-card-description">
            支援直接貼上來自 music.youtube.com 的 <strong>Copy as fetch</strong>、<strong>Copy as cURL</strong>
            、Request Headers 或 Cookie。使用 Token 排序可讀取完整專輯與曲目序號且{' '}
            <strong>消耗 0 Google API 配額</strong>。
          </p>
        </div>
        {hasCustomToken && (
          <span className="badge badge-connected">
            <CheckCircle2 size={12} /> 自訂 Token 已啟用 (0 Quota 模式)
          </span>
        )}
      </div>

      {tokenMutationUncertain && (
        <StatusMessage tone="error" title="Token 狀態待核對">
          授權狀態重新讀取失敗；請重新整理頁面確認結果，再決定是否重新送出。
        </StatusMessage>
      )}

      {tokenValidationResult && (
        <div
          data-testid="token-validation-result"
          className={`ytmusic-token-validation${tokenValidationResult.valid ? ' ytmusic-token-validation-success' : ' ytmusic-token-validation-error'}`}
        >
          <div className="ytmusic-token-validation-summary">
            {tokenValidationResult.valid ? (
              <CheckCircle2 size={20} className="ytmusic-token-validation-icon" aria-hidden="true" />
            ) : (
              <AlertCircle size={20} className="ytmusic-token-validation-icon" aria-hidden="true" />
            )}
            <div>
              <div className="ytmusic-token-validation-title">
                {tokenValidationResult.valid ? 'Token 驗證成功' : 'Token 驗證失敗'}
              </div>
              <div className="ytmusic-token-validation-message">{tokenValidationResult.message}</div>
              {tokenValidationResult.account_name && (
                <div className="ytmusic-token-validation-account">
                  認證帳號：<strong>{tokenValidationResult.account_name}</strong>
                  {tokenValidationResult.channel_handle && ` (${tokenValidationResult.channel_handle})`}
                </div>
              )}
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            type="button"
            className="btn btn-secondary btn-sm ytmusic-token-validation-close"
            onClick={() => setTokenValidationResult(null)}
          >
            關閉
          </Button>
        </div>
      )}

      {hasCustomToken && (
        <div className="ytmusic-token-active-panel">
          <div>
            <strong className="ytmusic-token-active-title">
              <CheckCircle2 size={16} /> 已啟用自訂瀏覽器 Token
            </strong>
            <p className="ytmusic-token-active-description">
              系統將優先使用此 Token 進行 YouTube Music 播放清單與曲目操作。若 Cookie 逾期失效，可隨時重新貼上更新。
            </p>
          </div>
          <div className="ytmusic-token-active-actions">
            <Button
              variant="secondary"
              size="sm"
              type="button"
              className="btn btn-secondary btn-sm ytmusic-settings-inline-button"
              onClick={() => handleValidateCustomToken()}
              disabled={validatingToken || savingToken}
            >
              {validatingToken ? <Loader2 size={14} className="spin" /> : <ShieldCheck size={14} />}
              檢查目前 Token 有效性
            </Button>
            <Button
              variant="secondary"
              size="sm"
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setShowTokenUpdateForm(!showTokenUpdateForm)}
            >
              {showTokenUpdateForm ? '收合教學與輸入框' : '更換 / 重新設定 Token'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              type="button"
              className="btn btn-secondary btn-sm ytmusic-settings-inline-button ytmusic-token-clear-button"
              onClick={() => setShowClearTokenConfirm(true)}
              disabled={savingToken || validatingToken || tokenMutationUncertain}
            >
              <Trash2 size={14} /> 清除自訂 Token
            </Button>
          </div>
        </div>
      )}

      {(!hasCustomToken || showTokenUpdateForm) && (
        <div className="ytmusic-token-setup">
          {/* Step-by-Step DevTools Guide */}
          <div className="ytmusic-token-guide">
            <div className="ytmusic-token-guide-header">
              <div className="ytmusic-token-guide-title">
                <HelpCircle size={18} />
                <span>開發者工具 (F12) 快速獲取教學</span>
              </div>
              <span className="badge badge-info ytmusic-token-guide-badge">
                <Code2 size={12} /> 最推薦 Copy as cURL
              </span>
            </div>

            <div className="ytmusic-token-guide-steps">
              <div className="ytmusic-token-guide-step">
                <span className="ytmusic-token-guide-step-number">1</span>
                <div>
                  <strong>開啟 YouTube Music 並登入</strong>：在瀏覽器分頁中打開{' '}
                  <a
                    href="https://music.youtube.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ytmusic-token-guide-link"
                  >
                    music.youtube.com <ExternalLink size={12} />
                  </a>
                  ，確認右上角已登入個人 Google 帳號。
                </div>
              </div>

              <div className="ytmusic-token-guide-step">
                <span className="ytmusic-token-guide-step-number">2</span>
                <div>
                  <strong>開啟開發者工具 (DevTools)</strong>：在 YouTube Music 頁面上按下鍵盤{' '}
                  <kbd className="ytmusic-token-guide-key">F12</kbd>
                  （或在網頁任意處按右鍵選擇「檢查 / Inspect」），上方切換至 <strong>Network (網路)</strong> 標籤頁。
                </div>
              </div>

              <div className="ytmusic-token-guide-step">
                <span className="ytmusic-token-guide-step-number">3</span>
                <div>
                  <strong>觸發任一網路請求</strong>：在 YouTube Music 頁面上隨意點選任一歌單、歌曲或「媒體庫 /
                  Library」，Network 面板便會出現請求列表（可在上方篩選框輸入 <code>browse</code> 快速過濾定位）。
                </div>
              </div>

              <div className="ytmusic-token-guide-step">
                <span className="ytmusic-token-guide-step-number">4</span>
                <div className="ytmusic-token-guide-step-content">
                  <strong>右鍵直接複製（支援以下任一種方式，推薦方式一或方式二）：</strong>
                  <div className="ytmusic-token-guide-methods">
                    <div className="ytmusic-token-guide-method ytmusic-token-guide-method-recommended">
                      <div className="ytmusic-token-guide-method-title">
                        ⭐ 方式一（最簡單・最推薦）：Copy as Node.js fetch
                      </div>
                      <div className="ytmusic-token-guide-method-description">
                        在請求（如 <code>browse</code>）上點擊右鍵 ➔ <strong>Copy (複製)</strong> ➔{' '}
                        <strong>Copy as Node.js fetch</strong>，整段貼入下方即可！Node.js 版會完整附帶 Cookie
                        與所有認證。
                      </div>
                    </div>

                    <div className="ytmusic-token-guide-method ytmusic-token-guide-method-alternative">
                      <div className="ytmusic-token-guide-method-title">⭐ 方式二：Copy as cURL (cmd 或 bash)</div>
                      <div className="ytmusic-token-guide-method-description">
                        在請求上點擊右鍵 ➔ <strong>Copy</strong> ➔ <strong>Copy as cURL (cmd)</strong> 或{' '}
                        <strong>Copy as cURL (bash)</strong>，整段貼入即可（系統已支援 Windows <code>^</code> 轉義與{' '}
                        <code>-b</code> 標籤）。
                      </div>
                    </div>

                    <div className="ytmusic-token-guide-method">
                      <div className="ytmusic-token-guide-method-title">方式三：手動複製 Request Headers 或 Cookie</div>
                      <div className="ytmusic-token-guide-method-description">
                        點選該請求 ➔ 右側切換至 <strong>Headers (標頭)</strong> ➔ 滾動至{' '}
                        <strong>Request Headers</strong> ➔ 複製整段 Request Headers 或 <code>Cookie:</code> 欄位的值。
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="ytmusic-token-guide-warning">
              <Info size={16} className="ytmusic-token-guide-warning-icon" aria-hidden="true" />
              <div>
                <strong>⚠️ 為什麼不能用普通的「Copy as fetch」？</strong>
                <br />
                Chrome／Edge 的「Copy as fetch」是專門給瀏覽器內部 JavaScript 執行的，根據 W3C 瀏覽器安全規範會
                <strong>刻意移除 Cookie 標頭</strong>（改為 <code>{'credentials: "include"'}</code>
                ）。後端伺服器缺少登入 Cookie 就無法識別身分。
                <br />
                因此<strong>請務必選擇【Copy as cURL】</strong>，即可一鍵完整複製 Cookie 與認證！
              </div>
            </div>
          </div>

          {/* Input Form */}
          <div className="form-group ytmusic-token-form-group">
            <label className="form-label ytmusic-token-input-label" htmlFor="ytmusic-custom-token-input">
              <span>貼上 Token 代碼、cURL、Node.js fetch 或 Cookie</span>
              <span className="ytmusic-token-input-hint">支援 cURL / Node.js fetch / Headers / Cookie</span>
            </label>
            <textarea
              id="ytmusic-custom-token-input"
              className="form-input ytmusic-token-input"
              rows={4}
              placeholder="直接貼上右鍵『Copy as cURL (bash/cmd)』、『Copy as Node.js fetch』、Request Headers 或 Cookie 字串..."
              value={customTokenInput}
              onChange={(e) => setCustomTokenInput(e.target.value)}
              disabled={savingToken || validatingToken}
            />
          </div>
          <div className="ytmusic-token-form-actions">
            <Button
              variant="primary"
              size="sm"
              type="button"
              className="btn btn-primary btn-sm ytmusic-settings-inline-button"
              onClick={handleSaveCustomToken}
              disabled={savingToken || validatingToken || tokenMutationUncertain || !customTokenInput.trim()}
            >
              {savingToken ? <Loader2 size={14} className="spin" /> : <Key size={14} />}
              儲存自訂 Token
            </Button>
            <Button
              variant="secondary"
              size="sm"
              type="button"
              className="btn btn-secondary btn-sm ytmusic-settings-inline-button"
              onClick={() => handleValidateCustomToken(customTokenInput.trim())}
              disabled={savingToken || validatingToken || !customTokenInput.trim()}
            >
              {validatingToken ? <Loader2 size={14} className="spin" /> : <ShieldCheck size={14} />}
              檢查此 Token 是否有效
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
