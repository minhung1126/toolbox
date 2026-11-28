/** Feature manifest: tool metadata, navigation, and dashboard cards. */
import { lazy } from 'react';
import { Instagram } from 'lucide-react';
import { PATHS } from '../../routes/paths';

const manifest = {
  id: 'photo-curator',
  purpose: '處理素材',
  name: 'Photo Curator',
  title: 'Instagram 貼文排版',
  description:
    '在本機安排首圖排版與輪播順序，編排為 3／6／9 篇貼文，輸出 ZIP、對照表及可攜排版專案；不自動發布 Instagram。',
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
      description: '一次排好 3、6 或 9 格 IG 貼文，具備防漏計數、首圖預覽與結構化打包。',
      to: PATHS.photoCurator,
      actionLabel: '進入排版工作台',
      icon: Instagram,
      colorTheme: 'primary',
    },
  ],
  routes: [
    {
      path: PATHS.photoCurator.slice(1),
      title: 'Instagram 貼文排版',
      component: lazy(() => import('../../pages/PhotoCuratorPage')),
      getProps: ({ pageProps }) => pageProps,
    },
  ],
};

export default manifest;
