import React from 'react';
import { AlertCircle, Save } from 'lucide-react';
import { YOUTUBE_ROUTING_MODES, youtubeRoutingLabel } from '../../utils/youtubeRouting';

export default function YouTubeRoutingSection({
  routingMode,
  routingModeDraft,
  setRoutingModeDraft,
  isRoutingDirty,
  saveRoutingMode,
  pageBusy,
  busyAction,
}) {
  return (
    <section className="glass-panel card-padding settings-card card-stack">
      <div className="card-header">
        <div>
          <h2 className="settings-heading">YouTube slot 使用優先順序</h2>
          <p className="section-desc">
            目前模式：{youtubeRoutingLabel(routingMode)}。Auto 模式會以本次 workflow 的保守配額預估選擇可用 slot，並在
            Primary 恢復後自動優先回到 Primary。
          </p>
        </div>
        <span className="badge badge-info">{youtubeRoutingLabel(routingMode)}</span>
      </div>
      <div className="settings-grid">
        <div className="form-group">
          <label className="form-label" htmlFor="youtube-routing-mode">
            路由模式 (Routing Mode)
          </label>
          <select
            id="youtube-routing-mode"
            className="form-select"
            value={routingModeDraft}
            onChange={(event) => setRoutingModeDraft(event.target.value)}
          >
            <option value={YOUTUBE_ROUTING_MODES.AUTO_PRIMARY}>Auto：Primary 優先，配額不足時 Secondary</option>
            <option value={YOUTUBE_ROUTING_MODES.MANUAL}>手動：只使用目前作用中 slot</option>
          </select>
        </div>
        <div className="glass-panel settings-info-card">
          <strong>切換邊界</strong>
          <p>
            {routingModeDraft === YOUTUBE_ROUTING_MODES.AUTO_PRIMARY
              ? '每個新的 request／preview 會先選擇可用 slot；執行途中若 quota 不足，會自動切換另一個 slot 並重試目前操作。'
              : '只使用下方標示的目前作用中 slot，不會自動 fallback。'}
          </p>
        </div>
      </div>
      {isRoutingDirty && (
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
            marginTop: '0.75rem',
          }}
        >
          <AlertCircle size={16} />
          <span>
            您已將路由模式切換為「{youtubeRoutingLabel(routingModeDraft)}
            」（尚未儲存）。請記得點擊下方「儲存使用模式」按鈕完成保存！
          </span>
        </div>
      )}
      <div className="page-actions settings-card-actions">
        <button
          className="btn btn-success"
          type="submit"
          onClick={saveRoutingMode}
          disabled={pageBusy || !isRoutingDirty}
        >
          <Save size={18} />
          {busyAction?.kind === 'routing' ? '儲存中...' : '儲存使用模式'}
        </button>
      </div>
    </section>
  );
}
