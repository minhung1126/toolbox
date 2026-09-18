import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpDown, CheckCircle2, ChevronDown, Disc3, Instagram, LayoutDashboard, Menu, PanelLeftClose, PanelLeftOpen, Settings, Shield, StickyNote, Video, X } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import useAccountWorkState from '../hooks/useAccountWorkState';
import { youtubeIsConnected } from '../utils/youtubeRouting';
import { PATHS } from '../routes/paths';
import { getSystemNavItems, getToolNavGroups } from '../tools/catalog';

const toolNavGroups = getToolNavGroups();
const systemNavItems = getSystemNavItems();
const ytmusicGroup = toolNavGroups.find((g) => g.id === 'ytmusic') || { items: [] };
const youtubeGroup = toolNavGroups.find((g) => g.id === 'youtube') || { items: [] };
const sheetGroup = toolNavGroups.find((g) => g.id === 'sheet') || { items: [] };
const systemGroup = toolNavGroups.find((g) => g.id === 'system') || {
  items: systemNavItems,
  icon: Shield,
};
const photoCuratorGroup = toolNavGroups.find((g) => g.id === 'photo_curator_nav') || { items: [] };
const photoCuratorItem = photoCuratorGroup.items?.[0] || {
  id: 'photo_curator_workbench',
  to: PATHS.photoCurator,
  label: 'Instagram 排版',
  icon: Instagram,
};
const ytmusicItems = ytmusicGroup.items;
const youtubeItems = youtubeGroup.items;
const sheetItems = sheetGroup.items;
const systemItems = systemGroup.items;

