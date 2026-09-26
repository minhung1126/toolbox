import youtubeManifest from '../features/youtube/manifest';
import ytmusicManifest from '../features/ytmusic/manifest';
import sheetsManifest from '../features/sheets/manifest';
import photoCuratorManifest from '../features/photo-curator/manifest';
import ffmpegManifest from '../features/ffmpeg/manifest';
import weverseManifest from '../features/weverse/manifest';
import notesManifest from '../features/notes/manifest';
import youtubeIntegrationsManifest from '../features/youtube-integrations/manifest';
import systemManifest from '../features/system/manifest';
import { PATHS } from '../routes/paths';
import { validateToolScopes } from './capabilities';

/** Aggregated feature manifests used by navigation and dashboard views. */
export const TOOL_MODULES = Object.freeze(
  validateFeatureManifests([
    youtubeManifest,
    ytmusicManifest,
    sheetsManifest,
    photoCuratorManifest,
    ffmpegManifest,
    weverseManifest,
    notesManifest,
    youtubeIntegrationsManifest,
    systemManifest,
  ])
);

export function validateFeatureManifests(manifests) {
  if (!Array.isArray(manifests)) throw new TypeError('Feature manifests must be an array.');

  const knownPaths = new Set(Object.values(PATHS));
  const toolIds = new Set();
  const navGroupIds = new Set();
  const navItemIds = new Set();
  const featureCardIds = new Set();
  const routePaths = new Set();
  const indexPaths = new Set();
  const wildcardPaths = new Set();
  const assertKnownPath = (path, label) => {
    if (typeof path !== 'string' || !knownPaths.has(path)) {
      throw new Error(`${label} points to an unknown route: ${String(path)}`);
    }
  };
  const validateRoutes = (routes, parentPath = '') => {
    for (const route of routes || []) {
      let fullPath = parentPath;
      if (route.index && (route.path || route.children?.length)) {
        throw new Error(`Feature index route ${parentPath} cannot declare a path or children.`);
      }
      if (route.path && route.path !== '*') {
        fullPath = route.path.startsWith('/') ? route.path : `${parentPath}/${route.path}`.replace(/\/+/g, '/');
        assertKnownPath(fullPath.replace(/\/\*$/, ''), `Feature route ${route.path}`);
        if (routePaths.has(fullPath)) throw new Error(`Duplicate feature route: ${fullPath}`);
        routePaths.add(fullPath);
      } else if (route.index) {
        assertKnownPath(parentPath, `Feature index route ${parentPath}`);
        if (indexPaths.has(parentPath)) throw new Error(`Duplicate feature index route: ${parentPath}`);
        indexPaths.add(parentPath);
      } else if (route.path === '*') {
        if (wildcardPaths.has(parentPath)) throw new Error(`Duplicate feature wildcard route: ${parentPath}`);
        wildcardPaths.add(parentPath);
      }
      if (route.redirectTo) {
        const destination = route.redirectTo.startsWith('/')
          ? route.redirectTo
          : `${fullPath.replace(/\/\*$/, '')}/${route.redirectTo}`.replace(/\/+/g, '/');
        assertKnownPath(destination, `Feature redirect ${fullPath}`);
      }
      if (!route.component && !route.redirectTo && !route.children?.length) {
        throw new Error(`Feature route ${fullPath || route.path} has no component or redirect.`);
      }
      validateRoutes(route.children, fullPath.replace(/\/\*$/, ''));
    }
  };

  for (const manifest of manifests) {
    if (!manifest || typeof manifest.id !== 'string' || !manifest.id.trim()) {
      throw new Error('Every feature manifest must declare an id.');
    }
    if (toolIds.has(manifest.id)) throw new Error(`Duplicate feature id: ${manifest.id}`);
    toolIds.add(manifest.id);
    assertKnownPath(manifest.entryUrl, `Feature ${manifest.id}`);

    for (const group of manifest.navGroups || []) {
      if (!group?.id || navGroupIds.has(group.id))
        throw new Error(`Duplicate or missing navigation group id: ${group?.id}`);
      navGroupIds.add(group.id);
      for (const item of group.items || []) {
        if (!item?.id || navItemIds.has(item.id))
          throw new Error(`Duplicate or missing navigation item id: ${item?.id}`);
        navItemIds.add(item.id);
        assertKnownPath(item.to, `Navigation item ${item.id}`);
      }
    }

    for (const card of manifest.featureCards || []) {
      if (!card?.id || featureCardIds.has(card.id))
        throw new Error(`Duplicate or missing feature card id: ${card?.id}`);
      featureCardIds.add(card.id);
      assertKnownPath(card.to, `Feature card ${card.id}`);
    }
    validateRoutes(manifest.routes);
  }
  return manifests;
}

