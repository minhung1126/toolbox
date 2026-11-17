import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { personKey } from '../features/sheets/model/personOptions';
const memberKey = personKey({ team: '團體 A', person: '人物甲', kind: 'person' });
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BatchUpdatePage, { buildBatchPreview } from './BatchUpdatePage';
import BatchPreviewItem from '../components/batch/BatchPreviewItem';
import { useBatchUpdateWorkflow } from '../features/youtube/hooks/useBatchUpdateWorkflow';

describe('BatchPreviewItem', () => {
  it('uses the kebab-case class for items that will be updated', () => {
    const { container } = render(
      <BatchPreviewItem
        item={{
          videoId: 'video-1',
          currentTitle: '舊標題',
          newTitle: '新標題',
          status: 'ready',
          willUpdate: true,
        }}
        index={0}
      />
    );

    expect(container.querySelector('article')).toHaveClass('batch-preview-item-will-update');
  });
});

const mocks = vi.hoisted(() => ({
  api: {
    getYoutubeDraftSettings: vi.fn(),
    updateYoutubeDraftSettings: vi.fn(),
    updateYoutubePlaylist: vi.fn(),
    getSpreadsheetMetadata: vi.fn(),
    getRandomMemberPreview: vi.fn(),
    getPlaylistVideos: vi.fn(),
    getBatchPreview: vi.fn(),
    estimateYoutubeQuota: vi.fn(),
    batchUpdateMetadata: vi.fn(),
    prepareYoutubeDrafts: vi.fn(),
  },
  toast: {
    warning: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
  saveWorkState: vi.fn(),
  workState: {},
  resetSelection: vi.fn(),
  teams: ['團體 A'],
  people: [{ team: '團體 A', person: '人物甲', kind: 'person' }],
  selectedPeople: ['person:["團體 A","person","人物甲"]'],
  setSelectedTeam: vi.fn(),
  setSelectedPeople: vi.fn(),
}));

vi.mock('../services/api', () => ({
  api: mocks.api,
  normalizeYoutubePlaylistInput: (val) => String(val || '').trim(),
}));
vi.mock('../components/Toast', () => ({ useToast: () => mocks.toast }));
vi.mock('../hooks/useAccountWorkState', () => ({
  default: () => ({ value: mocks.workState, error: '', save: mocks.saveWorkState }),
}));
vi.mock('../hooks/useTeamPersonFilter', () => ({
  default: () => ({
    teams: mocks.teams,
    selectedTeams: [],
    setSelectedTeams: mocks.setSelectedTeam,
    query: '',
    setQuery: vi.fn(),
    people: mocks.people,
    selectedPeople: mocks.selectedPeople,
    setSelectedPeople: mocks.setSelectedPeople,
    loadingTeams: false,
    loadingPeople: false,
    ready: true,
    error: '',
    resetSelection: mocks.resetSelection,
  }),
}));
vi.mock('../hooks/useSharedTeamPersonFilterPersistence', () => ({
  default: () => ({ ready: true }),
}));
vi.mock('../components/SheetDataSourcePanel', () => ({
  default: ({ children, disabled, loading, onRefresh }) => (
    <fieldset disabled={disabled}>
      <button onClick={onRefresh} disabled={disabled || loading}>
        刷新工作表與欄位
      </button>
      {children}
    </fieldset>
  ),
}));
vi.mock('../components/SourceLinkInput', () => ({
  default: ({ id, value, onChange, sourceType: _sourceType, ...props }) => (
    <input id={id} value={value || ''} onChange={onChange} {...props} />
  ),
}));
vi.mock('../components/TeamPersonFilterPanel', () => ({ default: () => null }));
vi.mock('../components/ThumbnailDialog', () => ({ default: () => null }));

const authUser = {
  sub: 'owner-1',
  youtube: {
    active_slot: 'primary',
    slots: {
      primary: { authenticated: true, channel_id: 'channel-one' },
    },
  },
};

const videoOne = {
  video_id: 'video-1',
  title: '舊標題一',
  description: '舊描述一\n第二行',
};

const videoTwo = {
  video_id: 'video-2',
  title: '保留標題',
  description: '保留描述',
};

function renderPage() {
  return render(
    <MemoryRouter>
      <BatchUpdatePage
        authUser={authUser}
        sysSettings={{ default_spreadsheet_id: 'sheet-a', default_playlist_id: 'playlist-a' }}
        videoType="Video"
      />
    </MemoryRouter>
  );
}

async function readDraftVideos() {
  const button = await screen.findByRole('button', { name: '讀取 Video 草稿影片' });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
}

async function reviewedWorkflow() {
  const hook = renderHook(() =>
    useBatchUpdateWorkflow({
      authUser,
      sysSettings: { default_spreadsheet_id: 'sheet-a', default_playlist_id: 'playlist-a' },
      videoType: 'Video',
      toast: mocks.toast,
    })
  );
  await waitFor(() => expect(hook.result.current.sourceReady).toBe(true));
  await act(async () => {
    await hook.result.current.handleLoadVideos();
  });
  act(() => hook.result.current.setAssignments({ 'video-1': memberKey, 'video-2': '不編輯' }));
  await act(async () => {
    await hook.result.current.requestPreview();
  });
  return hook;
}

describe('BatchUpdatePage preview and confirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocks.workState = {};
    mocks.api.getYoutubeDraftSettings.mockResolvedValue({});
    mocks.api.updateYoutubeDraftSettings.mockResolvedValue({});
    mocks.api.updateYoutubePlaylist.mockResolvedValue({});
    mocks.api.getSpreadsheetMetadata.mockResolvedValue({
      worksheets: [{ title: 'Youtube Video', columns: ['Youtube Title', 'Youtube Description'] }],
    });
    mocks.api.getRandomMemberPreview.mockResolvedValue({ person: '人物甲', values: {} });
    mocks.api.getPlaylistVideos.mockResolvedValue({
      playlist_id: 'playlist-a',
      videos: [videoOne, videoTwo],
      source: 'youtube-api',
    });
    mocks.api.getBatchPreview.mockResolvedValue({
      preview_token: 'preview-token',
      preview_snapshot: { youtube_slot: 'primary' },
      plan: [
        {
          videoId: 'video-1',
          currentTitle: '舊標題一',
          currentDescription: '舊描述一\n第二行',
          newTitle: '新標題一',
          newDescription: '新描述一\n第二行',
          person: '人物甲',
          status: 'ready',
          willUpdate: true,
        },
        {
          videoId: 'video-2',
          currentTitle: '保留標題',
          currentDescription: '保留描述',
          newTitle: '',
          newDescription: '',
          person: '不編輯',
          status: 'skipped',
          reason: '未指定人物',
          willUpdate: false,
        },
      ],
    });
    mocks.api.estimateYoutubeQuota.mockResolvedValue({
      projected_units: 100,
      effective_available_units: 200,
      can_complete_today: true,
    });
    mocks.api.batchUpdateMetadata.mockResolvedValue({
      operation: 'youtube.metadata_update',
      completed: true,
      total_count: 2,
      succeeded_count: 1,
      warning_count: 0,
      skipped_count: 1,
      failed_count: 0,
      not_attempted_count: 0,
      quota_blocked: false,
      results: [
        { video_id: 'video-1', status: 'succeeded' },
        { video_id: 'video-2', status: 'skipped' },
      ],
    });
  });

  it('keeps the preview builder explicit about unchanged and skipped items', () => {
    const preview = buildBatchPreview({
      videos: [videoOne, videoTwo],
      sheetRows: [{ team: '團體 A', person: '人物甲', cells: ['舊標題一', '舊描述一\n第二行'] }],
      sheetColumns: [
        { label: '標題', key: 'title', index: 0 },
        { label: '描述', key: 'description', index: 1 },
      ],
      team: '團體 A',
      titleColumn: '標題',
      descriptionColumn: '描述',
      assignments: { 'video-1': memberKey, 'video-2': '不編輯' },
    });

    expect(preview[0]).toMatchObject({ status: 'unchanged', willUpdate: false, reason: '標題與描述沒有變更' });
    expect(preview[1]).toMatchObject({ status: 'skipped', reason: '未指定人物' });
  });

  it('applies people to persistent staging without writing to YouTube', async () => {
    mocks.api.prepareYoutubeDrafts.mockResolvedValueOnce({
      stage_token: 'signed-stage',
      stage_snapshot: {
        version: 1,
        stage_id: 'stage-one',
        video_type: 'Video',
        youtube_slot: 'primary',
        youtube_channel_id: 'channel-one',
        plan: [
          {
            video_id: 'video-1',
            person: '人物甲',
            currentTitle: '舊標題',
            currentDescription: '',
            newTitle: '新標題',
            newDescription: '描述',
            status: 'ready',
          },
          {
            video_id: 'video-2',
            person: '不編輯',
            currentTitle: '保留標題',
            currentDescription: '',
            newTitle: '',
            newDescription: '',
            status: 'skipped',
          },
        ],
      },
    });
    const { container } = renderPage();
    await readDraftVideos();
    await screen.findByText('舊標題一');
    fireEvent.change(container.querySelector('.video-card-assignment select'), { target: { value: memberKey } });
    fireEvent.click(screen.getByRole('button', { name: '套用人物並產生暫存結果' }));
    await waitFor(() => expect(mocks.api.prepareYoutubeDrafts).toHaveBeenCalledOnce());
    expect(mocks.api.prepareYoutubeDrafts).toHaveBeenCalledWith(
      expect.objectContaining({
        video_type: 'Video',
        assignments: [
          { video_id: 'video-1', person: memberKey },
          { video_id: 'video-2', person: '不編輯' },
        ],
      })
    );
    await waitFor(() =>
      expect(localStorage.getItem('toolbox:youtube-publish-draft:v1:owner-1:channel-one:Video')).toContain('新標題')
    );
    expect(mocks.api.batchUpdateMetadata).not.toHaveBeenCalled();
  });

  it('keeps assignments available when staging fails', async () => {
    mocks.api.prepareYoutubeDrafts.mockResolvedValueOnce({ stage_token: 'invalid', stage_snapshot: {} });
    const { container } = renderPage();
    await readDraftVideos();
    await screen.findByText('舊標題一');
    fireEvent.change(container.querySelector('.video-card-assignment select'), { target: { value: memberKey } });
    fireEvent.click(screen.getByRole('button', { name: '套用人物並產生暫存結果' }));
    expect(await screen.findByText(/建立暫存失敗/)).toBeInTheDocument();
    expect(container.querySelector('.video-card-assignment select')).toHaveValue(memberKey);
    expect(mocks.api.batchUpdateMetadata).not.toHaveBeenCalled();
  });

  it('allows editing the playlist ID and auto-saves draft settings', async () => {
    renderPage();
    const playlistInput = screen.getByPlaceholderText('YouTube Playlist ID 或網址');
    expect(playlistInput).toBeInTheDocument();

    fireEvent.change(playlistInput, { target: { value: 'PL_new_playlist' } });
    await waitFor(() =>
      expect(mocks.api.updateYoutubePlaylist).toHaveBeenCalledWith({ playlistId: 'PL_new_playlist' })
    );

    const saveButton = screen.getByRole('button', { name: '立即儲存草稿設定' });
    fireEvent.click(saveButton);
    await waitFor(() =>
      expect(mocks.api.updateYoutubeDraftSettings).toHaveBeenCalledWith(
        'Video',
        expect.objectContaining({
          spreadsheet_id: 'sheet-a',
        })
      )
    );
  });

  it('blocks confirmation and execution callbacks while source refresh is pending', async () => {
    const hook = await reviewedWorkflow();
    let finish;
    mocks.api.getSpreadsheetMetadata.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    let refresh;
    act(() => {
      refresh = hook.result.current.loadSheetResources();
    });
    expect(hook.result.current.loadingSheet).toBe(true);
    act(() => {
      hook.result.current.requestExecute();
    });
    await act(async () => {
      await hook.result.current.doExecute();
    });
    expect(hook.result.current.confirmOpen).toBe(false);
    expect(mocks.api.batchUpdateMetadata).not.toHaveBeenCalled();
    await act(async () => {
      finish({ worksheets: [{ title: 'Youtube Video', columns: ['Youtube Title', 'Youtube Description'] }] });
      await refresh;
    });
    act(() => {
      hook.result.current.requestExecute();
    });
    expect(hook.result.current.confirmOpen).toBe(true);
  });

  it('blocks refresh and reload callbacks in the same turn that a write starts', async () => {
    const hook = await reviewedWorkflow();
    const response = await mocks.api.batchUpdateMetadata();
    mocks.api.batchUpdateMetadata.mockClear();
    let finish;
    mocks.api.batchUpdateMetadata.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    let write;
    act(() => {
      write = hook.result.current.doExecute();
      void hook.result.current.loadSheetResources();
      void hook.result.current.handleLoadVideos();
    });
    expect(mocks.api.getSpreadsheetMetadata).toHaveBeenCalledOnce();
    expect(mocks.api.getPlaylistVideos).toHaveBeenCalledOnce();
    await act(async () => {
      finish(response);
      await write;
    });
    expect(hook.result.current.result).toEqual(response);
    expect(hook.result.current.executing).toBe(false);
  });
});

