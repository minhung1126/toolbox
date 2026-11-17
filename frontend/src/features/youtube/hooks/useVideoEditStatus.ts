import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchVideoEditStatuses, type VideoEditStatus } from '../api/videoEditStatusApi';

export const editStatusLabel: Record<VideoEditStatus, string> = {
  applied: '已套用編輯',
  not_applied: '尚未套用（有未成功寫入紀錄）',
  unknown: '狀態未知／沒有可驗證的成功紀錄',
};

export function useVideoEditStatus(account: string, channel: string, videoIds: string[]) {
  const key = JSON.stringify([account, channel, videoIds]);
  const currentKey = useRef(key);
  currentKey.current = key;
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    key: string;
    statuses: Record<string, VideoEditStatus>;
    loading: boolean;
    error: string;
  }>({ key: '', statuses: {}, loading: false, error: '' });
  useEffect(() => {
    let cancelled = false;
    const [owner, channelId, ids] = JSON.parse(key) as [string, string, string[]];
    if (!owner || !channelId || !ids.length) return;
    setState((previous) => ({
      key,
      statuses: previous.key === key ? previous.statuses : {},
      loading: true,
      error: '',
    }));
    (async () => {
      const statuses: Record<string, VideoEditStatus> = {};
      // Playlist reads already collect every page. Resolve the complete set before filtering.
      for (let index = 0; index < ids.length; index += 500) {
        const batch = ids.slice(index, index + 500);
        const response = await fetchVideoEditStatuses(channelId, batch);
        if (cancelled || currentKey.current !== key) return;
        Object.assign(statuses, response);
      }
      if (!cancelled) setState({ key, statuses, loading: false, error: '' });
    })().catch((error: Error) => {
      if (!cancelled && currentKey.current === key)
        setState((previous) => ({
          key,
          statuses: previous.key === key ? previous.statuses : {},
          loading: false,
          error: `無法讀取編輯套用紀錄：${error.message}`,
        }));
    });
    return () => {
      cancelled = true;
    };
  }, [key, revision]);
  return {
    statuses: state.key === key ? state.statuses : {},
    loading: Boolean(account && channel && videoIds.length && (state.key !== key || state.loading)),
    error: state.key === key ? state.error : '',
    refresh: useCallback(() => setRevision((value) => value + 1), []),
  };
}
