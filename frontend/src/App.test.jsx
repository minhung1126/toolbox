import React from 'react';
import { Link, MemoryRouter } from 'react-router-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App, { ErrorBoundary, hasVersionMismatch } from './App';
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
    getAuthConfig: vi.fn(),
    logout: vi.fn(),
  },
}));

vi.mock('./components/Navbar', () => ({
  default: ({ sidebarCollapsed, setSidebarCollapsed }) => (
    <nav data-testid="navbar">
      <button type="button" onClick={() => setSidebarCollapsed((current) => !current)}>
        切換側邊欄
      </button>
      <span data-testid="sidebar-state">{sidebarCollapsed ? 'collapsed' : 'expanded'}</span>
    </nav>
  ),
}));
vi.mock('./pages/DashboardPage', () => ({ default: () => <div data-testid="dashboard-page">dashboard</div> }));
vi.mock('./pages/BatchUpdatePage', () => ({
  default: ({ sysSettings }) => (
    <div data-testid="batch-page">{JSON.stringify(sysSettings?.shared_team_person_filter || {})}</div>
  ),
}));
vi.mock('./pages/PublishCleanerPage', () => ({ default: () => <div>publish</div> }));
vi.mock('./pages/SheetCopyPage', () => ({
  default: ({ sysSettings, onSharedFilterSaved }) => (
    <div data-testid="sheet-copy-page">
      <span>{JSON.stringify(sysSettings?.shared_team_person_filter || {})}</span>
      <button
        type="button"
        onClick={() =>
          onSharedFilterSaved?.({
            configured: true,
            team: '',
            teams: ['Team A'],
            query: '',
            selected_people: ['person:["Team A","person","Alice"]'],
          })
        }
      >
        模擬更新共用篩選
      </button>
      <Link to="/youtube/drafts/videos">前往 Video 快速套用</Link>
    </div>
  ),
}));
vi.mock('./pages/YouTubeSettingsPage', () => ({ default: () => <div>youtube settings</div> }));
vi.mock('./pages/GoogleSheetSettingsPage', () => ({ default: () => <div>sheets settings</div> }));
vi.mock('./pages/YtmusicSettingsPage', () => ({ default: () => <div>ytmusic settings</div> }));
vi.mock('./pages/PlaylistSortPage', () => ({ default: () => <div>playlist sort</div> }));
vi.mock('./pages/ApiHealthPage', () => ({ default: () => <div>api health</div> }));
vi.mock('./pages/LoginPage', () => ({
  default: ({ initialError }) => <div data-testid="login-page">{initialError || '登入頁'}</div>,
}));
vi.mock('./hooks/useAccountWorkState', () => ({
  default: () => ({ value: {}, ready: false, save: vi.fn() }),
  AccountWorkStateProvider: ({ children }) => <>{children}</>,
}));

const userResponse = {
  authenticated: true,
  user: { sub: 'subject-a', email: 'user@example.test' },
  youtube: { slots: { primary: { authenticated: false } } },
};
const networkError = { code: 'network_error', status: 0, message: 'offline' };

function setDocumentHidden(value) {
  Object.defineProperty(document, 'hidden', { configurable: true, value });
}

async function firePersistedPageShow() {
  const event = new Event('pageshow');
  Object.defineProperty(event, 'persisted', { configurable: true, value: true });
  await act(async () => {
    window.dispatchEvent(event);
  });
}

