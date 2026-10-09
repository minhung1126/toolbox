import { useState } from 'react';
import { downloadResults } from '../model/resultExport';
import type { ExportRow } from '../model/resultExport';
export function ResultExport({ filename, rows }: { filename: string; rows: ExportRow[] }) {
  const [error, setError] = useState('');
  const download = (format: 'csv' | 'json') => {
    try {
      downloadResults(filename, rows, format);
      setError('');
    } catch {
      setError('無法下載結果，請重試。');
    }
  };
  return (
    <div className="page-actions" aria-label="匯出操作結果">
      <button className="btn btn-secondary" onClick={() => download('csv')}>
        匯出 CSV
      </button>
      <button className="btn btn-secondary" onClick={() => download('json')}>
        匯出 JSON
      </button>
      {error && <span role="alert">{error}</span>}
    </div>
  );
}
