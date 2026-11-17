import { getAllTools } from '../src/tools/catalog';
import { PATHS } from '../src/routes/paths';

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
  routes: [
    ...(tool.featureCards || []).map((card) => ({
      path: card.to,
      required_scopes: routeScopes[tool.id]?.[card.to] ?? toolScopes[tool.id] ?? [],
    })),
    ...(tool.id === 'creator-tools'
      ? [PATHS.youtubeVideoStaging, PATHS.youtubeShortsStaging].map((path) => ({
          path,
          required_scopes: toolScopes[tool.id],
        }))
      : []),
  ],
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

/** Provider fakes for the staged workflow; no YouTube writes occur in the browser suite. */
export function draftPublishResponses({
  channelId = 'channel-e2e',
  titleFor = (_assignment) => 'New',
  descriptionFor = (_assignment) => '',
} = {}) {
  return {
    '/api/v1/youtube/drafts/prepare': async (route) => {
      const source = route.request().postDataJSON();
      await route.fulfill({
        json: {
          stage_token: 'signed-stage',
          stage_snapshot: {
            version: 1,
            stage_id: `stage-${source.video_type}`,
            video_type: source.video_type,
            youtube_slot: 'primary',
            youtube_channel_id: channelId,
            source,
            plan: source.assignments.map((assignment) => ({
              video_id: assignment.video_id,
              person_key: assignment.person,
              person: assignment.person,
              currentTitle: `Original ${assignment.video_id}`,
              currentDescription: 'Original description',
              currentPrivacy: 'private',
              newTitle: assignment.person === '不編輯' ? '' : titleFor(assignment),
              newDescription: assignment.person === '不編輯' ? '' : descriptionFor(assignment),
              status: assignment.person === '不編輯' ? 'skipped' : 'ready',
              reason: assignment.person === '不編輯' ? '未指定人物' : '',
              thumbnailUrl: '',
            })),
          },
        },
      });
    },
    '/api/v1/youtube/drafts/preview': async (route) => {
      const payload = route.request().postDataJSON();
      const plan = payload.edits.map((edit) => ({
        ...edit,
        person: '指定人物',
        status: edit.skip ? 'skipped' : 'ready',
        reason: edit.skip ? '略過' : '',
        parts: edit.skip ? [] : ['snippet', 'status'],
        write_units: edit.skip ? 0 : 50,
      }));
      const count = plan.filter((item) => item.parts.length).length;
      await route.fulfill({
        json: {
          preview_token: 'signed-final',
          preview_snapshot: { youtube_slot: 'primary', plan },
          plan,
          quota: {
            write_calls: count,
            write_units: count * 50,
            read_units: 2 + count,
            projected_units: count * 51 + 2,
          },
        },
      });
    },
    '/api/v1/youtube/drafts/publish': async (route) => {
      const payload = route.request().postDataJSON();
      await route.fulfill({
        json: {
          operation: 'youtube.metadata_publish',
          operation_id: 'operation-e2e',
          completed: true,
          results: payload.edits.map((edit) => ({
            ...edit,
            person: '指定人物',
            status: edit.skip ? 'skipped' : 'succeeded',
          })),
        },
      });
    },
  };
}
