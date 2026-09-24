/** Feature manifest: tool metadata, navigation, and dashboard cards. */
import { lazy } from 'react';
import { BarChart3, GitFork, Key, Settings, Sliders } from 'lucide-react';
import NotFoundPage from '../../pages/NotFoundPage';
import { PATHS } from '../../routes/paths';

const manifest = {
  id: 'youtube-integrations',
  name: 'Integrations & Quota',
  title: 'API 整合與配額控管',
  description: 'YouTube 雙槽位頻道連線、智慧容錯路由分流、即時 API Quota 監控與預設計帳清單。',
  category: '整合與配額',
  icon: Sliders,
  badge: '維運模組',
  status: 'active',
  entryUrl: PATHS.youtubeConnections,
  navGroups: [
    {
      id: 'integrations',
      sidebar: false, // Exposed by the YouTube settings sub-navigation.
      label: '整合與配額',
      icon: Sliders,
      items: [
        { id: 'youtube_connections', to: PATHS.youtubeConnections, label: 'YouTube 授權設定', icon: Key },
        { id: 'youtube_routing', to: PATHS.youtubeRouting, label: '路由分流模式', icon: GitFork },
        { id: 'youtube_quota', to: PATHS.youtubeQuota, label: '配額監控與計帳', icon: BarChart3 },
        { id: 'youtube_playlist', to: PATHS.youtubePlaylist, label: '預設播放清單', icon: Settings },
      ],
    },
  ],
  featureCards: [
    {
      id: 'youtube_connections_card',
      title: 'YouTube 連線授權',
      description: '管理主要 (Primary) 與次要 (Secondary) 雙槽位頻道連線與同頻道驗證。',
      to: PATHS.youtubeConnections,
      actionLabel: '管理授權連線',
      icon: Key,
      colorTheme: 'primary',
    },
    {
      id: 'youtube_routing_card',
      title: '智慧路由分流',
      description: '設定請求優先槽位與配額滿載自動備援容錯機制 (Auto Primary / Manual)。',
      to: PATHS.youtubeRouting,
      actionLabel: '設定路由分流',
      icon: GitFork,
      colorTheme: 'secondary',
    },
    {
      id: 'youtube_quota_card',
      title: '配額監控與防護',
      description: '即時監控 YouTube API Quota 當日消耗水位、重設時間與自訂安全緩衝值。',
      to: PATHS.youtubeQuota,
      actionLabel: '檢視配額狀況',
      icon: BarChart3,
      colorTheme: 'accent',
    },
  ],
  routes: [
    {
      path: `${PATHS.youtubeSettings.slice(1)}/*`,
      component: lazy(() => import('../../layouts/YouTubeSettingsLayout')),
      children: [
        { index: true, redirectTo: 'connections' },
        {
          path: 'connections',
          component: lazy(() => import('../../pages/YoutubeConnectionsPage')),
          getProps: ({ pageProps }) => pageProps,
        },
        {
          path: 'routing',
          component: lazy(() => import('../../pages/YoutubeRoutingPage')),
          getProps: ({ pageProps }) => pageProps,
        },
        {
          path: 'quota',
          component: lazy(() => import('../../pages/YoutubeQuotaPage')),
          getProps: ({ pageProps }) => pageProps,
        },
        {
          path: 'playlist',
          component: lazy(() => import('../../pages/YoutubePlaylistSettingsPage')),
          getProps: ({ pageProps }) => pageProps,
        },
        { path: '*', component: NotFoundPage },
      ],
    },
  ],
};

export default manifest;
