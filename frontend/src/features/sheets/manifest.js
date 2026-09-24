/** Feature manifest: tool metadata, navigation, and dashboard cards. */
import { lazy } from 'react';
import { Copy, FileSpreadsheet, Settings } from 'lucide-react';
import { PATHS } from '../../routes/paths';

const manifest = {
  id: 'sheets-tools',
  name: 'Sheets & Data',
  title: '試算表與資料服務',
  description: 'Google 試算表結構與內容跨表複製、欄位對照與來源偏好管理。',
  category: '資料處理',
  icon: FileSpreadsheet,
  badge: '資料模組',
  status: 'active',
  entryUrl: PATHS.sheetCopy,
  navGroups: [
    {
      id: 'sheet',
      label: 'Sheet',
      icon: FileSpreadsheet,
      items: [
        { id: 'sheet_copy', to: PATHS.sheetCopy, label: '內容複製', icon: Copy },
        {
          id: 'sheet_settings',
          to: PATHS.sheetSettings,
          label: 'Sheet 設定',
          icon: Settings,
          activePrefix: PATHS.sheetSettings,
        },
      ],
    },
  ],
  featureCards: [
    {
      id: 'sheet_copy',
      title: 'Sheet 內容複製',
      description: '在工作表或試算表間依團體與人物篩選，快速複製儲存格內容。',
      to: PATHS.sheetCopy,
      actionLabel: '進入內容複製',
      icon: Copy,
      colorTheme: 'secondary',
    },
    {
      id: 'sheet_settings_card',
      title: 'Sheet 設定與授權',
      description: '管理 Google 試算表存取授權與預設試算表來源 ID。',
      to: PATHS.sheetSettings,
      actionLabel: '進入 Sheet 設定',
      icon: FileSpreadsheet,
      colorTheme: 'accent',
    },
  ],
  routes: [
    {
      path: PATHS.sheetCopy.slice(1),
      component: lazy(() => import('../../pages/SheetCopyPage')),
      getProps: ({ sysSettings }) => ({ sysSettings }),
    },
    {
      path: PATHS.sheetSettings.slice(1),
      component: lazy(() => import('../../pages/GoogleSheetSettingsPage')),
      getProps: ({ pageProps }) => pageProps,
    },
  ],
};

export default manifest;