describe('App recovery state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setDocumentHidden(false);
    api.getHealth.mockResolvedValue({ commit_sha: 'development' });
    api.getTools.mockResolvedValue({
      tools: getAllTools().map((tool) => ({
        id: tool.id,
        status: 'active',
        version: '1.0.0',
        entry_url: tool.entryUrl,
        required_scopes: [],
      })),
    });
    api.getUserStatus.mockResolvedValue({ authenticated: false });
    api.getSystemInfo.mockResolvedValue({});
    api.getSharedSettings.mockResolvedValue({});
    api.getYoutubeSettings.mockResolvedValue({});
    api.getTeamPersonFilter.mockResolvedValue({ configured: false, team: '', selected_people: [] });
    api.getWorkState.mockResolvedValue({ state: {} });
    api.getAuthConfig.mockResolvedValue({ has_client_id: true, has_client_secret: true });
    api.logout.mockResolvedValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    setDocumentHidden(false);
    window.history.replaceState({}, '', '/');
  });

  it('shows reconnecting on an initial network failure instead of a blank or login page', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    api.getUserStatus.mockRejectedValueOnce(networkError);

    render(<App />);

    expect(await screen.findByText('連線中斷，正在重新連線')).toBeInTheDocument();
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '立即重試' })).toBeInTheDocument();
  });

  it('keeps the authenticated screen when a resume request fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    api.getUserStatus.mockResolvedValueOnce(userResponse);
    render(<App />);
    expect(await screen.findByTestId('dashboard-page')).toBeInTheDocument();

    api.getUserStatus.mockRejectedValueOnce(networkError).mockImplementation(() => new Promise(() => {}));
    await firePersistedPageShow();

    expect(await screen.findByText('連線中斷，正在重新連線')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-page')).toBeInTheDocument();
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
  });

  it('switches to the login page only when the API explicitly reports unauthenticated', async () => {
    api.getUserStatus.mockResolvedValueOnce(userResponse);
    render(<App />);
    expect(await screen.findByTestId('dashboard-page')).toBeInTheDocument();

    api.getUserStatus.mockResolvedValueOnce({ authenticated: false });
    await firePersistedPageShow();

    expect(await screen.findByTestId('login-page')).toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-page')).not.toBeInTheDocument();
  });

  it('rechecks authentication for a persisted pageshow event', async () => {
    api.getUserStatus.mockResolvedValue(userResponse);
    render(<App />);
    expect(await screen.findByTestId('dashboard-page')).toBeInTheDocument();
    const callsAfterInit = api.getUserStatus.mock.calls.length;

    await firePersistedPageShow();

    await waitFor(() => expect(api.getUserStatus).toHaveBeenCalledTimes(callsAfterInit + 1));
  });

  it('preserves a sidebar change made before a stale settings refresh finishes', async () => {
    let resolveRefreshedState;
    api.getUserStatus.mockResolvedValue(userResponse);
    api.getWorkState
      .mockResolvedValueOnce({ state: { navigation: { sidebarCollapsed: false } } })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveRefreshedState = resolve;
          })
      );
    render(<App />);
    expect(await screen.findByTestId('dashboard-page')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-state')).toHaveTextContent('expanded');

    await firePersistedPageShow();
    await waitFor(() => expect(api.getWorkState).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: '切換側邊欄' }));
    expect(screen.getByTestId('sidebar-state')).toHaveTextContent('collapsed');

    await act(async () => {
      resolveRefreshedState({ state: { navigation: { sidebarCollapsed: false } } });
    });
    expect(screen.getByTestId('sidebar-state')).toHaveTextContent('collapsed');
  });

  it('shows a non-destructive update prompt when the backend build changes', async () => {
    api.getUserStatus.mockResolvedValue(userResponse);
    api.getHealth.mockResolvedValue({ commit_sha: 'new-backend-sha' });
    render(<App />);
    expect(await screen.findByTestId('dashboard-page')).toBeInTheDocument();

    await firePersistedPageShow();

    expect(await screen.findByText('Toolbox 已更新，請重新載入。')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-page')).toBeInTheDocument();
  });

  it('rechecks after being hidden longer than the threshold', async () => {
    vi.useFakeTimers();
    api.getUserStatus.mockResolvedValue(userResponse);
    render(<App />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId('dashboard-page')).toBeInTheDocument();
    const callsAfterInit = api.getUserStatus.mock.calls.length;

    setDocumentHidden(true);
    await act(async () => {
      fireEvent(document, new Event('visibilitychange'));
    });
    const hiddenStartedAt = Date.now();
    vi.setSystemTime(hiddenStartedAt + 5 * 60 * 1000 + 1);
    setDocumentHidden(false);
    await act(async () => {
      fireEvent(document, new Event('visibilitychange'));
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(api.getUserStatus).toHaveBeenCalledTimes(callsAfterInit + 1);
  });

  it('shares one recovery request across simultaneous resume events', async () => {
    let resolveRecovery;
    api.getUserStatus.mockResolvedValueOnce(userResponse).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRecovery = resolve;
        })
    );
    render(<App />);
    expect(await screen.findByTestId('dashboard-page')).toBeInTheDocument();
    const callsAfterInit = api.getUserStatus.mock.calls.length;

    await firePersistedPageShow();
    window.dispatchEvent(new Event('online'));

    await waitFor(() => expect(api.getUserStatus).toHaveBeenCalledTimes(callsAfterInit + 1));
    resolveRecovery(userResponse);
    await waitFor(() => expect(screen.getByTestId('dashboard-page')).toBeInTheDocument());
    expect(api.getUserStatus).toHaveBeenCalledTimes(callsAfterInit + 1);
  });

  it('uses online to recover from the initial reconnecting state', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    api.getUserStatus.mockRejectedValueOnce(networkError);
    render(<App />);
    expect(await screen.findByText('連線中斷，正在重新連線')).toBeInTheDocument();

    api.getUserStatus.mockResolvedValueOnce(userResponse);
    window.dispatchEvent(new Event('online'));

    expect(await screen.findByTestId('dashboard-page')).toBeInTheDocument();
  });

  it('identifies a backend/frontend build mismatch without automatically reloading', () => {
    expect(hasVersionMismatch('sha-a', 'sha-b')).toBe(true);
    expect(hasVersionMismatch('sha-a', 'sha-a')).toBe(false);
    expect(hasVersionMismatch('', 'sha-a')).toBe(false);
  });

  it('checks backend version during initial load without waiting for resume', async () => {
    api.getUserStatus.mockResolvedValue(userResponse);
    api.getHealth.mockResolvedValue({ commit_sha: 'new-initial-sha' });

    render(<App />);

    expect(await screen.findByTestId('dashboard-page')).toBeInTheDocument();
    expect(await screen.findByText('Toolbox 已更新，請重新載入。')).toBeInTheDocument();
    expect(api.getHealth).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      hash: `#auth_error=${encodeURIComponent('此 Google 帳號未列入系統允許名單，無法登入。')}`,
      authenticated: false,
      expected: '此 Google 帳號未列入系統允許名單，無法登入。',
    },
    {
      hash: `#youtube_auth_error=${encodeURIComponent('Primary 與 Secondary 槽位必須管理同一個 YouTube 頻道。')}`,
      authenticated: true,
      expected: 'Primary 與 Secondary 槽位必須管理同一個 YouTube 頻道。',
    },
    {
      hash: `#sheets_auth_error=${encodeURIComponent('<img src=x onerror=alert(1)>')}`,
      authenticated: true,
      expected: 'Google 試算表授權失敗，請重新嘗試。',
    },
    {
      hash: `#ytmusic_auth_error=${encodeURIComponent('YouTube Music 授權已拒絕')}`,
      authenticated: true,
      expected: 'YouTube Music 授權已拒絕',
    },
  ])(
    'surfaces sanitized OAuth callback error messages from URL hash ($hash)',
    async ({ hash, authenticated, expected }) => {
      api.getUserStatus.mockResolvedValue(authenticated ? userResponse : { authenticated: false });
      window.history.replaceState({}, '', `/login${hash}`);

      render(<App />);

      expect((await screen.findAllByText(expected)).length).toBeGreaterThanOrEqual(1);
      expect(window.location.hash).toBe('');
    }
  );

  it('propagates saved shared_team_person_filter across SPA navigation without stale cache overwrite', async () => {
    api.getUserStatus.mockResolvedValue(userResponse);
    api.getTeamPersonFilter.mockResolvedValue({
      configured: true,
      team: '',
      teams: ['Old Team'],
      query: '',
      selected_people: [],
    });

    render(
      <MemoryRouter initialEntries={['/sheets/copy']}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByTestId('sheet-copy-page')).toBeInTheDocument();
    expect(screen.getByTestId('sheet-copy-page')).toHaveTextContent('Old Team');

    fireEvent.click(screen.getByRole('button', { name: '模擬更新共用篩選' }));
    fireEvent.click(screen.getByRole('link', { name: '前往 Video 快速套用' }));

    expect(await screen.findByTestId('batch-page')).toBeInTheDocument();
    expect(screen.getByTestId('batch-page')).toHaveTextContent('Team A');
    expect(screen.getByTestId('batch-page')).not.toHaveTextContent('Old Team');
  });
});

describe('ErrorBoundary', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows a safe recovery message without exposing the original JavaScript error', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    function BrokenComponent() {
      throw new Error('private implementation details');
    }

    render(
      <ErrorBoundary>
        <BrokenComponent />
      </ErrorBoundary>
    );

    expect(screen.getByText('應用程式暫時無法顯示')).toBeInTheDocument();
    expect(screen.getByText('為保護錯誤內容，詳細資訊不會顯示。請重新開啟本頁。')).toBeInTheDocument();
    expect(screen.queryByText('private implementation details')).not.toBeInTheDocument();
  });
});
