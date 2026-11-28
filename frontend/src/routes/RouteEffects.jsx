import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { getAllTools } from '../tools/catalog';
import { PATHS, RETURN_PATH_ALIASES } from './paths';

const CORE_ROUTE_TITLES = {
  [PATHS.login]: '登入',
  [PATHS.setup]: '初次安裝精靈',
  [PATHS.root]: '儀表板',
  [PATHS.dashboard]: '儀表板',
  [PATHS.googleSettings]: 'Google 帳號與授權',
};

function normalizeRoutePath(path) {
  const clean = `/${String(path || '')
    .replace(/^\/+/, '')
    .replace(/\/\*$/, '')}`;
  return clean === '//' ? '/' : clean;
}

function joinRoutePath(parentPath, childPath) {
  if (!childPath) return parentPath;
  const base = parentPath === '/' ? '' : parentPath.replace(/\/+$/, '');
  const segment = String(childPath).replace(/^\/+/, '');
  return normalizeRoutePath(`${base}/${segment}`);
}

function fallbackRouteTitle(tool, fullPath) {
  const card = (tool.featureCards || []).find((item) => item.to === fullPath);
  if (card?.title) return card.title;
  for (const group of tool.navGroups || []) {
    const navItem = (group.items || []).find((item) => item.to === fullPath);
    if (navItem?.label) return navItem.label;
  }
  return tool.title || tool.name || '';
}

export function buildRouteTitleMap(tools = getAllTools()) {
  const map = new Map(Object.entries(CORE_ROUTE_TITLES));

  const registerRoute = (tool, route, parentPath = '') => {
    if (!route || route.path === '*') return;
    const fullPath = route.index
      ? parentPath
      : parentPath
        ? joinRoutePath(parentPath, route.path)
        : normalizeRoutePath(route.path);
    if (!route.redirectTo) {
      const resolvedTitle = route.title || fallbackRouteTitle(tool, fullPath);
      if (resolvedTitle && !map.has(fullPath)) {
        map.set(fullPath, resolvedTitle);
      }
    }
    for (const child of route.children || []) {
      registerRoute(tool, child, fullPath);
    }
  };

  for (const tool of tools) {
    for (const route of tool.routes || []) {
      registerRoute(tool, route);
    }
  }

  for (const [aliasPath, targetPath] of Object.entries(RETURN_PATH_ALIASES)) {
    const targetTitle = map.get(targetPath);
    if (targetTitle) map.set(aliasPath, targetTitle);
  }

  return map;
}

const ROUTE_TITLES = buildRouteTitleMap();

export function titleForPath(pathname, titleMap = ROUTE_TITLES) {
  const normalized = pathname === '' ? '/' : pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const pageTitle = titleMap.get(normalized);
  return pageTitle ? `${pageTitle}｜Toolbox` : '頁面不存在｜Toolbox';
}

export default function RouteEffects() {
  const location = useLocation();

  useEffect(() => {
    document.title = titleForPath(location.pathname);
    if (!window.navigator.userAgent.includes('jsdom')) window.scrollTo?.(0, 0);
  }, [location.pathname, location.search]);

  return null;
}
