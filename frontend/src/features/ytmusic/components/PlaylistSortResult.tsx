import { ExternalLink } from 'lucide-react';
import { StatusMessage } from '../../../components/StatusMessage';
import type { PlaylistSortApplyResponse } from '../api/types';
export default function PlaylistSortResult({ applyResult }: { applyResult: PlaylistSortApplyResponse }) {
  return (
    <section className="glass-panel card-padding">
      <StatusMessage
        action={undefined}
        status={undefined}
        tone={applyResult.failed > 0 ? 'warning' : 'success'}
        title={applyResult.failed > 0 ? '排序完成（有部分失敗）' : '排序成功套用'}
      >
        <div>
          <span>
            {applyResult.mode === 'new_playlist' ? '成功加入' : '成功移動'} <strong>{applyResult.succeeded}</strong>{' '}
            首，
            {applyResult.failed > 0 && (
              <>
                失敗 <strong>{applyResult.failed}</strong> 首，
              </>
            )}
            消耗 <strong>{applyResult.quota_used?.toLocaleString() ?? 0}</strong> API 配額點數。
          </span>
          {applyResult.failed_items.length > 0 && (
            <div className="playlist-sort-failed-items">
              <strong>需要核對的曲目</strong>
              <ul>
                {applyResult.failed_items.map((item, index) => (
                  <li key={`${item.playlist_item_id || item.video_id}-${index}`}>
                    {item.playlist_item_id || item.video_id}：{item.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {applyResult.new_playlist_url && (
            <div className="playlist-sort-result-link-row">
              <a
                href={applyResult.new_playlist_url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary btn-sm playlist-sort-auth-action"
              >
                <ExternalLink size={14} /> 前往 YouTube Music 查看新歌單
              </a>
            </div>
          )}
        </div>
      </StatusMessage>
    </section>
  );
}
