/** Feature manifest: tool metadata, navigation, and dashboard cards. */
import { lazy } from 'react';
import { Video } from 'lucide-react';
import { PATHS } from '../../routes/paths';

const manifest = {
  id: 'ffmpeg-generator',
  name: 'FFmpeg Generator',
  title: 'FFmpeg 命令行生成器',
  description: '視覺化影片時間軸預覽與剪輯，支援毫秒級 Cut 前後定位、無損流複製、編碼參數調校與一鍵複製指令。',
  category: '影音創作',
  icon: Video,
  badge: '剪輯工具',
  status: 'active',
  entryUrl: PATHS.ffmpegGenerator,
  navGroups: [
    {
      id: 'ffmpeg_nav',
      label: 'FFmpeg 工具',
      icon: Video,
      items: [{ id: 'ffmpeg_generator_workbench', to: PATHS.ffmpegGenerator, label: 'FFmpeg 生成器', icon: Video }],
    },
  ],
  featureCards: [
    {
      id: 'ffmpeg_generator_card',
      title: 'FFmpeg 命令行生成器',
      description: '本機即時預覽影片，視覺化設定 Cut 起訖點與無損流複製，快速生成標準指令。',
      to: PATHS.ffmpegGenerator,
      actionLabel: '進入生成器',
      icon: Video,
      colorTheme: 'secondary',
    },
  ],
  routes: [
    {
      path: PATHS.ffmpegGenerator.slice(1),
      component: lazy(() => import('../../pages/FfmpegGeneratorPage')),
      getProps: ({ pageProps }) => pageProps,
    },
  ],
};

export default manifest;
