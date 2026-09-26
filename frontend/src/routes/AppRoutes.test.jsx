import React from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AppRoutes from './AppRoutes';
import { PATHS } from './paths';
import { api } from '../services/api';
import { getAllTools } from '../tools/catalog';

vi.mock('../layouts/AppShell', async () => {
  const { Outlet: RouterOutlet } = await import('react-router-dom');
  return { default: () => <RouterOutlet /> };
});
vi.mock('../layouts/YouTubeSettingsLayout', async () => {
  const { Outlet: RouterOutlet } = await import('react-router-dom');
  return { default: () => <RouterOutlet /> };
});
vi.mock('../layouts/AccountSettingsLayout', async () => {
  const { Outlet: RouterOutlet } = await import('react-router-dom');
  return { default: () => <RouterOutlet /> };
});
vi.mock('../pages/DashboardPage', () => ({ default: () => <div>dashboard route</div> }));
vi.mock('../pages/ApiHealthPage', () => ({ default: () => <div>health route</div> }));
vi.mock('../pages/SystemInfoPage', () => ({ default: () => <div>info route</div> }));
vi.mock('../pages/ComponentShowcasePage', () => ({ default: () => <div>component showcase route</div> }));
vi.mock('../pages/PublishCleanerPage', () => ({ default: () => <div>publish route</div> }));
vi.mock('../pages/SheetCopyPage', () => ({ default: () => <div>sheet route</div> }));
vi.mock('../pages/BatchUpdatePage', () => ({ default: ({ videoType }) => <div>{videoType} batch route</div> }));
vi.mock('../pages/YoutubeConnectionsPage', () => ({ default: () => <div>connections route</div> }));
vi.mock('../pages/YoutubeRoutingPage', () => ({ default: () => <div>routing route</div> }));
vi.mock('../pages/YoutubeQuotaPage', () => ({ default: () => <div>quota route</div> }));
vi.mock('../pages/YoutubePlaylistSettingsPage', () => ({ default: () => <div>playlist route</div> }));
vi.mock('../pages/GoogleAccountSettingsPage', () => ({ default: () => <div>google settings route</div> }));
vi.mock('../pages/GoogleSheetSettingsPage', () => ({ default: () => <div>sheet settings route</div> }));
vi.mock('../pages/SystemSettingsPage', () => ({ default: () => <div>system settings route</div> }));
vi.mock('../pages/StickyNotesPage', () => ({ default: () => <div>notes route</div> }));
vi.mock('../pages/PhotoCuratorPage', () => ({ default: () => <div>photo curator route</div> }));
vi.mock('../pages/FfmpegGeneratorPage', () => ({ default: () => <div>FFmpeg route</div> }));
vi.mock('../pages/WeverseUploaderPage', () => ({ default: () => <div>Weverse uploader route</div> }));
vi.mock('../pages/LoginPage', () => ({ default: ({ returnTo }) => <div>login route {returnTo || 'none'}</div> }));

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
    </output>
  );
}

function renderRoutes(initialEntry, overrides = {}) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AppRoutes
        authStatus="authenticated"
        authUser={{ sub: 'user-1', email: 'creator@example.com' }}
        authError={null}
        workState={{}}
        updateAvailable={false}
        settingsStatus={null}
        settingsRefreshing={false}
        fetchSettings={vi.fn()}
        fetchUser={vi.fn()}
        pageResume={{ retryNow: vi.fn(), isResuming: false }}
        onLogout={vi.fn()}
        sidebarCollapsed={false}
        setSidebarCollapsed={vi.fn()}
        oauthReturnPath={null}
        clearOAuthReturnPath={vi.fn()}
        sysSettings={{}}
        {...overrides}
      />
      <LocationProbe />
    </MemoryRouter>
  );
}

