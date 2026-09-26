import React, { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import AppShell from '../layouts/AppShell';
import AccountSettingsLayout from '../layouts/AccountSettingsLayout';
import DashboardPage from '../pages/DashboardPage';
import LoginPage from '../pages/LoginPage';
import NotFoundPage from '../pages/NotFoundPage';
import GoogleAccountSettingsPage from '../pages/GoogleAccountSettingsPage';
import SetupWizardPage from '../pages/SetupWizardPage';
import RequireAuth from './RequireAuth';
import RouteEffects from './RouteEffects';
import { getSafeReturnPath, PATHS } from './paths';
import { getAllTools } from '../tools/catalog';
import { ToolCatalogProvider, useToolCatalog } from '../tools/ToolCatalogProvider';

const FEATURE_ROUTES = getAllTools().flatMap((tool) =>
  (tool.routes || []).map((route) => ({ toolId: tool.id, route }))
);

function ToolRouteGate({ toolId, children }) {
  const { status, tools, error, retry } = useToolCatalog();
  if (status === 'loading')
    return (
      <div className="loading-center" role="status">
        工具目錄載入中…
      </div>
    );
  if (status === 'error') {
    return (
      <div className="loading-center error-state" role="alert">
        <p>{error}</p>
        <button className="btn btn-secondary" type="button" onClick={retry}>
          重試載入工具目錄
        </button>
      </div>
    );
  }
  if (!tools.some((tool) => tool.id === toolId)) {
    return (
      <div className="loading-center error-state" role="status">
        此工具目前未啟用。
      </div>
    );
  }
  return children;
}

function LoginRoute({ initialError }) {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const returnTo = getSafeReturnPath(params.get('returnTo'));
  return <LoginPage initialError={initialError} returnTo={returnTo} />;
}

function AuthenticatedLoginRedirect() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  return <Navigate replace to={getSafeReturnPath(params.get('returnTo')) || PATHS.dashboard} />;
}

export function OAuthReturnEffect({ returnPath, clearReturnPath }) {
  const navigate = useNavigate();
  useEffect(() => {
    if (!returnPath) return;
    const safePath = getSafeReturnPath(returnPath) || PATHS.dashboard;
    clearReturnPath?.();
    navigate(safePath, { replace: true });
  }, [clearReturnPath, navigate, returnPath]);
  return null;
}

function renderFeatureRoute(route, context, toolId, isTopLevel = true) {
  const Component = route.component;
  const children = (route.children || []).map((child) => renderFeatureRoute(child, context, toolId, false));
  const element = route.redirectTo ? (
    <Navigate replace to={route.redirectTo} />
  ) : Component ? (
    <React.Suspense fallback={<div className="loading-center">載入中…</div>}>
      <Component key={route.componentKey} {...(route.getProps?.(context) || {})} />
    </React.Suspense>
  ) : null;

  return (
    <Route
      key={route.path || 'index'}
      {...(route.index ? { index: true } : { path: route.path })}
      element={isTopLevel ? <ToolRouteGate toolId={toolId}>{element}</ToolRouteGate> : element}
    >
      {children.length ? children : null}
    </Route>
  );
}

export default function AppRoutes({
  authStatus,
  authUser,
  authError,
  workState,
  updateAvailable,
  settingsStatus,
  settingsRefreshing,
  fetchSettings,
  fetchUser,
  pageResume,
  onLogout,
  sidebarCollapsed,
  setSidebarCollapsed,
  oauthReturnPath,
  clearOAuthReturnPath,
  sysSettings,
}) {
  const appShellProps = {
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
  };
  const pageProps = { authUser, sysSettings, refreshSettings: fetchSettings, refreshAuthUser: fetchUser };
  const featureRouteContext = { authUser, sysSettings, pageProps };

  return (
    <>
      <RouteEffects />
      <OAuthReturnEffect returnPath={oauthReturnPath} clearReturnPath={clearOAuthReturnPath} />
      <ToolCatalogProvider key={authUser?.sub || authUser?.email || 'guest'} enabled={Boolean(authUser)}>
        <Routes>
          <Route
            path={PATHS.login}
            element={authUser ? <AuthenticatedLoginRedirect /> : <LoginRoute initialError={authError} />}
          />
          <Route path={PATHS.setup} element={<SetupWizardPage />} />
          <Route
            element={
              <RequireAuth authStatus={authStatus} authUser={authUser}>
                <AppShell {...appShellProps} />
              </RequireAuth>
            }
          >
            <Route index element={<Navigate replace to={PATHS.dashboard} />} />
            <Route path="dashboard" element={<DashboardPage authUser={authUser} sysSettings={sysSettings} />} />
            <Route path="youtube/playlist-sort" element={<Navigate replace to={PATHS.ytmusicPlaylistSort} />} />
            <Route path="youtube/settings" element={<Navigate replace to={PATHS.youtubeConnections} />} />
            {FEATURE_ROUTES.map(({ toolId, route }) => renderFeatureRoute(route, featureRouteContext, toolId))}

            <Route path="settings" element={<Navigate replace to={PATHS.googleSettings} />} />
            <Route path="settings/*" element={<AccountSettingsLayout />}>
              <Route index element={<Navigate replace to="google" />} />
              <Route path="google" element={<GoogleAccountSettingsPage {...pageProps} />} />
              <Route path="sheets" element={<Navigate replace to={PATHS.sheetSettings} />} />
              <Route path="system" element={<Navigate replace to={PATHS.systemSettings} />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </ToolCatalogProvider>
    </>
  );
}

export { PATHS };