/** Join server-owned availability and metadata to locally controlled views. */
export function reconcileToolCatalog(payload) {
  if (!Array.isArray(payload?.tools)) throw new Error('工具目錄回應格式不正確。');
  const known = new Map(TOOL_MODULES.map((tool) => [tool.id, tool]));
  const seen = new Set();
  const available = new Map();
  for (const metadata of payload.tools) {
    const manifest = known.get(metadata?.id);
    if (!manifest) throw new Error(`未知的後端工具 ID：${String(metadata?.id)}`);
    if (seen.has(metadata.id)) throw new Error(`重複的後端工具 ID：${metadata.id}`);
    seen.add(metadata.id);
    if (!['active', 'beta', 'disabled'].includes(metadata.status)) {
      throw new Error(`工具 ${metadata.id} 的狀態不受支援。`);
    }
    if (!/^1\.\d+\.\d+$/.test(metadata.version)) {
      throw new Error(`工具 ${metadata.id} 的版本不受支援。`);
    }
    if (metadata.entry_url !== manifest.entryUrl) {
      throw new Error(`工具 ${metadata.id} 的入口與前端路由不一致。`);
    }
    validateToolScopes(metadata.id, metadata.required_scopes);
    if (metadata.status === 'disabled') continue;
    available.set(metadata.id, {
      ...manifest,
      name: metadata.name,
      title: metadata.title,
      description: metadata.description,
      category: metadata.category,
      status: metadata.status,
      version: metadata.version,
      requiredScopes: metadata.required_scopes,
    });
  }
  return TOOL_MODULES.flatMap((tool) => (available.has(tool.id) ? [available.get(tool.id)] : []));
}

/**
 * Return all registered tool modules.
 */
export function getAllTools() {
  return TOOL_MODULES;
}

/**
 * Find a tool module by its unique identifier.
 */
export function getToolById(toolId) {
  return TOOL_MODULES.find((tool) => tool.id === toolId) || null;
}

/**
 * Retrieve all navigation groups across tools.
 */
export function getToolNavGroups(tools = TOOL_MODULES) {
  return tools.flatMap((tool) => tool.navGroups || []);
}

/** Retrieve direct route definitions contributed by each feature manifest. */
export function getFeatureRoutes() {
  return TOOL_MODULES.flatMap((tool) => tool.routes || []);
}

/**
 * Retrieve top-level system navigation items.
 */
export function getSystemNavItems() {
  const systemTool = getToolById('system-utility');
  if (systemTool?.navGroups?.[0]?.items) {
    return systemTool.navGroups[0].items;
  }
  return systemTool?.navItems || [];
}

/**
 * Retrieve dashboard feature cards across all modules.
 */
export function getDashboardFeatureCards() {
  return TOOL_MODULES.flatMap((tool) => tool.featureCards || []);
}

/**
 * Group tools by their declared category.
 */
export function getToolsByCategory() {
  const categories = {};
  for (const tool of TOOL_MODULES) {
    const cat = tool.category || '一般工具';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(tool);
  }
  return categories;
}
