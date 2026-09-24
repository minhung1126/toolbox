import React from 'react';
import { YOUTUBE_COPY, formatQuotaUnits, formatVideoCount } from '../../utils/youtubeCopy';

export default function BatchUpdateConfirmationContent({ batchPreview, previewCounts, quotaEstimate }) {
  return (
    <div className="confirm-content">
      <dl className="confirm-summary-list" aria-label="批次更新摘要">
        <div className="confirm-summary-item">
          <dt>預覽影片</dt>
          <dd>{formatVideoCount(batchPreview.length)}</dd>
        </div>
        <div className="confirm-summary-item">
          <dt>將更新</dt>
          <dd>{formatVideoCount(previewCounts.willUpdate)}</dd>
        </div>
        <div className="confirm-summary-item">
          <dt>沒有變更</dt>
          <dd>{formatVideoCount(previewCounts.unchanged)}</dd>
        </div>
        <div className="confirm-summary-item">
          <dt>略過</dt>
          <dd>{formatVideoCount(previewCounts.skipped)}</dd>
        </div>
        <div className="confirm-summary-item">
          <dt>失敗</dt>
          <dd>{formatVideoCount(previewCounts.failed)}</dd>
        </div>
      </dl>

      <section className="confirm-section" aria-labelledby="batch-confirm-operation-title">
        <h4 id="batch-confirm-operation-title">更新內容</h4>
        <p className="confirm-section-description">
          本次只會{YOUTUBE_COPY.updateMetadata}；標記為略過、沒有變更或失敗的影片不會送出更新。
        </p>
      </section>

      {quotaEstimate && (
        <section className="confirm-quota-panel" aria-labelledby="batch-confirm-quota-title">
          <h4 id="batch-confirm-quota-title">配額預估</h4>
          <dl className="confirm-summary-list confirm-summary-list-compact">
            <div className="confirm-summary-item">
              <dt>最壞估算</dt>
              <dd>{formatQuotaUnits(quotaEstimate.projected_units)}</dd>
            </div>
            <div className="confirm-summary-item">
              <dt>安全可用</dt>
              <dd>{formatQuotaUnits(quotaEstimate.effective_available_units)}</dd>
            </div>
            <div className="confirm-summary-item">
              <dt>預估結果</dt>
              <dd>{quotaEstimate.can_complete_today ? '預計可完成' : '可能需要分批處理'}</dd>
            </div>
          </dl>
        </section>
      )}

      <div className="confirm-risk-panel" role="note" aria-label="批次更新風險說明">
        <strong className="confirm-risk-title">風險與處理方式</strong>
        <ul>
          <li>執行前仍會驗證完整預覽；資料變更時會安全停止，不會套用舊計畫。</li>
          <li>若途中達到配額上限，未執行項目會保留在結果中，請於官方重設後重新讀取並送出。</li>
        </ul>
      </div>
    </div>
  );
}
