export interface PrepareDraftState {
  preparing: boolean;
  executing: boolean;
  loadingSheet: boolean;
  loadingVideos: boolean;
  hydrated: boolean;
  authenticated: boolean;
  channel: string;
  sourceReady: boolean;
  sourceStale: boolean;
  worksheet: string;
  titleColumn: string;
  descriptionColumn: string;
  assignedCount: number;
}

export function prepareDraftAvailability(state: PrepareDraftState) {
  const reason = state.preparing
    ? '正在產生暫存，請稍候。'
    : state.executing
      ? '正在執行影片操作，完成後即可產生暫存。'
      : !state.hydrated
        ? '正在恢復草稿設定，請稍候。'
        : !state.authenticated || !state.channel
          ? '請到 YouTube 設定連結並確認授權頻道。'
          : state.loadingSheet
            ? '正在讀取工作表與欄位，完成後即可產生暫存。'
            : state.loadingVideos
              ? '正在讀取影片，完成後請指定人物。'
              : state.sourceStale || !state.sourceReady
                ? '請刷新工作表與欄位，再重新讀取影片。'
                : !state.worksheet || !state.titleColumn || !state.descriptionColumn
                  ? '請選擇有效的工作表、標題欄位與描述欄位。'
                  : !state.assignedCount
                    ? '請先為至少一支影片指定人物。'
                    : '';
  return { canPrepare: !reason, reason };
}
