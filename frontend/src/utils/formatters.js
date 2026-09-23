export function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!bytes || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

export function formatTokenDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-TW');
}

export function tokenStatusLabel(status) {
  return (
    {
      active: '正常（會自動更新）',
      refresh_failed: '暫時更新失敗',
      reauthorization_required: '需要重新授權',
      not_connected: '尚未連結',
    }[status] || '未取得狀態'
  );
}
