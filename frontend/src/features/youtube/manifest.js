/** Feature manifest: tool metadata, navigation, and dashboard cards. */
import { lazy } from 'react';
import { Clapperboard, Send, Settings, Smartphone, Youtube } from 'lucide-react';
import { PATHS } from '../../routes/paths';

const manifest = {
  id: 'creator-tools',
  name: 'Creator Tools',
  title: '影音創作工作流',
  description: 'YouTube 影片與 Shorts 專屬草稿批次維護、標題說明套用與排程發布自動化。',
  category: '影音創作',
  icon: Youtube,
  badge: '創作核心',
  status: 'active',
  entryUrl: PATHS.dashboard,
  navGroups: [
    {
      id: 'youtube',
      label: 'YouTube',
      icon: Youtube,
      items: [
        { id: 'youtube_video_drafts', to: PATHS.youtubeVideoDrafts, label: 'Video 草稿', icon: Clapperboard },
        { id: 'youtube_shorts_drafts', to: PATHS.youtubeShortsDrafts, label: 'Shorts 草稿', icon: Smartphone },
        { id: 'publish_clean', to: PATHS.youtubePublishCleanup, label: '發布草稿', icon: Send },
        {
          id: 'youtube_settings',
          to: PATHS.youtubeConnections,
          label: 'YouTube 設定',
          icon: Settings,
          activePrefix: PATHS.youtubeSettings,
        },
      ],
    },
  ],
  featureCards: [
    {
      id: 'video_drafts',
      title: 'Video 草稿',
      description: '使用 Video 專屬工作表與欄位，沿用共用團體與人物篩選。',
      to: PATHS.youtubeVideoDrafts,
      actionLabel: '進入 Video 草稿',
      icon: Clapperboard,
      colorTheme: 'primary',
    },
    {
      id: 'shorts_drafts',
      title: 'Shorts 草稿',
      description: '使用 Shorts 專屬工作表與欄位，沿用共用團體與人物篩選。',
      to: PATHS.youtubeShortsDrafts,
      actionLabel: '進入 Shorts 草稿',
      icon: Smartphone,
      colorTheme: 'primary',
    },
    {
      id: 'publish_clean',
      title: '發布草稿',
      description: '依序設為公開並移出 To-Post 播放清單，完成後直接顯示結果。',
      to: PATHS.youtubePublishCleanup,
      actionLabel: '進入發布模組',
      icon: Send,
      colorTheme: 'secondary',
    },
  ],
  routes: [
    {
      path: PATHS.youtubeVideoDrafts.slice(1),
      componentKey: 'video-drafts',
      component: lazy(() => import('../../pages/BatchUpdatePage')),
      getProps: ({ sysSettings, authUser }) => ({ sysSettings, authUser, videoType: 'Video' }),
    },
    {
      path: PATHS.youtubeShortsDrafts.slice(1),
      componentKey: 'shorts-drafts',
      component: lazy(() => import('../../pages/BatchUpdatePage')),
      getProps: ({ sysSettings, authUser }) => ({ sysSettings, authUser, videoType: 'Shorts' }),
    },
    {
      path: PATHS.youtubePublishCleanup.slice(1),
      component: lazy(() => import('../../pages/PublishCleanerPage')),
      getProps: ({ sysSettings, authUser }) => ({ sysSettings, authUser }),
    },
  ],
};

export default manifest;
