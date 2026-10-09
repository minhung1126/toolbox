import { useEffect, useRef, useState } from 'react';
import type { WeverseUploadTask } from '../api/types';
import { weverseUploadApi } from '../api/weverseUploadApi';
import { isActiveTask, pendingCaptionCount, uploadError } from '../model/taskState';
import { ResultExport } from '../../../shared/ui/ResultExport';

interface Props {
  task: WeverseUploadTask;
  connected: boolean;
  onQueued(id: string, title: string): void;
  onOpen(id: string): void;
  onReset(): void;
}
export default function UploadTaskDetails({ task, connected, onQueued, onOpen, onReset }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const active = isActiveTask(task);
  const pending = pendingCaptionCount(task);
  const captions = task.caption_results || [];
  const selectable = captions.filter((item) => item.status !== 'uploaded');
  const unknownSelected = selectable.filter(
    (item) => item.status === 'unknown' && files.some((file) => file.name === item.filename)
  );
  const validFiles = files.every((file) => selectable.some((item) => item.filename === file.name));
  const retry = async () => {
    if (inFlight.current || uncertain || !task.updated_at || !validFiles || (unknownSelected.length && !confirmed))
      return;
    inFlight.current = true;
    setBusy(true);
    setReview(false);
    setError('');
    const body = new FormData();
    body.append('expected_updated_at', task.updated_at);
    body.append('confirmed_missing', JSON.stringify(confirmed ? unknownSelected.map((item) => item.filename) : []));
    files.forEach((file) => body.append('subtitles', file));
    try {
      const result = await weverseUploadApi.retryCaptions(task.task_id, body);
      if (!mounted.current) return;
      onQueued(result.task_id, task.title);
    } catch (caught) {
      if (!mounted.current) return;
      const failure = uploadError(caught);
      if (!failure.status || failure.status >= 500) setUncertain(true);
      setError('無法確認字幕補傳是否啟動，請重新整理歷史並開啟最新任務核對。');
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const label = active
    ? '任務詳情'
    : task.status === 'completed'
      ? pending
        ? '上傳部分完成'
        : '上傳成功！'
      : '上傳狀態待核對';
  return (
    <section className="glass-panel card-padding card-stack weverse-task-details" aria-label="上傳任務詳情">
      <h2>{label}</h2>
      <p>{task.title}</p>
      {!active && task.status !== 'completed' && (
        <p role="alert">上傳狀態待核對：任務已停止，可能已有部分內容上傳。請先檢查上傳歷史與 YouTube Studio。</p>
      )}
      <p>{task.current_step}</p>
      <p>
        字幕成功：{captions.filter((item) => item.status === 'uploaded').length || task.uploaded_captions?.length || 0}
        ；待處理：{pending}；任務 ID：{task.task_id}
      </p>
      <div className="page-actions">
        {task.video_id && (
          <a
            className="btn btn-secondary"
            href={`https://studio.youtube.com/video/${encodeURIComponent(task.video_id)}/edit`}
            target="_blank"
            rel="noopener noreferrer"
          >
            在 YouTube Studio 編輯
          </a>
        )}
        {task.video_id && (
          <a
            className="btn btn-secondary"
            href={`https://youtu.be/${encodeURIComponent(task.video_id)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            在 YouTube 開啟影片
          </a>
        )}
        {task.retry_task_id && (
          <button className="btn btn-primary" onClick={() => onOpen(task.retry_task_id!)}>
            開啟後續補傳任務
          </button>
        )}
        {task.parent_task_id && (
          <button className="btn btn-secondary" onClick={() => onOpen(task.parent_task_id!)}>
            檢視原始任務
          </button>
        )}
      </div>
      {!!captions.length && (
        <ul>
          {captions.map((item) => (
            <li key={item.filename}>
              <strong>
                {item.language} · {item.filename}
              </strong>
              ：
              {
                { uploaded: '已完成', pending: '尚未執行', unknown: '結果待核對', missing_file: '缺少檔案' }[
                  item.status
                ]
              }
              {item.reconciled && '（已核對 YouTube）'}
            </li>
          ))}
        </ul>
      )}
      {!captions.length && !!task.failed_captions?.length && (
        <ul>
          {task.failed_captions.map((item, index) => (
            <li key={index}>{item.language}：字幕待處理，請至 YouTube Studio 檢查。</li>
          ))}
        </ul>
      )}
      {!!captions.length && (
        <ResultExport
          filename={`upload-${task.task_id}`}
          rows={captions.map((item) => ({
            id: item.filename,
            title: item.language,
            status: item.status,
            reason: item.error || '',
            url: task.video_id ? `https://youtu.be/${task.video_id}` : '',
          }))}
        />
      )}
      {!active && pending > 0 && task.video_id && task.updated_at && !task.retry_task_id && !!captions.length && (
        <fieldset disabled={busy || uncertain || !connected} className="card-stack">
          <legend>核對與補傳字幕</legend>
          <p>只處理這部影片的待處理字幕。可不選檔案先核對；補傳時請重新選取同名的 SRT／VTT 檔。</p>
          <label>
            選取待補傳字幕
            <input
              type="file"
              multiple
              accept=".srt,.vtt"
              onChange={(event) => {
                setFiles(Array.from(event.target.files || []));
                setConfirmed(false);
                setReview(false);
              }}
            />
          </label>
          {!validFiles && <p role="alert">所選檔案不在待處理字幕清單中。</p>}
          {!!unknownSelected.length && (
            <label>
              <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
              我已在 YouTube Studio 核對，所選的待核對字幕確實不存在，可以補傳。
            </label>
          )}
          <button
            className="btn btn-primary"
            disabled={!validFiles || (!!unknownSelected.length && !confirmed)}
            onClick={() => setReview(true)}
          >
            核對與補傳字幕
          </button>
          {review && (
            <div role="group" aria-label="確認字幕補傳" className="card-stack">
              <p>
                目標影片：{task.title}（{task.video_id}）。核對 {pending} 軌字幕，選取 {files.length} 個補傳檔案。
              </p>
              <button className="btn btn-primary" onClick={retry}>
                確認執行字幕核對與補傳
              </button>
              <button className="btn btn-secondary" onClick={() => setReview(false)}>
                取消
              </button>
            </div>
          )}
        </fieldset>
      )}
      {!connected && pending > 0 && <p>請連結原影片所屬頻道後補傳字幕。</p>}
      {error && <p role="alert">{error}</p>}
      {!active && (
        <button className="btn btn-secondary" onClick={onReset}>
          上傳另一部影片
        </button>
      )}
    </section>
  );
}
