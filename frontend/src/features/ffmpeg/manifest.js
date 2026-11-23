/** Feature manifest: tool metadata, navigation, and dashboard cards. */
import { lazy } from 'react';
import { Video } from 'lucide-react';
import { PATHS } from '../../routes/paths';

const manifest = {
  id: 'ffmpeg-generator',
  purpose: '處理素材',
  name: 'FFmpeg Generator',
  title: 'FFmpeg 命令行生成器',
  description: '本機影片預覽與片段設定，產生需在電腦執行的 FFmpeg 指令；不會上傳影片。',
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
