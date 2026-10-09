import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { api } from './services/api';
import { getAllTools } from './tools/catalog';

vi.mock('./services/api', () => ({
  api: {
    getHealth: vi.fn(),
    getTools: vi.fn(),
    getUserStatus: vi.fn(),
    getSystemInfo: vi.fn(),
    getSharedSettings: vi.fn(),
    getYoutubeSettings: vi.fn(),
    getTeamPersonFilter: vi.fn(),
    getWorkState: vi.fn(),
    updateWorkState: vi.fn(),
  },
}));

const userResponse = {
  authenticated: true,
  user: { sub: 'subject-a', email: 'user@example.test' },
  youtube: { slots: { primary: { authenticated: false } } },
};
const storedNavigation = {
  sidebarCollapsed: false,
  dashboardPinnedCardIds: ['ffmpeg_generator_card'],
  dashboardRecentCardIds: ['photo_curator_card'],
};
const networkError = { code: 'network_error', status: 0, message: 'offline' };

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <App />
    </MemoryRouter>
  );
}

async function resumePage() {
  const event = new Event('pageshow');
  Object.defineProperty(event, 'persisted', { value: true });
  await act(async () => window.dispatchEvent(event));
}

async function settleAutosave() {
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 200));
  });
}

describe('App account work-state hydration', () => {
  let serverState;

  beforeEach(() => {
    vi.resetAllMocks();
    serverState = { navigation: { ...storedNavigation } };
    api.getHealth.mockResolvedValue({ commit_sha: 'development' });
    api.getUserStatus.mockResolvedValue(userResponse);
    api.getTools.mockResolvedValue({
      tools: getAllTools().map((tool) => ({
        id: tool.id,
        status: 'active',
        version: '1.0.0',
        entry_url: tool.entryUrl,
        required_scopes: [],
      })),
    });
    api.getSystemInfo.mockResolvedValue({});
    api.getSharedSettings.mockResolvedValue({});
    api.getYoutubeSettings.mockResolvedValue({});
    api.getTeamPersonFilter.mockResolvedValue({ configured: false, team: '', selected_people: [] });
    api.getWorkState.mockImplementation(async () => ({ state: serverState }));
    api.updateWorkState.mockImplementation(async (key, value) => {
      serverState = { ...serverState, [key]: value };
      return { state: serverState };
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('preserves saved shortcuts after an initial read fails and succeeds on retry', async () => {
    api.getWorkState.mockRejectedValueOnce(networkError);
    renderApp();
    const pin = await screen.findByRole('button', { name: '將 FFmpeg 命令行生成器 加入常用工具' });

    expect(pin).toBeDisabled();
    fireEvent.click(pin);
    fireEvent.click(screen.getByRole('button', { name: '收起側邊選單' }));
    fireEvent.change(screen.getByRole('searchbox', { name: '搜尋工具' }), { target: { value: 'FFmpeg' } });
    expect(screen.getByRole('link', { name: '進入生成器' })).toHaveAttribute('href', '/ffmpeg-generator');
    await settleAutosave();
    expect(api.updateWorkState).not.toHaveBeenCalled();
    expect(serverState.navigation).toEqual(storedNavigation);

    fireEvent.click(screen.getByRole('button', { name: '清除搜尋' }));
    fireEvent.click(screen.getByRole('button', { name: '重試', exact: true }));
    await waitFor(() => expect(pin).toBeEnabled());
    const favorites = screen.getByRole('region', { name: '常用工具' });
    expect(within(favorites).getByRole('link', { name: 'FFmpeg 命令行生成器' })).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: '最近使用' })).getByRole('link', { name: 'Instagram 貼文排版' })
    ).toBeInTheDocument();
    await waitFor(() => expect(api.updateWorkState).toHaveBeenCalled());
    expect(serverState.navigation.dashboardPinnedCardIds).toEqual(storedNavigation.dashboardPinnedCardIds);
    expect(serverState.navigation.dashboardRecentCardIds).toEqual(storedNavigation.dashboardRecentCardIds);
  });

  it('allows preference edits during a later read and keeps them when a stale response arrives', async () => {
    renderApp();
    const pin = await screen.findByRole('button', { name: '將 Instagram 貼文排版 加入常用工具' });
    await waitFor(() => expect(api.updateWorkState).toHaveBeenCalled());
    const staleState = JSON.parse(JSON.stringify(serverState));
    let resolveRead;
    api.getWorkState.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        })
    );
    await resumePage();
    await waitFor(() => expect(api.getWorkState).toHaveBeenCalledTimes(2));
    expect(pin).toBeEnabled();
    fireEvent.click(pin);
    await waitFor(() =>
      expect(serverState.navigation.dashboardPinnedCardIds).toEqual(['ffmpeg_generator_card', 'photo_curator_card'])
    );
    await act(async () => resolveRead({ state: staleState }));
    expect(pin).toHaveAttribute('aria-pressed', 'true');
    expect(serverState.navigation.dashboardPinnedCardIds).toEqual(['ffmpeg_generator_card', 'photo_curator_card']);
  });

  it('requires the new account read before allowing preference writes after an account switch', async () => {
    renderApp();
    await screen.findByRole('button', { name: '將 FFmpeg 命令行生成器 加入常用工具' });
    await waitFor(() => expect(api.updateWorkState).toHaveBeenCalled());
    const savedBeforeSwitch = JSON.parse(JSON.stringify(serverState));
    const writesBeforeSwitch = api.updateWorkState.mock.calls.length;
    let resolveRead;
    api.getUserStatus.mockResolvedValue({ ...userResponse, user: { sub: 'subject-b', email: 'other@example.test' } });
    api.getWorkState.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        })
    );
    await resumePage();
    await screen.findAllByText('other@example.test');
    const pin = screen.getByRole('button', { name: '將 FFmpeg 命令行生成器 加入常用工具' });
    expect(pin).toBeDisabled();
    expect(within(screen.getByRole('region', { name: '常用工具' })).queryByRole('link')).not.toBeInTheDocument();
    await settleAutosave();
    expect(api.updateWorkState).toHaveBeenCalledTimes(writesBeforeSwitch);
    expect(serverState).toEqual(savedBeforeSwitch);

    serverState = { navigation: { dashboardPinnedCardIds: ['photo_curator_card'] } };
    await act(async () => resolveRead({ state: serverState }));
    await waitFor(() => expect(pin).toBeEnabled());
    const favorites = screen.getByRole('region', { name: '常用工具' });
    expect(within(favorites).getByRole('link', { name: 'Instagram 貼文排版' })).toBeInTheDocument();
    expect(within(favorites).queryByRole('link', { name: 'FFmpeg 命令行生成器' })).not.toBeInTheDocument();
    await waitFor(() => expect(api.updateWorkState).toHaveBeenCalledTimes(writesBeforeSwitch + 1));
    expect(serverState.navigation.dashboardPinnedCardIds).toEqual(['photo_curator_card']);
  });
});
