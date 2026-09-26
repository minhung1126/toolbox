import { getAllTools } from '../src/tools/catalog';

export const toolCatalog = getAllTools().map((tool) => ({
  id: tool.id,
  name: tool.name,
  title: tool.title,
  description: tool.description,
  category: tool.category,
  status: tool.status,
  version: '1.0.0',
  entry_url: tool.entryUrl,
  required_scopes: [],
}));

export async function mockAuthenticatedBackend(page, responseOverrides: Record<string, unknown> = {}) {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const responses: Record<string, unknown> = {
      '/api/v1/auth/user': {
        authenticated: true,
        user: { sub: 'design-system-e2e', email: 'design-system@example.test' },
        authorizations: {
          sheets: { connected: false },
          ytmusic: { connected: false },
          video_uploader: { connected: false },
        },
        google_scopes: {},
        youtube: { slots: {} },
      },
      '/api/v1/settings/system': {},
      '/api/v1/settings/shared': {},
      '/api/v1/settings/youtube': {},
      '/api/v1/settings/team-person-filter': { configured: false, team: '', selected_people: [] },
      '/api/v1/settings/work-state': { state: {} },
      '/api/v1/health': { commit_sha: 'development' },
      '/api/v1/tools': { tools: toolCatalog },
      '/api/v1/weverse-uploader/scan': {
        packages: [
          {
            package_id: 'sample-live',
            suggested_title: 'Sample Live',
            video: {
              filename: 'sample-live.mp4',
              full_path: 'C:\\weverse\\sample-live.mp4',
              size_formatted: '1 MB',
            },
            subtitles: [
              {
                id: 'sample-subtitle',
                filename: 'sample-live.zh_TW.vtt',
                full_path: 'C:\\weverse\\sample-live.zh_TW.vtt',
                raw_lang: 'zh_TW',
                bcp47: 'zh-TW',
                label: '繁體中文',
                size_formatted: '1 KB',
              },
            ],
          },
        ],
      },
      ...responseOverrides,
    };

    const response = responses[path] ?? {};
    if (typeof response === 'function') {
      await response(route);
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response),
    });
  });
}
