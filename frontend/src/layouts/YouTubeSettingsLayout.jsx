import React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { PATHS } from '../routes/paths';

const items = [
  [PATHS.youtubeConnections, '頻道連線'],
  [PATHS.youtubeRouting, '路由與配額'],
  [PATHS.youtubePlaylist, '預設資源'],
];

export default function YouTubeSettingsLayout() {
  const location = useLocation();

  return (
    <div className="section-gap settings-page">
      <header className="page-header">
        <h1>YouTube 設定</h1>
        <p className="section-desc">管理 YouTube OAuth slot、頻道一致性、配額優先順序與發布預設資源。</p>
      </header>
      <nav className="settings-subnav" aria-label="YouTube 設定子導覽">
        {items.map(([to, label]) => {
          const isCurrentTabActive = to === PATHS.youtubeRouting
            ? (location.pathname === PATHS.youtubeRouting || location.pathname === PATHS.youtubeQuota)
            : location.pathname === to;
          return (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `settings-subnav-link${(isActive || isCurrentTabActive) ? ' active' : ''}`}
            >
              {label}
            </NavLink>
          );
        })}
      </nav>
      <Outlet />
    </div>
  );
}
