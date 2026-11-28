import type { Page, Route } from '@playwright/test';
import { getAllTools } from '../src/tools/catalog';
import { PATHS } from '../src/routes/paths';

interface FeatureCardLike {
  to: string;
}

interface DraftAssignment {
  video_id: string;
  person: string;
}

interface DraftEdit {
  video_id: string;
  title: string;
  description: string;
  skip: boolean;
}

interface DraftProgressRow extends DraftEdit {
  person: string;
  status: string;
  attempted_parts?: string[];
  confirmation?: string | null;
}

type RouteHandler = (route: Route) => Promise<void>;
export type RouteOverrides = Record<string, unknown | RouteHandler>;

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
    ...(tool.featureCards || []).map((card: FeatureCardLike) => ({
      path: card.to,
      required_scopes: routeScopes[tool.id]?.[card.to] ?? toolScopes[tool.id] ?? [],
    })),
    ...(tool.id === 'creator-tools'
      ? [PATHS.youtubeVideoStaging, PATHS.youtubeShortsStaging]
          .filter((path) => !tool.featureCards.some((card: FeatureCardLike) => card.to === path))
          .map((path) => ({
            path,
            required_scopes: toolScopes[tool.id],
          }))
      : []),
  ],
}));

export async function mockAuthenticatedBackend(page: Page, responseOverrides: RouteOverrides = {}) {
  const workState: Record<string, unknown> = {};
  await page.route('**/api/v1/**', async (route: Route) => {
    const path = new URL(route.request().url()).pathname;
    const responses: RouteOverrides = {
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
      '/api/v1/settings/work-state': async (workStateRoute: Route) => {
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

    const response =
      responses[path] ?? Object.entries(responses).find(([key]) => key.endsWith('/*') && path.startsWith(key.slice(0, -1)))?.[1] ?? {};
    if (typeof response === 'function') {
      await (response as RouteHandler)(route);
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
  titleFor = (_assignment: DraftAssignment): string => 'New',
  descriptionFor = (_assignment: DraftAssignment): string => '',
}: {
  channelId?: string;
  titleFor?: (assignment: DraftAssignment) => string;
  descriptionFor?: (assignment: DraftAssignment) => string;
} = {}): {
  '/api/v1/youtube/drafts/prepare': RouteHandler;
  '/api/v1/youtube/drafts/preview': RouteHandler;
  '/api/v1/youtube/drafts/publish-jobs': RouteHandler;
  '/api/v1/operations/operation-e2e': RouteHandler;
  '/api/v1/youtube/drafts/publish-jobs/by-request/*': RouteHandler;
} {
  let job: Record<string, unknown> | null = null;
  const statuses = ['queued', 'running', 'succeeded', 'unchanged', 'skipped', 'failed', 'not_attempted', 'needs_reconciliation'];
  const progress = (rows: DraftProgressRow[], revision = 1) => ({
    version: 1,
    revision,
    total: rows.length,
    rows,
    counts: Object.fromEntries(statuses.map((status) => [status, rows.filter((row) => row.status === status).length])),
  });
  return {
    '/api/v1/youtube/drafts/prepare': async (route: Route) => {
      const source = route.request().postDataJSON() as { video_type: string; assignments: DraftAssignment[] };
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
              person: assignment.person.startsWith('person:') ? JSON.parse(assignment.person.slice(7))[2] : assignment.person,
              currentTitle: `Original ${assignment.video_id}`,
              currentDescription: 'Original description',
              currentPrivacy: 'private',
              newTitle: assignment.person === '不編輯' ? '' : titleFor(assignment),
              newDescription: assignment.person === '不編輯' ? '' : descriptionFor(assignment),
              status: assignment.person === '不編輯' ? 'skipped' : 'ready',
              reason: assignment.person === '不編輯' ? '未指定人物' : '',
              thumbnailUrl:
                'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%2268%22%3E%3Crect width=%22120%22 height=%2268%22 fill=%22%233b3655%22/%3E%3C/svg%3E',
            })),
          },
        },
      });
    },
    '/api/v1/youtube/drafts/preview': async (route: Route) => {
      const payload = route.request().postDataJSON() as { edits: DraftEdit[] };
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
    '/api/v1/youtube/drafts/publish-jobs': async (route: Route) => {
      const payload = route.request().postDataJSON() as { stage_snapshot: unknown; edits: DraftEdit[] };
      const rows: DraftProgressRow[] = payload.edits.map((edit) => ({
        ...edit,
        person: '指定人物',
        status: edit.skip ? 'skipped' : 'succeeded',
        attempted_parts: edit.skip ? [] : ['snippet', 'status'],
        confirmation: edit.skip ? null : 'provider_response',
      }));
      job = {
        version: 2,
        id: 'operation-e2e',
        kind: 'youtube.metadata_publish',
        channel_id: channelId,
        state: 'completed',
        plan: { stage_snapshot: payload.stage_snapshot, edits: payload.edits },
        progress: progress(rows, 2),
      };
      await route.fulfill({
        status: 202,
        json: {
          version: 1,
          operation_id: job.id,
          state: 'prepared',
          progress: progress(
            rows.map((row) => ({
              ...row,
              status: row.status === 'skipped' ? 'skipped' : 'queued',
              attempted_parts: [],
              confirmation: null,
            }))
          ),
        },
      });
    },
    '/api/v1/operations/operation-e2e': async (route: Route) => {
      await route.fulfill(job ? { json: job } : { status: 404, json: { detail: { code: 'operation_not_found', message: '尚未受理' } } });
    },
    '/api/v1/youtube/drafts/publish-jobs/by-request/*': async (route: Route) => {
      await route.fulfill(job ? { json: job } : { status: 404, json: { detail: { code: 'operation_not_found', message: '尚未受理' } } });
    },
  };
}