it('migrates remembered assignments and bulk selection before saving the new shared filter', async () => {
  mocks.workState = { assignments: { 'video-1': '人物甲' }, bulkPerson: '人物甲' };
  mocks.api.getYoutubeDraftSettings.mockResolvedValue({ video: {}, shorts: {} });
  mocks.api.getSpreadsheetMetadata.mockResolvedValue({
    worksheets: [{ title: 'Youtube Video', columns: ['Youtube Title', 'Youtube Description'] }],
  });
  const sysSettings = {
    default_spreadsheet_id: 'sheet-a',
    shared_team_person_filter: { configured: true, team: '團體 A', selected_people: ['人物甲'] },
  };
  const hook = renderHook(() =>
    useBatchUpdateWorkflow({ authUser, videoType: 'Video', toast: mocks.toast, sysSettings })
  );
  await waitFor(() => expect(hook.result.current.hydrated).toBe(true));
  expect(hook.result.current.assignments['video-1']).toBe(memberKey);
  expect(hook.result.current.bulkPerson).toBe(memberKey);
  expect(mocks.saveWorkState).toHaveBeenLastCalledWith(
    expect.objectContaining({ assignments: { 'video-1': memberKey }, bulkPerson: memberKey }),
    {}
  );
  mocks.workState = {};
});
