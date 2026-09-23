/** Feature manifest: tool metadata, navigation, and dashboard cards. */
import { lazy } from 'react';
import { StickyNote } from 'lucide-react';
import { PATHS } from '../../routes/paths';

const manifest = {
  id: 'sticky-notes',
  name: 'Sticky Notes',
  title: '日常生產力工具',
  description: '極簡文字便利貼，支援多便籤編輯、備註標記、一鍵複製與最後修改時間追蹤。',
  category: '日常生產力',
  icon: StickyNote,
  badge: '生產力模組',
  status: 'active',
  entryUrl: PATHS.notes,
  navGroups: [
    {
      id: 'notes',
      label: '便利貼',
      icon: StickyNote,
      items: [{ id: 'sticky_notes_list', to: PATHS.notes, label: '便利貼備忘錄', icon: StickyNote }],
    },
  ],
  featureCards: [
    {
      id: 'sticky_notes_card',
      title: '便利貼備忘錄',
      description: '快速記錄隨手文字內容，支援多卡片文字編輯、備註標記、一鍵複製與自動儲存。',
      to: PATHS.notes,
      actionLabel: '進入便利貼',
      icon: StickyNote,
      colorTheme: 'primary',
    },
  ],
  routes: [
    {
      path: PATHS.notes.slice(1),
      component: lazy(() => import('../../pages/StickyNotesPage')),
      getProps: ({ pageProps }) => pageProps,
    },
  ],
};

export default manifest;
