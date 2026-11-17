import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { downloadJson } from '../utils/download';
const OPERATION_LABELS = {
  'youtube.metadata_update': '影片批次更新',
  'youtube.publish_cleanup': '公開並清理待發布清單',
  'youtube.playlist_sort': '音樂歌單排序',
};
const LABELS = {
  prepared: '計畫已受理',
  running: '執行中',
  completed: '已完成',
  partial: '部分完成',
  needs_reconciliation: '待核對',
  failed_before_write: '寫入前失敗',
};
export default function OperationsPage() {
  const [search] = useSearchParams();
  const [operations, setOperations] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setBusy(true);
    api
      .getOperations()
      .then((result) => {
        if (
          result?.version !== 1 ||
          !Array.isArray(result.operations) ||
          result.operations.some(
            (op) => !op || !LABELS[op.state] || typeof op.id !== 'string' || !Array.isArray(op.items)
          )
        )
          throw new Error('作業紀錄格式不正確。');
        if (active) {
          setOperations(result.operations);
          setError('');
        }
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [revision]);
  const reconcile = async (operation) => {
    setBusy(true);
    setError('');
    try {
      await api.reconcileOperation(operation.id, operation.kind);
      setRevision((value) => value + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const selected = search.get('id');
  return (
    <div className="section-gap">
      <h1>作業紀錄與對帳</h1>
      <p>
        顯示最近 100
        筆影片更新、發布與音樂排序作業。重新整理可查看已保存證據。對帳只讀取遠端資料，不會重送寫入；外部變更後讀回吻合，只代表目前狀態符合計畫。
      </p>
      <button className="btn btn-secondary" disabled={busy} onClick={() => setRevision((value) => value + 1)}>
        重新讀取紀錄
      </button>
      {error && <p role="alert">{error}</p>}
      {busy && <p role="status">讀取／核對中…</p>}
      {!busy && !operations.length && !error && <p>尚無作業紀錄。</p>}
      {operations.map((operation) => (
        <section className="glass-panel card-padding card-stack" key={operation.id}>
          <h2>
            {OPERATION_LABELS[operation.kind] || '作業'} · {LABELS[operation.state]}
          </h2>
          <p>
            {new Date(operation.created_at * 1000).toLocaleString('zh-TW')} · {operation.id}
          </p>
          <p>
            頻道：{operation.channel_id || '原連線'} ·{' '}
            {operation.items.filter((item) => item.state === 'completed').length} 個已知成功寫入階段，
            {
              operation.items.filter((item) => item.state === 'needs_reconciliation' || item.state === 'running').length
            }{' '}
            個待核對階段。
          </p>
          <div className="page-actions">
            <button
              className="btn btn-secondary"
              disabled={busy || operation.state === 'running'}
              onClick={() => reconcile(operation)}
            >
              讀取遠端並核對
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => downloadJson(`operation-${operation.id}.json`, operation)}
            >
              匯出作業證據
            </button>
          </div>
          <details open={operation.id === selected}>
            <summary>已核對計畫與逐項證據</summary>
            <pre className="operation-evidence">{JSON.stringify(operation, null, 2)}</pre>
          </details>
        </section>
      ))}
    </div>
  );
}
