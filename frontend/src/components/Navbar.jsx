import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  LayoutDashboard,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Video,
  X,
} from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import useAccountWorkState from '../hooks/useAccountWorkState';
import { youtubeIsConnected } from '../features/youtube/model/routing';
import { PATHS } from '../routes/paths';
import { getToolNavGroups } from '../tools/catalog';
import { useToolCatalog } from '../tools/ToolCatalogProvider';

function pathIsActive(pathname, item) {
  if (item.activePrefix) return pathname === item.activePrefix || pathname.startsWith(`${item.activePrefix}/`);
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

export default function Navbar({ authUser, onLogout, sidebarCollapsed, setSidebarCollapsed }) {
  const location = useLocation();
  const pathname = location.pathname;
  const youtubeAuthorized = youtubeIsConnected(authUser?.youtube);
  const { status: catalogStatus, tools } = useToolCatalog();
  const { value: savedNavigation, save: saveNavigation } = useAccountWorkState('navigation', {});
  const initialNavigationRef = useRef(savedNavigation);
  const toolNavGroups = useMemo(
    () => getToolNavGroups(tools).filter((entry) => entry.sidebar !== false && entry.items?.length),
    [tools]
  );
  const [openGroups, setOpenGroups] = useState(() =>
    Object.fromEntries(
      toolNavGroups.map((entry) => [
        entry.id,
        savedNavigation[`${entry.id}Open`] ?? entry.items.some((value) => pathIsActive(pathname, value)),
      ])
    )
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef(null);
  const closeButtonRef = useRef(null);
  const menuButtonRef = useRef(null);

  const closeDrawer = () => {
    setDrawerOpen(false);
    window.requestAnimationFrame?.(() => menuButtonRef.current?.focus());
  };

  useEffect(() => {
    setOpenGroups((current) => {
      const activeGroups = toolNavGroups.filter((entry) => entry.items.some((value) => pathIsActive(pathname, value)));
      const next = { ...current };
      for (const entry of toolNavGroups) {
        if (!(entry.id in next)) next[entry.id] = initialNavigationRef.current[`${entry.id}Open`] ?? false;
      }
      for (const entry of activeGroups) next[entry.id] = true;
      if (
        Object.keys(next).length === Object.keys(current).length &&
        Object.entries(next).every(([id, open]) => current[id] === open)
      )
        return current;
      return next;
    });
    setDrawerOpen(false);
  }, [pathname, toolNavGroups]);

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDrawer();
        return;
      }
      if (event.key !== 'Tab' || !drawerRef.current) return;
      const focusable = [
        ...drawerRef.current.querySelectorAll(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled])'
        ),
      ].filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const onResize = () => {
      if (window.innerWidth >= 768) setDrawerOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
    };
  }, [drawerOpen]);

  useEffect(() => {
    if (catalogStatus !== 'ready' || toolNavGroups.some((entry) => !(entry.id in openGroups))) return;
    saveNavigation(
      {
        ...initialNavigationRef.current,
        sidebarCollapsed,
        ...Object.fromEntries(Object.entries(openGroups).map(([id, open]) => [`${id}Open`, open])),
      },
      { debounceMs: 150 }
    );
  }, [catalogStatus, saveNavigation, sidebarCollapsed, openGroups, toolNavGroups]);

  const item = (value, child = false) => {
    const Icon = value.icon;
    return (
      <NavLink
        key={value.id}
        to={value.to}
        end={!value.activePrefix}
        className={({ isActive }) =>
          `nav-item${child ? ' nav-item-child' : ''}${isActive || pathIsActive(pathname, value) ? ' active' : ''}`
        }
        data-nav-id={value.id}
        onClick={closeDrawer}
        title={value.label}
        aria-current={pathIsActive(pathname, value) ? 'page' : undefined}
      >
        <Icon size={child ? 16 : 18} aria-hidden="true" />
        <span>{value.label}</span>
      </NavLink>
    );
  };

  const group = (id, label, Icon, open, setOpen, items, active) => (
    <div className="nav-group" key={id}>
      <button
        type="button"
        className={`nav-item nav-group-toggle${active ? ' active' : ''}`}
        data-nav-id={id}
        onClick={() => setOpen(!open)}
        title={label}
        aria-expanded={open}
        aria-controls={`${id}-submenu`}
        aria-current={active ? 'page' : undefined}
      >
        <Icon size={18} aria-hidden="true" />
        <span className="nav-group-label">{label}</span>
        <ChevronDown className="nav-group-chevron" size={16} aria-hidden="true" />
      </button>
      {open && (
        <div id={`${id}-submenu`} className="nav-submenu">
          {items.map((entry) => item(entry, true))}
        </div>
      )}
    </div>
  );

  const SidebarToggleIcon = sidebarCollapsed ? PanelLeftOpen : PanelLeftClose;
  const sidebarToggleLabel = sidebarCollapsed ? '展開側邊選單' : '收起側邊選單';

  return (
    <>
      <header className="mobile-app-bar">
        <div className="mobile-app-brand">
          <span className="brand-mark">
            <Video size={22} aria-hidden="true" />
          </span>
          <strong>Toolbox</strong>
        </div>
        <button
          ref={menuButtonRef}
          type="button"
          className="app-bar-menu"
          onClick={() => setDrawerOpen(true)}
          aria-label="開啟導覽選單"
          aria-expanded={drawerOpen}
          aria-controls="primary-navigation"
        >
          <Menu size={24} aria-hidden="true" />
        </button>
      </header>
      {drawerOpen && (
        <button type="button" className="drawer-backdrop" aria-label="關閉導覽選單" onClick={closeDrawer} />
      )}
      <aside
        ref={drawerRef}
        id="primary-navigation"
        className={`sidebar${drawerOpen ? ' is-open' : ''}${sidebarCollapsed ? ' is-collapsed' : ''}`}
        aria-label="主要導覽"
      >
        <div className="sidebar-brand">
          <div className="brand-mark">
            <Video size={24} aria-hidden="true" />
          </div>
          <div className="sidebar-brand-copy">
            <h2>Toolbox</h2>
            <p>多功能模組化工具箱</p>
          </div>
          <button
            type="button"
            className="sidebar-toggle"
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            aria-label={sidebarToggleLabel}
            title={sidebarToggleLabel}
            aria-expanded={!sidebarCollapsed}
            aria-controls="primary-navigation"
          >
            <SidebarToggleIcon size={20} aria-hidden="true" />
          </button>
          <button
            ref={closeButtonRef}
            type="button"
            className="drawer-close"
            onClick={closeDrawer}
            aria-label="關閉導覽選單"
          >
            <X size={22} aria-hidden="true" />
          </button>
        </div>
        <nav className="sidebar-nav">
          {item({ id: 'dashboard', to: PATHS.dashboard, label: '儀表板總覽', icon: LayoutDashboard })}
          {toolNavGroups.map((entry) =>
            entry.items.length === 1 && !entry.collapsible
              ? item({ ...entry.items[0], icon: entry.icon || entry.items[0].icon })
              : group(
                  entry.id,
                  entry.label,
                  entry.icon,
                  Boolean(openGroups[entry.id]),
                  (open) => setOpenGroups((current) => ({ ...current, [entry.id]: open })),
                  entry.items,
                  entry.items.some((value) => pathIsActive(pathname, value))
                )
          )}
          {item({
            id: 'settings',
            to: PATHS.googleSettings,
            label: '控制台帳號',
            icon: Settings,
            activePrefix: '/settings',
          })}
        </nav>
        <div className="sidebar-footer">
          <div className="account-card">
            <div className="account-header-row">
              <div className="account-user-badge">
                <span className="account-avatar" aria-hidden="true">
                  {(authUser?.email?.[0] || 'U').toUpperCase()}
                </span>
                <p className="account-email" title={authUser?.email}>
                  {authUser?.email}
                </p>
              </div>
              <button
                type="button"
                className="logout-button"
                onClick={onLogout}
                title="登出控制台"
                aria-label="登出控制台"
              >
                登出
              </button>
            </div>
            <div className="account-badges-row">
              <span className="badge badge-connected account-status">
                <CheckCircle2 size={10} /> 控制台已登入
              </span>
              <span
                className={`badge account-youtube-status ${youtubeAuthorized ? 'badge-connected' : 'badge-disconnected'}`}
              >
                {youtubeAuthorized ? 'YouTube' : 'YouTube 未連結'}
              </span>
              <span
                className={`badge ${authUser?.authorizations?.ytmusic?.connected ? 'badge-connected' : 'badge-disconnected'}`}
              >
                {authUser?.authorizations?.ytmusic?.connected ? 'YT Music' : 'YT Music 未連結'}
              </span>
              <span
                className={`badge ${authUser?.authorizations?.video_uploader?.connected ? 'badge-connected' : 'badge-disconnected'}`}
              >
                {authUser?.authorizations?.video_uploader?.connected ? '影片上傳' : '影片頻道未連結'}
              </span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
