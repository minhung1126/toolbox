import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DraftPublishPage from './DraftPublishPage';
import { api } from '../../../services/api';
import {
  createSavedDraft,
  loadPublishDraft,
  rememberDraftContext,
  savePublishDraft,
} from '../model/draftPublishStorage';

vi.mock('../../../services/api', () => ({
  api: {
    previewYoutubeDrafts: vi.fn(),
    publishYoutubeDrafts: vi.fn(),
    getOperations: vi.fn(),
    reconcileOperation: vi.fn(),
  },
}));
const authUser = {
  sub: 'owner',
  youtube: { active_slot: 'primary', slots: { primary: { authenticated: true, channel_id: 'channel' } } },
};
const source = {
  spreadsheet_url_or_id: 'sheet',
  playlist_id: 'playlist',
  video_type: 'Video',
  worksheet_name: 'Videos',
  title_column: 'Title',
  description_column: 'Description',
  team: '',
  assignments: [
    { video_id: 'one', person: 'Alice' },
    { video_id: 'two', person: '不編輯' },
  ],
};
function seed({ videoType = 'Video', twoActive = false } = {}) {
  const stage = {
    stage_token: 'signed-stage',
    stage_snapshot: {
      version: 1,
      stage_id: 'stage-one',
      video_type: videoType,
      youtube_slot: 'primary',
      youtube_channel_id: 'channel',
      source: {},
      plan: ['one', 'two'].map((id, index) => ({
        video_id: id,
        person: index === 0 || twoActive ? 'Alice' : '不編輯',
        person_key: 'Alice',
        currentTitle: `Original ${id}`,
        currentDescription: 'Original description',
        currentPrivacy: 'private',
        newTitle: `Applied ${id}`,
        newDescription: `Applied description ${id}`,
        thumbnailUrl: '',
        status: index === 0 || twoActive ? 'ready' : 'skipped',
        reason: index === 0 || twoActive ? '' : '未指定人物',
      })),
    },
  };
  const nextSource = { ...source, video_type: videoType };
  const draft = createSavedDraft(stage, 'owner', nextSource);
  savePublishDraft(draft);
  rememberDraftContext('owner', nextSource, 'channel');
  return draft;
}
function renderPage(props = {}) {
  return render(
    <MemoryRouter>
      <DraftPublishPage
        authUser={authUser}
        videoType="Video"
        sysSettings={{ default_playlist_id: 'playlist' }}
        {...props}
      />
    </MemoryRouter>
  );
}
function previewResponse(payload) {
  const plan = payload.edits.map((edit) => ({
    ...edit,
    person: 'Alice',
    status: edit.skip ? 'skipped' : 'ready',
    parts: edit.skip ? [] : ['snippet', 'status'],
    reason: '',
    write_units: edit.skip ? 0 : 50,
  }));
  return {
    preview_token: 'signed-final',
    preview_snapshot: { youtube_slot: 'primary', plan },
    plan,
    quota: {
      write_calls: plan.filter((item) => item.parts.length).length,
      write_units: 50,
      read_units: 3,
      projected_units: 53,
    },
  };
}
function resultResponse(payload) {
  return {
    operation: 'youtube.metadata_publish',
    operation_id: 'operation-one',
    completed: true,
    results: payload.edits.map((edit) => ({ ...edit, person: 'Alice', status: edit.skip ? 'skipped' : 'succeeded' })),
  };
}
async function confirmPublish() {
  fireEvent.click(screen.getByRole('button', { name: '檢查變更與配額' }));
  await screen.findByRole('region', { name: '最終變更摘要' });
  fireEvent.click(screen.getByRole('button', { name: '確認編輯並公開', exact: true }));
  const dialog = screen.getByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: '確認編輯並公開', exact: true }));
}