describe('AppRoutes', () => {
  beforeEach(() => {
    vi.spyOn(api, 'getTools').mockResolvedValue({
      tools: getAllTools().map((tool) => ({
        id: tool.id,
        status: 'active',
        entry_url: tool.entryUrl,
        name: tool.name,
        title: tool.title,
        description: tool.description,
        category: tool.category,
        version: '1.0.0',
        required_scopes: [],
      })),
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('blocks a deep link when the backend disables its tool', async () => {
    api.getTools.mockResolvedValue({
      tools: getAllTools().map((tool) => ({
        id: tool.id,
        status: tool.id === 'creator-tools' ? 'disabled' : 'active',
        version: '1.0.0',
        entry_url: tool.entryUrl,
      })),
    });
    renderRoutes(PATHS.youtubeVideoDrafts);
    expect(await screen.findByText('此工具目前未啟用。')).toBeInTheDocument();
    expect(screen.queryByText('Video batch route')).not.toBeInTheDocument();
  });

  it('shows an error instead of loading a route for an unsupported catalog version', async () => {
    api.getTools.mockResolvedValue({
      tools: getAllTools().map((tool) => ({
        id: tool.id,
        status: 'active',
        version: tool.id === 'creator-tools' ? '2.0.0' : '1.0.0',
        entry_url: tool.entryUrl,
      })),
    });
    renderRoutes(PATHS.youtubeVideoDrafts);
    expect(await screen.findByText('工具 creator-tools 的版本不受支援。')).toBeInTheDocument();
    expect(screen.queryByText('Video batch route')).not.toBeInTheDocument();
  });

  it('retries a failed catalog load before opening a tool route', async () => {
    const catalog = await api.getTools();
    api.getTools.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(catalog);
    renderRoutes(PATHS.notes);
    expect(await screen.findByText('offline')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重試載入工具目錄' }));
    expect(await screen.findByText('notes route')).toBeInTheDocument();
  });

  it.each([
    [PATHS.dashboard, 'dashboard route'],
    [PATHS.systemHealth, 'health route'],
    [PATHS.systemInfo, 'info route'],
    [PATHS.componentShowcase, 'component showcase route'],
    [PATHS.youtubeVideoDrafts, 'Video batch route'],
    [PATHS.youtubeShortsDrafts, 'Shorts batch route'],
    [PATHS.youtubePublishCleanup, 'publish route'],
    [PATHS.youtubeConnections, 'connections route'],
    [PATHS.youtubeRouting, 'routing route'],
    [PATHS.youtubeQuota, 'quota route'],
    [PATHS.youtubePlaylist, 'playlist route'],
    [PATHS.sheetCopy, 'sheet route'],
    [PATHS.googleSettings, 'google settings route'],
    [PATHS.sheetSettings, 'sheet settings route'],
    [PATHS.systemSettings, 'system settings route'],
    [PATHS.notes, 'notes route'],
    [PATHS.photoCurator, 'photo curator route'],
    [PATHS.ffmpegGenerator, 'FFmpeg route'],
  ])('renders %s', async (path, expected) => {
    renderRoutes(path);
    expect(await screen.findByText(expected)).toBeInTheDocument();
  });

  it('renders the lazy-loaded Weverse uploader route', async () => {
    renderRoutes(PATHS.weverseUploader);
    expect(await screen.findByText('Weverse uploader route')).toBeInTheDocument();
  });

  it.each([
    ['/', PATHS.dashboard, 'dashboard route'],
    [PATHS.youtubeSettings, PATHS.youtubeConnections, 'connections route'],
    [PATHS.settings, PATHS.googleSettings, 'google settings route'],
  ])('replaces parent path %s with %s', async (from, to, expected) => {
    renderRoutes(from);
    expect(await screen.findByText(expected)).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(to);
  });

  it.each([
    [PATHS.youtubeSettings, PATHS.youtubeConnections],
    [PATHS.settings, PATHS.googleSettings],
  ])('preserves canonical destination for unauthenticated alias %s', (alias, canonicalPath) => {
    renderRoutes(alias, { authStatus: 'unauthenticated', authUser: null });
    expect(screen.getByText(`login route ${canonicalPath}`)).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(`/login?returnTo=${encodeURIComponent(canonicalPath)}`);
  });

  it.each(['/youtube/settings/missing', '/settings/missing'])(
    'renders 404 for unknown settings child path %s',
    async (path) => {
      renderRoutes(path);
      expect(await screen.findByText('找不到頁面')).toBeInTheDocument();
    }
  );

  it('renders a safe 404 for an unknown protected URL', async () => {
    renderRoutes('/not-a-real-page');
    expect(await screen.findByText('找不到頁面')).toBeInTheDocument();
  });

  it('preserves a safe deep path when auth is missing', () => {
    renderRoutes(PATHS.youtubeVideoDrafts, { authStatus: 'unauthenticated', authUser: null });
    expect(screen.getByText('login route /youtube/drafts/videos')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/login?returnTo=%2Fyoutube%2Fdrafts%2Fvideos');
  });
});
