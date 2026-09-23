/** Feature manifest: tool metadata, navigation, and dashboard cards. */
import { lazy } from 'react';
import { ArrowUpDown, Disc3, Settings } from 'lucide-react';
import { PATHS } from '../../routes/paths';

const manifest = {
  id: 'youtube-music',
  name: 'YouTube Music',
  title: 'YouTube Music',
  description: 'YouTube Music 專屬音樂工具箱，提供智慧播放清單排序、多欄位自訂規則與即時模擬比對。',
  category: 'YouTube Music',
  icon: Disc3,
  badge: '音樂工具',
  status: 'active',
  entryUrl: PATHS.ytmusicPlaylistSort,
  navGroups: [
    {
      id: 'ytmusic',
      label: 'YouTube Music',
      icon: Disc3,
      items: [
        { id: 'ytmusic_playlist_sort', to: PATHS.ytmusicPlaylistSort, label: '播放清單排序', icon: ArrowUpDown },
        {
          id: 'ytmusic_settings',
          to: PATHS.ytmusicSettings,
          label: 'YouTube Music 設定',
          icon: Settings,
          activePrefix: PATHS.ytmusicSettings,
        },
      ],
    },
  ],
  featureCards: [
    {
      id: 'ytmusic_playlist_sort_card',
      title: '播放清單排序',
      description: '讀取 YouTube Music 播放清單，以歌名、藝人/頻道、日期、長度等欄位自訂排序，並即時預覽變更。',
      to: PATHS.ytmusicPlaylistSort,
      actionLabel: '進入音樂排序工具',
      icon: Disc3,
      colorTheme: 'primary',
    },
    {
      id: 'ytmusic_settings_card',
      title: 'YouTube Music 設定',
      description: '管理專屬 YouTube Music 帳號授權、個人音樂庫連線狀態與排序預設偏好。',
      to: PATHS.ytmusicSettings,
      actionLabel: '進入音樂設定',
      icon: Settings,
      colorTheme: 'secondary',
    },
  ],
  routes: [
    {
      path: PATHS.ytmusicPlaylistSort.slice(1),
      component: lazy(() => import('../../pages/PlaylistSortPage')),
      getProps: ({ pageProps }) => pageProps,
    },
    {
      path: PATHS.ytmusicSettings.slice(1),
      component: lazy(() => import('../../pages/YtmusicSettingsPage')),
      getProps: ({ pageProps }) => pageProps,
    },
  ],
};

export default manifest;
