import React from 'react';
import { Outlet } from 'react-router-dom';
import { StatusMessage } from '../components/StatusMessage';
import Navbar from '../components/Navbar';
import { AccountWorkStateProvider } from '../hooks/useAccountWorkState';
import { recoverPage } from '../utils/pageRecovery';
import { useToolCatalog } from '../tools/ToolCatalogProvider';

export default function AppShell({
  authUser,
  workState,
  authStatus,
  authError,
  updateAvailable,
  settingsStatus,
  settingsRefreshing,
  fetchSettings,
  pageResume,
  onLogout,
  sidebarCollapsed,
  setSidebarCollapsed,
}) {
  const { status: catalogStatus, error: catalogError, retry: retryCatalog } = useToolCatalog();
  return (
    <AccountWorkStateProvider key={authUser.sub || authUser.email} initialState={workState}>
      <div className={`app-container${sidebarCollapsed ? ' sidebar-is-collapsed' : ''}`}>
        <Navbar
          authUser={authUser}
          onLogout={onLogout}
          sidebarCollapsed={sidebarCollapsed}
          setSidebarCollapsed={setSidebarCollapsed}
        />
        <main className="main-content">
          {catalogStatus === 'error' && (
            <StatusMessage
              tone="warning"
              title="工具目錄載入失敗"
              action={
                <button className="btn btn-secondary status-message-action" type="button" onClick={retryCatalog}>
                  重試
                </button>
              }
            >
              <span>{catalogError}</span>
            </StatusMessage>
          )}
          {updateAvailable && (
            <StatusMessage
              tone="warning"
              title="版本已更新"
              action={
                <button type="button" className="btn btn-secondary status-message-action" onClick={() => recoverPage()}>
                  重新開啟本頁
                </button>
              }
            >
              <span>Toolbox 已更新，請重新載入。</span>
            </StatusMessage>
          )}
          {authStatus === 'reconnecting' && (
            <StatusMessage
              tone="warning"
              title="連線中斷，正在重新連線"
              action={
                <div className="status-message-actions">
                  <button
                    type="button"
                    className="btn btn-secondary status-message-action"
                    onClick={pageResume.retryNow}
                    disabled={pageResume.isResuming}
                  >
                    {pageResume.isResuming ? '重新連線中…' : '立即重試'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary status-message-action"
                    onClick={() => recoverPage()}
                  >
                    重新開啟本頁
                  </button>
                </div>
              }
            >
              <span>原有畫面仍保留；連線恢復後會自動更新登入狀態與設定。</span>
              {authError && <small>{authError}</small>}
            </StatusMessage>
          )}
          {settingsStatus && (
            <StatusMessage
              tone={settingsStatus.tone}
              title="設定載入狀態"
              action={
                <button
                  type="button"
                  className="btn btn-secondary status-message-action"
                  onClick={fetchSettings}
                  disabled={settingsRefreshing}
                >
                  {settingsRefreshing ? '更新中…' : '重試'}
                </button>
              }
            >
              <span>{settingsStatus.message}</span>
              {settingsStatus.details.length > 0 && <small>{settingsStatus.details.join('；')}</small>}
            </StatusMessage>
          )}
          <React.Suspense fallback={<div className="loading-center">載入中…</div>}>
            <Outlet />
          </React.Suspense>
        </main>
      </div>
    </AccountWorkStateProvider>
  );
}
