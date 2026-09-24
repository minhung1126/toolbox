/** Feature manifest: tool metadata, navigation, and dashboard cards. */
import { lazy } from 'react';
import { Instagram } from 'lucide-react';
import { PATHS } from '../../routes/paths';

const manifest = {
  id: 'photo-curator',
  name: 'Photo Curator',
  title: 'Instagram 貼文排版',
  description: 'Instagram 貼文三部曲照片排版工作台，支援照片分流、防漏分配池、首圖橫排預覽與一鍵結構化打包。',
  category: '日常生產力',
  icon: Instagram,
  badge: '排版模組',
  status: 'active',
  entryUrl: PATHS.photoCurator,
  navGroups: [
    {
      id: 'photo_curator_nav',
      label: 'Instagram 排版',
      icon: Instagram,
      items: [{ id: 'photo_curator_workbench', to: PATHS.photoCurator, label: 'Instagram 排版', icon: Instagram }],
    },
  ],
  featureCards: [
    {
      id: 'photo_curator_card',
      title: 'Instagram 貼文排版',
      description: '將一系列照片分流為 3 篇 IG 貼文，具備防漏計數、序號鎖定與結構化打包。',
      to: PATHS.photoCurator,
      actionLabel: '進入排版工作台',
      icon: Instagram,
      colorTheme: 'primary',
    },
  ],
  routes: [
    {
      path: PATHS.photoCurator.slice(1),
      component: lazy(() => import('../../pages/PhotoCuratorPage')),
      getProps: ({ pageProps }) => pageProps,
    },
  ],
};

export default manifest;
