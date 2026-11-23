import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import useAccountWorkState from '../hooks/useAccountWorkState';
import { useToolCatalog } from '../tools/ToolCatalogProvider';

export default function RecentToolRoutes() {
  const { pathname } = useLocation();
  const { status, tools } = useToolCatalog();
  const { value, save, ready } = useAccountWorkState('navigation', {});
  const card = tools.flatMap((tool) => tool.featureCards || []).find((item) => item.to === pathname);
  useEffect(() => {
    if (!ready || status !== 'ready' || !card) return;
    const recent = Array.isArray(value.dashboardRecentCardIds) ? value.dashboardRecentCardIds : [];
    if (recent[0] === card.id) return;
    save(
      { ...value, dashboardRecentCardIds: [card.id, ...recent.filter((id) => id !== card.id)].slice(0, 4) },
      { debounceMs: 0 }
    );
  }, [ready, status, card, value, save]);
  return null;
}