function pathIsActive(pathname, item) {
  if (item.activePrefix) return pathname === item.activePrefix || pathname.startsWith(`${item.activePrefix}/`);
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

export default function Navbar({ authUser, onLogout, sidebarCollapsed, setSidebarCollapsed }) {
  const location = useLocation();
  const pathname = location.pathname;
  const youtubeAuthorized = youtubeIsConnected(authUser?.youtube);
  const { value: savedNavigation, save: saveNavigation } = useAccountWorkState('navigation', {});
  const [ytmusicOpen, setYtmusicOpen] = useState(savedNavigation.ytmusicOpen ?? (pathname.startsWith('/ytmusic/') || pathname === PATHS.youtubePlaylistSort));
  const [youtubeOpen, setYoutubeOpen] = useState(savedNavigation.youtubeOpen ?? (pathname.startsWith('/youtube/') && pathname !== PATHS.youtubePlaylistSort));
  const [sheetOpen, setSheetOpen] = useState(savedNavigation.sheetOpen ?? pathname.startsWith('/sheets/'));
  const [systemOpen, setSystemOpen] = useState(savedNavigation.systemOpen ?? pathname.startsWith('/system/'));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef(null);
  const closeButtonRef = useRef(null);
  const menuButtonRef = useRef(null);

  const closeDrawer = () => {
    setDrawerOpen(false);
    window.requestAnimationFrame?.(() => menuButtonRef.current?.focus());
  };

  useEffect(() => {
    if (pathname.startsWith('/ytmusic/') || pathname === PATHS.youtubePlaylistSort) setYtmusicOpen(true);
    if (pathname.startsWith('/youtube/') && pathname !== PATHS.youtubePlaylistSort) setYoutubeOpen(true);
    if (pathname.startsWith('/sheets/')) setSheetOpen(true);
    if (pathname.startsWith('/system/')) setSystemOpen(true);
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDrawer();
        return;
      }
      if (event.key !== 'Tab' || !drawerRef.current) return;
      const focusable = [...drawerRef.current.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled])')];
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
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
    };
  }, [drawerOpen]);

  useEffect(() => {
    saveNavigation({ sidebarCollapsed, ytmusicOpen, youtubeOpen, sheetOpen, systemOpen }, { debounceMs: 150 });
  }, [saveNavigation, sheetOpen, sidebarCollapsed, systemOpen, youtubeOpen, ytmusicOpen]);

  const item = (value, child = false) => {
    const Icon = value.icon;
    return <NavLink
      key={value.id}
      to={value.to}
      end={!value.activePrefix}
      className={({ isActive }) => `nav-item${child ? ' nav-item-child' : ''}${(isActive || pathIsActive(pathname, value)) ? ' active' : ''}`}
      data-nav-id={value.id}
      onClick={closeDrawer}
      title={value.label}
      aria-current={pathIsActive(pathname, value) ? 'page' : undefined}
    >
      <Icon size={child ? 16 : 18} aria-hidden="true" /><span>{value.label}</span>
    </NavLink>;
  };

  const group = (id, label, Icon, open, setOpen, items, active) => (
    <div className="nav-group" key={id}>
      <button type="button" className={`nav-item nav-group-toggle${active ? ' active' : ''}`} data-nav-id={id} onClick={() => setOpen(!open)} title={label} aria-expanded={open} aria-controls={`${id}-submenu`} aria-current={active ? 'page' : undefined}>
        <Icon size={18} aria-hidden="true" /><span>{label}</span><ChevronDown className="nav-group-chevron" size={16} aria-hidden="true" />
      </button>
      {open && <div id={`${id}-submenu`} className="nav-submenu">{items.map((entry) => item(entry, true))}</div>}
    </div>
  );

  const ytmusicActive = pathname.startsWith('/ytmusic/') || pathname === PATHS.youtubePlaylistSort;
  const youtubeActive = pathname.startsWith('/youtube/') && pathname !== PATHS.youtubePlaylistSort;
  const sheetActive = pathname.startsWith('/sheets/');
  const systemActive = pathname.startsWith('/system/');
  const SidebarToggleIcon = sidebarCollapsed ? PanelLeftOpen : PanelLeftClose;
  const sidebarToggleLabel = sidebarCollapsed ? '展開側邊選單' : '收起側邊選單';

  return <>
    <header className="mobile-app-bar">
      <div className="mobile-app-brand"><span className="brand-mark"><Video size={22} aria-hidden="true" /></span><strong>Toolbox</strong></div>
      <button ref={menuButtonRef} type="button" className="app-bar-menu" onClick={() => setDrawerOpen(true)} aria-label="開啟導覽選單" aria-expanded={drawerOpen} aria-controls="primary-navigation"><Menu size={24} aria-hidden="true" /></button>
    </header>
    {drawerOpen && <button type="button" className="drawer-backdrop" aria-label="關閉導覽選單" onClick={closeDrawer} />}
    <aside ref={drawerRef} id="primary-navigation" className={`sidebar${drawerOpen ? ' is-open' : ''}${sidebarCollapsed ? ' is-collapsed' : ''}`} aria-label="主要導覽">
      <div className="sidebar-brand"><div className="brand-mark"><Video size={24} aria-hidden="true" /></div><div className="sidebar-brand-copy"><h2>Toolbox</h2><p>多功能模組化工具箱</p></div><button type="button" className="sidebar-toggle" onClick={() => setSidebarCollapsed((collapsed) => !collapsed)} aria-label={sidebarToggleLabel} title={sidebarToggleLabel} aria-expanded={!sidebarCollapsed} aria-controls="primary-navigation"><SidebarToggleIcon size={20} aria-hidden="true" /></button><button ref={closeButtonRef} type="button" className="drawer-close" onClick={closeDrawer} aria-label="關閉導覽選單"><X size={22} aria-hidden="true" /></button></div>
      <nav className="sidebar-nav">
        {item({ id: 'dashboard', to: PATHS.dashboard, label: '儀表板總覽', icon: LayoutDashboard })}
        {group('youtube', 'YouTube', youtubeGroup.icon, youtubeOpen, setYoutubeOpen, youtubeItems, youtubeActive)}
        {group('ytmusic', 'YouTube Music', Disc3, ytmusicOpen, setYtmusicOpen, ytmusicItems, ytmusicActive)}
        {group('sheet', 'Sheet', sheetGroup.icon, sheetOpen, setSheetOpen, sheetItems, sheetActive)}
        {item({
          id: photoCuratorItem.id,
          to: photoCuratorItem.to || PATHS.photoCurator,
          label: photoCuratorGroup.label || photoCuratorItem.label || 'Instagram 排版',
          icon: photoCuratorGroup.icon || photoCuratorItem.icon || Instagram,
        })}
        {item({ id: 'notes', to: PATHS.notes, label: '便利貼', icon: StickyNote })}
        {group('system', '系統管理', systemGroup.icon, systemOpen, setSystemOpen, systemItems, systemActive)}
        {item({ id: 'settings', to: PATHS.googleSettings, label: '控制台帳號', icon: Settings, activePrefix: '/settings' })}
      </nav>
      <div className="sidebar-footer">
        <div className="account-card">
          <div className="account-header-row">
            <div className="account-user-badge">
              <span className="account-avatar" aria-hidden="true">
                {(authUser?.email?.[0] || 'U').toUpperCase()}
              </span>
              <p className="account-email" title={authUser?.email}>{authUser?.email}</p>
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
            <span className={`badge account-youtube-status ${youtubeAuthorized ? 'badge-connected' : 'badge-disconnected'}`}>
              {youtubeAuthorized ? 'YouTube' : 'YouTube 未連結'}
            </span>
            <span className={`badge ${authUser?.authorizations?.ytmusic?.connected ? 'badge-connected' : 'badge-disconnected'}`}>
              {authUser?.authorizations?.ytmusic?.connected ? 'YT Music' : 'YT Music 未連結'}
            </span>
          </div>
        </div>
      </div>
    </aside>
  </>;
}