describe('editable publish staging', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetAllMocks();
    api.previewYoutubeDrafts.mockImplementation(async (payload) => previewResponse(payload));
    api.publishYoutubeDrafts.mockImplementation(async (payload) => resultResponse(payload));
  });

  it.each(['Video', 'Shorts'])(
    'restores %s manual edits across remounts and writes only after final confirmation',
    async (videoType) => {
      seed({ videoType });
      const view = renderPage({ videoType });
      fireEvent.click(screen.getAllByRole('button', { name: '編輯', exact: true })[0]);
      const title = screen.getByLabelText('標題');
      const description = screen.getByLabelText('描述');
      fireEvent.change(title, { target: { value: 'My final title' } });
      fireEvent.change(description, { target: { value: 'Full long description\n'.repeat(200) } });
      fireEvent.click(screen.getByRole('button', { name: '儲存暫存' }));
      expect(api.publishYoutubeDrafts).not.toHaveBeenCalled();
      view.unmount();
      renderPage({ videoType });
      expect(screen.getByRole('article', { name: '暫存影片 one' })).toHaveTextContent('My final title');
      expect(screen.getAllByLabelText('預計套用的描述')[0].textContent).toBe('Full long description\n'.repeat(200));
      fireEvent.click(screen.getByRole('button', { name: '檢查變更與配額' }));
      await screen.findByRole('region', { name: '最終變更摘要' });
      expect(api.previewYoutubeDrafts.mock.calls[0][0].edits[0].title).toBe('My final title');
      expect(api.publishYoutubeDrafts).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: '確認編輯並公開', exact: true }));
      expect(api.publishYoutubeDrafts).not.toHaveBeenCalled();
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '取消' }));
      fireEvent.click(screen.getByRole('button', { name: '確認編輯並公開', exact: true }));
      const submit = within(screen.getByRole('dialog')).getByRole('button', { name: '確認編輯並公開', exact: true });
      fireEvent.click(submit);
      fireEvent.click(submit);
      await waitFor(() => expect(api.publishYoutubeDrafts).toHaveBeenCalledOnce());
      expect(api.publishYoutubeDrafts.mock.calls[0][0].edits).toEqual([
        expect.objectContaining({
          video_id: 'one',
          title: 'My final title',
          description: 'Full long description\n'.repeat(200),
          skip: false,
        }),
        expect.objectContaining({ video_id: 'two', skip: true }),
      ]);
      await waitFor(() => expect(screen.getAllByRole('button', { name: '編輯', exact: true })[0]).toBeDisabled());
      expect(screen.getByText('已寫入 YouTube')).toBeInTheDocument();
      expect(api.previewYoutubeDrafts).toHaveBeenCalledOnce();
    }
  );

  it('validates title and full description, invalidates a reviewed plan, and supports reset and skip', async () => {
    seed();
    renderPage();
    fireEvent.click(screen.getAllByRole('button', { name: '編輯', exact: true })[0]);
    const title = screen.getByLabelText('標題');
    fireEvent.change(title, { target: { value: ' ' } });
    expect(screen.getByText('標題不得為空。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '儲存暫存' })).toBeDisabled();
    fireEvent.change(title, { target: { value: '字'.repeat(101) } });
    expect(screen.getByText('標題最多 100 字元。')).toBeInTheDocument();
    fireEvent.change(title, { target: { value: '😀'.repeat(100) } });
    fireEvent.change(screen.getByLabelText('描述'), { target: { value: '字'.repeat(5001) } });
    expect(screen.getByText('描述最多 5,000 字元。')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('描述'), { target: { value: 'Valid description' } });
    fireEvent.click(screen.getByRole('button', { name: '儲存暫存' }));
    fireEvent.click(screen.getAllByRole('button', { name: '還原為套用人物後內容' })[0]);
    expect(loadPublishDraft('owner', 'channel', 'Video').edits[0].title).toBe('Applied one');
    fireEvent.click(screen.getByRole('button', { name: '檢查變更與配額' }));
    await screen.findByRole('region', { name: '最終變更摘要' });
    fireEvent.click(screen.getAllByRole('button', { name: '編輯', exact: true })[0]);
    fireEvent.change(screen.getByLabelText('標題'), { target: { value: 'Changed after preview' } });
    fireEvent.click(screen.getByRole('button', { name: '儲存暫存' }));
    expect(screen.getByRole('button', { name: '確認編輯並公開', exact: true })).toBeDisabled();
    expect(screen.queryByRole('region', { name: '最終變更摘要' })).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByLabelText('略過此片')[0]);
    fireEvent.click(screen.getByRole('button', { name: '檢查變更與配額' }));
    await screen.findByRole('region', { name: '最終變更摘要' });
    expect(api.previewYoutubeDrafts.mock.calls.at(-1)[0].edits.every((edit) => edit.skip)).toBe(true);
    expect(api.publishYoutubeDrafts).not.toHaveBeenCalled();
  });

  it('isolates account, channel and video type and blocks changed sources without discarding edits', () => {
    const draft = seed();
    draft.edits[0].title = 'Preserve this manual title';
    savePublishDraft(draft);
    for (const props of [
      { authUser: { ...authUser, sub: 'another-owner' } },
      {
        authUser: {
          sub: 'owner',
          youtube: { slots: { primary: { authenticated: true, channel_id: 'another-channel' } } },
        },
      },
      { videoType: 'Shorts' },
    ]) {
      const view = renderPage(props);
      expect(screen.getByText(/沒有 .* 暫存/)).toBeInTheDocument();
      expect(screen.queryByDisplayValue('Preserve this manual title')).not.toBeInTheDocument();
      view.unmount();
    }
    rememberDraftContext('owner', { ...source, worksheet_name: 'Another source' }, 'channel');
    renderPage();
    expect(screen.getByRole('article', { name: '暫存影片 one' })).toHaveTextContent('Preserve this manual title');
    expect(screen.getByRole('button', { name: '檢查變更與配額' })).toBeDisabled();
    expect(api.previewYoutubeDrafts).not.toHaveBeenCalled();
  });

  it('keeps unknown submissions locked after reload and recovers through read-only reconciliation', async () => {
    seed();
    api.publishYoutubeDrafts.mockRejectedValueOnce(new Error('timeout'));
    const view = renderPage();
    await confirmPublish();
    await screen.findByText(/timeout/);
    expect(loadPublishDraft('owner', 'channel', 'Video').pending).toBeTruthy();
    view.unmount();
    renderPage();
    expect(screen.getAllByRole('button', { name: '編輯', exact: true })[0]).toBeDisabled();
    expect(screen.getByRole('button', { name: '確認編輯並公開', exact: true })).toBeDisabled();
    const saved = loadPublishDraft('owner', 'channel', 'Video');
    api.getOperations.mockResolvedValue({
      operations: [
        { id: 'operation-one', kind: 'youtube.metadata_publish', plan: { stage_snapshot: { stage_id: 'stage-one' } } },
      ],
    });
    api.reconcileOperation.mockResolvedValue({
      state: 'completed',
      items: [{ state: 'completed' }],
      result: resultResponse(saved.pending),
    });
    fireEvent.click(screen.getByRole('button', { name: '唯讀核對發布結果' }));
    await waitFor(() => expect(loadPublishDraft('owner', 'channel', 'Video').pending).toBeUndefined());
    expect(api.publishYoutubeDrafts).toHaveBeenCalledOnce();
    expect(screen.getByText('已寫入 YouTube')).toBeInTheDocument();
  });

  it('locks every field during submission and retries only failed rows after partial success', async () => {
    seed({ twoActive: true });
    let finish;
    api.publishYoutubeDrafts.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    renderPage();
    await confirmPublish();
    await waitFor(() => expect(api.publishYoutubeDrafts).toHaveBeenCalledOnce());
    screen.getAllByRole('button', { name: '編輯', exact: true }).forEach((input) => expect(input).toBeDisabled());
    await act(async () => {
      const response = resultResponse(api.publishYoutubeDrafts.mock.calls[0][0]);
      response.completed = false;
      response.results[1].status = 'failed';
      finish(response);
    });
    expect(screen.getAllByRole('button', { name: '編輯', exact: true })[0]).toBeDisabled();
    expect(screen.getAllByRole('button', { name: '編輯', exact: true })[1]).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: '檢查變更與配額' }));
    await screen.findByRole('region', { name: '最終變更摘要' });
    expect(api.previewYoutubeDrafts.mock.calls.at(-1)[0].edits.map((edit) => edit.skip)).toEqual([true, false]);
  });

  it('locks an explicit unknown result until reconciliation confirms the submitted version', async () => {
    seed();
    api.publishYoutubeDrafts.mockImplementationOnce(async (payload) => {
      const result = resultResponse(payload);
      result.completed = false;
      result.results[0].status = 'needs_reconciliation';
      return result;
    });
    renderPage();
    await confirmPublish();
    await screen.findByText('待核對');
    expect(screen.getAllByRole('button', { name: '編輯', exact: true })[0]).toBeDisabled();
    expect(screen.getByRole('button', { name: '檢查變更與配額' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '唯讀核對發布結果' })).toBeEnabled();
  });

  it('keeps newer manual edits unpublished when reconciliation confirms an earlier failed version', async () => {
    const draft = seed();
    draft.result = resultResponse({ edits: draft.edits });
    draft.result.completed = false;
    draft.result.results[0].status = 'failed';
    draft.edits[0].title = 'A newer manual edit';
    savePublishDraft(draft);
    api.getOperations.mockResolvedValue({
      operations: [
        { id: 'operation-one', kind: 'youtube.metadata_publish', plan: { stage_snapshot: { stage_id: 'stage-one' } } },
      ],
    });
    api.reconcileOperation.mockResolvedValue({
      state: 'completed',
      items: [{ state: 'completed' }],
      result: resultResponse({ edits: draft.result.results }),
    });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: '唯讀核對發布結果' }));
    await screen.findByText(/先前版本已寫入/);
    expect(screen.getByRole('article', { name: '暫存影片 one' })).toHaveTextContent('A newer manual edit');
    expect(screen.queryByText('已寫入 YouTube', { exact: true })).not.toBeInTheDocument();
  });
  it('keeps complete multiline descriptions visible and protects unsaved modal changes', () => {
    const draft = seed();
    const full = '第一行\n' + 'https://example.com/' + 'x'.repeat(300) + '\n最後一行';
    draft.edits[0].description = full;
    savePublishDraft(draft);
    renderPage();
    expect(screen.getAllByLabelText('預計套用的描述')[0].textContent).toBe(full);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    const edit = screen.getAllByRole('button', { name: '編輯', exact: true })[0];
    edit.focus();
    fireEvent.click(edit);
    expect(screen.getByLabelText('標題')).toHaveFocus();
    fireEvent.change(screen.getByLabelText('描述'), { target: { value: 'Unsaved replacement' } });
    fireEvent.keyDown(document, { key: 'Escape' });
    const discard = screen.getByRole('dialog', { name: '捨棄尚未儲存的修改？' });
    fireEvent.click(within(discard).getByRole('button', { name: '繼續編輯' }));
    expect(screen.getByLabelText('描述')).toHaveValue('Unsaved replacement');
    fireEvent.click(screen.getByRole('button', { name: '取消', exact: true }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: '捨棄尚未儲存的修改？' })).getByRole('button', { name: '捨棄修改' })
    );
    expect(loadPublishDraft('owner', 'channel', 'Video').edits[0].description).toBe(full);
    expect(edit).toHaveFocus();
    expect(api.previewYoutubeDrafts).not.toHaveBeenCalled();
    expect(api.publishYoutubeDrafts).not.toHaveBeenCalled();
  });
});
