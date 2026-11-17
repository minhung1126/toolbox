import { getAllTools } from '../src/tools/catalog';

const toolScopes: Record<string, string[]> = {
  'creator-tools': ['youtube', 'sheets_readonly'],
  'youtube-music': ['youtube'],
  'sheets-tools': ['sheets_readonly'],
  'youtube-integrations': ['youtube'],
};

const routeScopes: Record<string, Record<string, string[]>> = {
  'creator-tools': { '/youtube/publish-cleanup': ['youtube'] },
  'youtube-music': { '/ytmusic/settings': [] },
  'sheets-tools': { '/sheets/settings': [] },
  'youtube-integrations': { '/youtube/settings/connections': [] },
};

export const toolCatalog = getAllTools().map((tool) => ({
  id: tool.id,
  name: tool.name,
  title: tool.title,
  description: tool.description,
  category: tool.category,
  status: tool.status,
  version: '1.0.0',
  entry_url: tool.entryUrl,
  required_scopes: toolScopes[tool.id] || [],
  routes: (tool.featureCards || []).map((card) => ({
    path: card.to,
    required_scopes: routeScopes[tool.id]?.[card.to] ?? toolScopes[tool.id] ?? [],
  })),
}));

export async function mockAuthenticatedBackend(page, responseOverrides: Record<string, unknown> = {}) {
  const workState: Record<string, unknown> = {};
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const responses: Record<string, unknown> = {
      '/api/v1/auth/user': {
        authenticated: true,
        user: { sub: 'design-system-e2e', email: 'design-system@example.test' },
        authorizations: {
          sheets: { connected: false },
          ytmusic: { connected: false },
        },
        google_scopes: {},
        youtube: { slots: {} },
      },
      '/api/v1/settings/system': {},
      '/api/v1/settings/shared': {},
      '/api/v1/settings/youtube': {},
      '/api/v1/settings/team-person-filter': { configured: false, team: '', selected_people: [] },
      '/api/v1/settings/work-state': async (workStateRoute) => {
        if (workStateRoute.request().method() === 'PUT') {
          const { key, value } = workStateRoute.request().postDataJSON();
          workState[key] = value;
        }
        await workStateRoute.fulfill({ status: 200, json: { version: 1, state: workState } });
      },
      '/api/v1/health': { commit_sha: 'development' },
      '/api/v1/tools': { tools: toolCatalog },
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
