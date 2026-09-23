/** Feature manifest: tool metadata, navigation, and dashboard cards. */
import { lazy } from 'react';
import { UploadCloud } from 'lucide-react';
import { PATHS } from '../../routes/paths';

const manifest = {
  id: 'weverse-uploader',
  name: 'Weverse Uploader',
  title: 'Weverse 影片上傳',
  description: '本機 Weverse 結構化資料夾影音與 16 語系字幕自動辨識、複查調整與 YouTube 專屬頻道直傳發布。',
  category: '影音創作',
  icon: UploadCloud,
  badge: '上傳模組',
  status: 'active',
  entryUrl: PATHS.weverseUploader,
  navGroups: [
    {
      id: 'weverse_uploader_nav',
      label: 'Weverse 上傳',
      icon: UploadCloud,
      items: [
        { id: 'weverse_uploader_workbench', to: PATHS.weverseUploader, label: 'Weverse 影片上傳', icon: UploadCloud },
      ],
    },
  ],
  featureCards: [
    {
      id: 'weverse_uploader_card',
      title: 'Weverse 影片上傳',
      description: '拖曳或選擇本機資料夾，自動辨識影片與 16 語系字幕，複查設定後直傳專屬 YouTube 頻道。',
      to: PATHS.weverseUploader,
      actionLabel: '進入上傳工作台',
      icon: UploadCloud,
      colorTheme: 'primary',
    },
  ],
  routes: [
    {
      path: PATHS.weverseUploader.slice(1),
      component: lazy(() => import('../../pages/WeverseUploaderPage')),
      getProps: ({ pageProps }) => pageProps,
    },
  ],
};

export default manifest;
