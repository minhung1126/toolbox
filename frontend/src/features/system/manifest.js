/** Feature manifest: tool metadata, navigation, and dashboard cards. */
import { lazy } from 'react';
import { Activity, Info, Shield } from 'lucide-react';
import { PATHS } from '../../routes/paths';

const manifest = {
  id: 'system-utility',
  name: 'System Utility',
  title: '系統維運與安全控制',
  description: '即時監控 Toolbox API 健康狀態、OAuth 憑證遮罩維護、登入白名單與 Commit 部署版本。',
  category: '系統管理',
  icon: Shield,
  badge: '系統模組',
  status: 'active',
  entryUrl: PATHS.systemSettings,
  navGroups: [
    {
      id: 'system',
      label: '系統管理',
      icon: Shield,
      items: [
        {
          id: 'system_settings',
          to: PATHS.systemSettings,
          label: '系統設定',
          icon: Shield,
          activePrefix: PATHS.systemSettings,
        },
        { id: 'system_info', to: PATHS.systemInfo, label: '系統／部署資訊', icon: Info },
        { id: 'api_health', to: PATHS.systemHealth, label: 'API 健康度', icon: Activity },
      ],
    },
  ],
  navItems: [
    {
      id: 'system_settings',
      to: PATHS.systemSettings,
      label: '系統設定',
      icon: Shield,
      activePrefix: PATHS.systemSettings,
    },
    { id: 'system_info', to: PATHS.systemInfo, label: '系統／部署資訊', icon: Info },
    { id: 'api_health', to: PATHS.systemHealth, label: 'API 健康度', icon: Activity },
  ],
  featureCards: [
    {
      id: 'system_settings_card',
      title: '系統設定',
      description: '管理系統安全密鑰、Google OAuth 憑證配置與控制台登入白名單。',
      to: PATHS.systemSettings,
      actionLabel: '進入系統設定',
      icon: Shield,
      colorTheme: 'accent',
    },
    {
      id: 'system_info_card',
      title: '系統／部署資訊',
      description: '檢視執行環境參數、快取配置與當前 Docker 部署 Commit SHA。',
      to: PATHS.systemInfo,
      actionLabel: '檢視部署資訊',
      icon: Info,
      colorTheme: 'secondary',
    },
    {
      id: 'api_health_card',
      title: 'API 健康度',
      description: '即時監控後端 API 就緒狀態、憑證驗證與服務運作指標。',
      to: PATHS.systemHealth,
      actionLabel: '檢查 API 健康度',
      icon: Activity,
      colorTheme: 'secondary',
    },
  ],
  routes: [
    {
      path: PATHS.systemHealth.slice(1),
      component: lazy(() => import('../../pages/ApiHealthPage')),
      getProps: ({ authUser }) => ({ authUser }),
    },
    {
      path: PATHS.systemInfo.slice(1),
      component: lazy(() => import('../../pages/SystemInfoPage')),
      getProps: ({ sysSettings }) => ({ sysSettings }),
    },
    {
      path: PATHS.componentShowcase.slice(1),
      component: lazy(() => import('../../pages/ComponentShowcasePage')),
    },
    {
      path: PATHS.systemSettings.slice(1),
      component: lazy(() => import('../../pages/SystemSettingsPage')),
      getProps: ({ pageProps }) => pageProps,
    },
  ],
};

export default manifest;
