import { Clock, ExternalLink, RefreshCw } from 'lucide-react';
import './WeverseUploadHistory.css';

function uploadStatus(item) {
  if (item.status === 'completed') return <span className="badge badge-connected">已完成</span>;
  if (item.status === 'failed') return <span className="badge badge-disconnected">失敗</span>;
  if (['pending', 'uploading_video', 'uploading_captions'].includes(item.status)) {
    return <span className="badge badge-warning">上傳中</span>;
  }
  return <span className="badge badge-info">{item.status || '未知'}</span>;
}

function formatCreatedAt(value) {
  return value ? new Date(value).toLocaleString() : '-';
}

export default function WeverseUploadHistory({ items = [], loading = false, onRefresh }) {
  return (
    <section className="glass-panel weverse-upload-history" aria-labelledby="weverse-history-title">
      <div className="weverse-upload-history-header">
        <h2 id="weverse-history-title" className="weverse-upload-history-title">
          <Clock size={18} aria-hidden="true" /> 近期上傳紀錄
        </h2>
        <button
          type="button"
          className="btn btn-sm btn-secondary"
          onClick={onRefresh}
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
          重新整理
        </button>
      </div>

      {items.length === 0 ? (
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
                  <td><span className="badge badge-secondary">{item.privacy_status || 'private'}</span></td>
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
