/** Feature manifest: tool metadata, navigation, and dashboard cards. */
import { lazy } from 'react';
import { Clapperboard, FilePenLine, Send, Settings, Smartphone, Youtube } from 'lucide-react';
import { PATHS } from '../../routes/paths';

const manifest = {
  id: 'creator-tools',
  purpose: '管理影片',
  name: 'Creator Tools',
  title: '影音創作工作流',
  description: '快速套用人物並建立草稿，編輯確認後公開，再獨立清理已公開的 To-Post 清單成員。',
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
        {
          id: 'youtube_video_drafts',
          to: PATHS.youtubeVideoDrafts,
          label: 'Video 快速套用',
          icon: Clapperboard,
          end: true,
        },
        {
          id: 'youtube_shorts_drafts',
          to: PATHS.youtubeShortsDrafts,
          label: 'Shorts 快速套用',
          icon: Smartphone,
          end: true,
        },
        {
          id: 'youtube_staging',
          to: PATHS.youtubeVideoStaging,
          activePaths: [PATHS.youtubeVideoStaging, PATHS.youtubeShortsStaging],
          label: '編輯草稿並公開',
          icon: FilePenLine,
        },
        { id: 'publish_clean', to: PATHS.youtubePublishCleanup, label: '清理 To-Post', icon: Send },
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
      title: 'Video 快速套用',
      description: '使用 Video 專屬工作表與欄位，沿用共用團體與人物篩選。',
      to: PATHS.youtubeVideoDrafts,
      actionLabel: '前往 Video 快速套用',
      icon: Clapperboard,
      colorTheme: 'primary',
    },
    {
      id: 'shorts_drafts',
      title: 'Shorts 快速套用',
      description: '使用 Shorts 專屬工作表與欄位，沿用共用團體與人物篩選。',
      to: PATHS.youtubeShortsDrafts,
      actionLabel: '前往 Shorts 快速套用',
      icon: Smartphone,
      colorTheme: 'primary',
    },
    {
      id: 'youtube_staging',
      title: '編輯草稿並公開',
      description: '完整閱讀與修改最終標題、描述，確認後逐片顯示發布進度。',
      to: PATHS.youtubeVideoStaging,
      actionLabel: '前往編輯草稿並公開',
      icon: FilePenLine,
      colorTheme: 'primary',
    },
    {
      id: 'publish_clean',
      title: '清理 To-Post',
      description: '核實已公開的影片後，只移除 To-Post 清單成員。',
      to: PATHS.youtubePublishCleanup,
      actionLabel: '前往清理 To-Post',
      icon: Send,
      colorTheme: 'secondary',
    },
  ],
  routes: [
    ...[
      [PATHS.youtubeVideoStaging, 'Video'],
      [PATHS.youtubeShortsStaging, 'Shorts'],
    ].map(([path, videoType]) => ({
      path: path.slice(1),
      title: '編輯草稿並公開',
      componentKey: `${videoType}-staged`,
      component: lazy(() => import('./pages/DraftPublishPage')),
      getProps: ({ sysSettings, authUser }) => ({ sysSettings, authUser, videoType }),
    })),
    {
      path: PATHS.youtubeVideoDrafts.slice(1),
      title: 'Video 快速套用',
      componentKey: 'video-drafts',
      component: lazy(() => import('../../pages/BatchUpdatePage')),
      getProps: ({ sysSettings, authUser, onSharedFilterSaved }) => ({
        sysSettings,
        authUser,
        onSharedFilterSaved,
        videoType: 'Video',
      }),
    },
    {
      path: PATHS.youtubeShortsDrafts.slice(1),
      title: 'Shorts 快速套用',
      componentKey: 'shorts-drafts',
      component: lazy(() => import('../../pages/BatchUpdatePage')),
      getProps: ({ sysSettings, authUser, onSharedFilterSaved }) => ({
        sysSettings,
        authUser,
        onSharedFilterSaved,
        videoType: 'Shorts',
      }),
    },
    {
      path: PATHS.youtubePublishCleanup.slice(1),
      title: '清理 To-Post',
      component: lazy(() => import('../../pages/PublishCleanerPage')),
      getProps: ({ sysSettings, authUser }) => ({ sysSettings, authUser }),
    },
  ],
};

export default manifest;
