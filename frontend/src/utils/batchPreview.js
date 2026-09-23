import { normalizeTeamPersonFilter } from './teamPersonFilterStorage';

export const DEFAULT_COLUMNS = {
  Video: { title: 'Youtube Title', description: 'Youtube Description', worksheet: 'Youtube Video' },
  Shorts: { title: 'Shorts Title', description: 'Shorts Description', worksheet: 'Youtube Shorts' },
};

export const TEAM_OPTION_SUFFIX = '（全隊）';

export function resolveDraftConfig(serverConfig, cached) {
  const hasServerConfig =
    serverConfig &&
    typeof serverConfig === 'object' &&
    !Array.isArray(serverConfig) &&
    Object.keys(serverConfig).length > 0;
  return hasServerConfig ? serverConfig : cached;
}

export function normalizeConfig(raw, defaults, sysSettings, sharedFilter) {
  const normalizedSharedFilter = sharedFilter?.exists ? normalizeTeamPersonFilter(sharedFilter) : null;
  return {
    spreadsheetId: raw?.spreadsheetId || raw?.spreadsheet_id || sysSettings.default_spreadsheet_id || '',
    // Playlist overrides from older draft configs remain readable for
    // migration, but the account-level shared To-Post setting wins.
    playlistId: sysSettings.default_playlist_id || raw?.playlistId || raw?.playlist_id || '',
    worksheetName: raw?.worksheetName || raw?.worksheet_name || defaults.worksheet,
    titleColumn: raw?.titleColumn || raw?.title_column || defaults.title,
    descriptionColumn: raw?.descriptionColumn || raw?.description_column || defaults.description,
    selectedTeam: normalizedSharedFilter?.team || '',
    selectedPeople: normalizedSharedFilter?.selectedPeople || [],
  };
}

export function sheetRowValue(row, columns, label) {
  const column = columns.find((item) => item.label === label || item.key === label);
  if (!column) return '';
  return row?.cells?.[column.index] ?? '';
}

export function buildBatchPreview({
  videos = [],
  sheetRows = [],
  sheetColumns = [],
  team = '',
  titleColumn = '',
  descriptionColumn = '',
  assignments = {},
}) {
  return videos.map((video) => {
    const person = assignments[video.video_id] || '不編輯';
    const base = {
      videoId: video.video_id,
      video,
      person,
      currentTitle: video.title || '',
      currentDescription: video.description || '',
      newTitle: '',
      newDescription: '',
      status: 'skipped',
      reason: '',
      willUpdate: false,
    };
    if (!person || person === '不編輯') return { ...base, reason: '未指定人物' };

    const matches = sheetRows.filter((row) => {
      if (String(row?.team || '').trim() !== String(team || '').trim()) return false;
      const rowPerson = String(row?.person || '').trim();
      return person.endsWith(TEAM_OPTION_SUFFIX) ? !rowPerson : rowPerson === person;
    });
    if (!matches.length) return { ...base, reason: `找不到團體 ${team} 的選項 ${person} 資料` };

    const values = matches.map((row) => ({
      title: String(sheetRowValue(row, sheetColumns, titleColumn) || '').trim(),
      description: String(sheetRowValue(row, sheetColumns, descriptionColumn) || ''),
    }));
    const distinct = new Set(values.map((value) => JSON.stringify(value)));
    if (distinct.size > 1) return { ...base, reason: `團體 ${team} 的選項 ${person} 有多筆且標題或描述內容不同` };
    const next = values[0];
    if (!next.title) return { ...base, newDescription: next.description, reason: `工作表的 ${titleColumn} 為空白` };
    if (next.title === base.currentTitle && next.description === base.currentDescription) {
      return {
        ...base,
        newTitle: next.title,
        newDescription: next.description,
        status: 'unchanged',
        reason: '標題與描述沒有變更',
      };
    }
    return {
      ...base,
      newTitle: next.title,
      newDescription: next.description,
      status: 'ready',
      willUpdate: true,
    };
  });
}

export function createPreviewToken() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function buildPreviewSnapshot({
  previewToken,
  spreadsheetId,
  playlistId,
  playlistSource,
  youtubeSlot,
  videoType,
  worksheetName,
  titleColumn,
  descriptionColumn,
  team,
  plan,
}) {
  return {
    previewToken,
    spreadsheetId,
    playlistId,
    playlistSource,
    youtubeSlot,
    videoType,
    worksheetName,
    titleColumn,
    descriptionColumn,
    team,
    plan: plan.map((item) => ({
      videoId: item.videoId,
      currentTitle: item.currentTitle,
      currentDescription: item.currentDescription,
      newTitle: item.newTitle,
      newDescription: item.newDescription,
      person: item.person,
      status: item.status,
      reason: item.reason,
    })),
  };
}

export function getBatchPreviewStatus(item) {
  const status = String(item?.status || '').toLowerCase();
  if (item?.willUpdate || ['ready', 'will_update', 'to_update'].includes(status)) {
    return { key: 'willUpdate', label: '將更新', tone: 'success' };
  }
  if (
    ['unchanged', 'no_change', 'no-change', 'not_changed'].includes(status) ||
    /沒有變更|無變更/.test(String(item?.reason || ''))
  ) {
    return { key: 'unchanged', label: '沒有變更', tone: 'neutral' };
  }
  if (['failed', 'error'].includes(status)) return { key: 'failed', label: '失敗', tone: 'error' };
  return { key: 'skipped', label: '略過', tone: 'neutral' };
}

export function isBatchPreviewUpdate(item) {
  return getBatchPreviewStatus(item).key === 'willUpdate';
}
