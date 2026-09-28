import { Clock, ExternalLink, RefreshCw } from 'lucide-react';
import { StatusMessage } from '../../components/StatusMessage';
import { Badge, Button } from '../../shared/ui';
import './WeverseUploadHistory.css';

function uploadStatus(item) {
  if (item.status === 'completed') return <Badge tone="success">已完成</Badge>;
  if (item.status === 'failed') return <Badge tone="danger">失敗</Badge>;
  if (item.status === 'interrupted') {
    return <Badge tone="warning">已中斷，請確認 YouTube 狀態</Badge>;
  }
  if (['pending', 'uploading_video', 'uploading_captions'].includes(item.status)) {
    return <Badge tone="warning">上傳中</Badge>;
  }
  return <Badge tone="info">{item.status || '未知'}</Badge>;
}

function formatCreatedAt(value) {
  return value ? new Date(value).toLocaleString() : '-';
}

export default function WeverseUploadHistory({ items = [], loading = false, error = '', onRefresh }) {
  return (
    <section className="glass-panel weverse-upload-history" aria-labelledby="weverse-history-title">
      <div className="weverse-upload-history-header">
        <h2 id="weverse-history-title" className="weverse-upload-history-title">
          <Clock size={18} aria-hidden="true" /> 近期上傳紀錄
        </h2>
        <Button variant="secondary" size="sm" onClick={onRefresh} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
          重新整理
        </Button>
      </div>

      {error ? (
        <StatusMessage tone="error" title="無法讀取上傳歷史">
          {error}
        </StatusMessage>
      ) : items.length === 0 ? (
        <p className="weverse-upload-history-empty" role="status">
          {loading ? '正在載入上傳紀錄…' : '尚未有任何上傳紀錄。'}
        </p>
      ) : (
        <div className="weverse-upload-history-table-wrap">
          <table className="weverse-upload-history-table">
            <thead>
              <tr>
                <th scope="col">標題 / 影片檔名</th>
                <th scope="col">隱私狀態</th>
                <th scope="col">字幕數</th>
                <th scope="col">狀態</th>
                <th scope="col">時間</th>
                <th scope="col">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.task_id}>
                  <td>
                    <div className="weverse-history-video-title">{item.title}</div>
                    <div className="weverse-history-video-filename">{item.video_filename}</div>
                  </td>
                  <td>
                    <Badge>{item.privacy_status || 'private'}</Badge>
                  </td>
                  <td>{item.subtitles_count || 0}</td>
                  <td>{uploadStatus(item)}</td>
                  <td className="weverse-history-created-at">{formatCreatedAt(item.created_at)}</td>
                  <td>
                    {item.video_url && (
                      <a
                        href={item.video_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-sm btn-secondary weverse-history-video-link"
                      >
                        YouTube <ExternalLink size={12} aria-hidden="true" />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
