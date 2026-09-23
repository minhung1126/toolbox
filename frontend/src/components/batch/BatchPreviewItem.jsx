import React from 'react';
import { getBatchPreviewStatus } from '../../utils/batchPreview';
import { formatVideoId } from '../../utils/youtubeCopy';
import PreviewComparisonField from './PreviewComparisonField';

export default function BatchPreviewItem({ item, index }) {
  const previewStatus = getBatchPreviewStatus(item);
  const videoId = item.videoId || item.video_id;
  const currentTitle = item.currentTitle || '';
  const currentDescription = item.currentDescription || '';
  const nextTitle = item.newTitle || '';
  const nextDescription = item.newDescription || '';
  const nextEmptyLabel = previewStatus.key === 'willUpdate' ? '（空白）' : '（未套用）';
  return (
    <article className={`batch-preview-item batch-preview-item-${previewStatus.key}`}>
      <div className="batch-preview-item-heading">
        <div className="batch-preview-item-title">
          <span className="batch-preview-item-index">#{index + 1}</span>
          <strong>{currentTitle || videoId || '無標題影片'}</strong>
        </div>
        <span className={`batch-preview-status batch-preview-status-${previewStatus.tone}`}>{previewStatus.label}</span>
      </div>
      <div className="batch-preview-item-meta">
        <span>{formatVideoId(videoId)}</span>
        <span>人物：{item.person || '未指定'}</span>
      </div>
      <div className="batch-preview-comparison" aria-label={`第 ${index + 1} 支影片的標題與描述比較`}>
        <div className="batch-preview-column batch-preview-column-current">
          <h4>目前內容</h4>
          <PreviewComparisonField label="目前標題" value={currentTitle} emptyLabel="（空白）" />
          <PreviewComparisonField label="目前描述" value={currentDescription} emptyLabel="（空白）" multiline />
        </div>
        <div className="batch-preview-arrow" aria-hidden="true">
          →
        </div>
        <div className="batch-preview-column batch-preview-column-next">
          <h4>更新後內容</h4>
          <PreviewComparisonField label="更新後標題" value={nextTitle} emptyLabel={nextEmptyLabel} />
          <PreviewComparisonField label="更新後描述" value={nextDescription} emptyLabel={nextEmptyLabel} multiline />
        </div>
      </div>
      {previewStatus.key !== 'willUpdate' && (
        <div className={`batch-preview-reason batch-preview-reason-${previewStatus.tone}`}>
          <strong>{previewStatus.label}</strong>
          {item.reason && <span>原因：{item.reason}</span>}
        </div>
      )}
    </article>
  );
}
