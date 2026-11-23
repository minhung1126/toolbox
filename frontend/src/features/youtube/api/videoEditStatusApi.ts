import { api } from '../../../services/api';

export type VideoEditStatus = 'applied' | 'not_applied' | 'unknown';

export async function fetchVideoEditStatuses(
  channel: string,
  videoIds: string[]
): Promise<Record<string, VideoEditStatus>> {
  const value = await api.getYoutubeEditStatuses(videoIds);
  if (
    !value ||
    typeof value !== 'object' ||
    !('channel_id' in value) ||
    value.channel_id !== channel ||
    !('statuses' in value) ||
    !value.statuses ||
    typeof value.statuses !== 'object'
  )
    throw new Error('編輯套用紀錄與目前頻道不符，請重新讀取。');
  const statuses = value.statuses as Record<string, unknown>;
  if (!videoIds.every((id) => ['applied', 'not_applied', 'unknown'].includes(String(statuses[id]))))
    throw new Error('編輯套用紀錄不完整，請重新讀取。');
  return Object.fromEntries(videoIds.map((id) => [id, statuses[id] as VideoEditStatus]));
}
