/**
 * Frontend Tool Registry & Module Catalog for Toolbox.
 *
 * This registry acts as the single source of truth for tool modules,
 * defining navigation structures, metadata, dashboard cards, and capabilities.
 * New tools can register here to automatically appear in navigation and dashboard.
 */

import {
  Activity,
  Clapperboard,
  Copy,
  FileSpreadsheet,
  Info,
  Send,
  Settings,
  Smartphone,
  Upload,
  Youtube,
} from 'lucide-react';
import { PATHS } from '../routes/paths';

export const TOOL_MODULES = Object.freeze([
  {
    id: 'creator-tools',
    name: 'Creator Tools',
    title: '創作者工作流控制台',
    description: 'Google Sheets 整合、YouTube 影片與 Shorts 草稿維護、Drive 斷點續傳上傳與配額防護。',
    category: '媒體與影音',
    icon: Youtube,
    badge: '核心套件',
    status: 'active',
    entryUrl: PATHS.dashboard,
    navGroups: [
      {
        id: 'youtube',
        label: 'YouTube',
        icon: Youtube,
        items: [
          { id: 'youtube_upload', to: PATHS.youtubeUploadNew, label: '上傳至 YouTube', icon: Upload },
          { id: 'youtube_video_drafts', to: PATHS.youtubeVideoDrafts, label: 'Video 草稿', icon: Clapperboard },
          { id: 'youtube_shorts_drafts', to: PATHS.youtubeShortsDrafts, label: 'Shorts 草稿', icon: Smartphone },
          { id: 'publish_clean', to: PATHS.youtubePublishCleanup, label: '發布草稿', icon: Send },
          { id: 'youtube_settings', to: PATHS.youtubeConnections, label: 'YouTube 設定', icon: Settings, activePrefix: PATHS.youtubeSettings },
        ],
      },
      {
        id: 'sheet',
        label: 'Sheet',
        icon: FileSpreadsheet,
        items: [
          { id: 'sheet_copy', to: PATHS.sheetCopy, label: '內容複製', icon: Copy },
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
      {
        id: 'upload_drive',
        title: 'Drive 上傳 YouTube',
        description: '從 Google Drive 資料夾依檔名排序逐部上傳至 YouTube，支援斷點續傳。',
        to: PATHS.youtubeUploadNew,
        actionLabel: '建立上傳工作',
        icon: Upload,
        colorTheme: 'secondary',
      },
    ],
  },
  {
    id: 'system-utility',
    name: 'System Utility',
    title: '系統診斷與部署資訊',
    description: '即時監控 Toolbox API 健康狀態、OAuth 憑證就緒度、環境參數與 Commit 部署版本。',
    category: '系統管理',
    icon: Activity,
    badge: '系統模組',
    status: 'active',
    entryUrl: PATHS.systemHealth,
    navItems: [
      { id: 'api_health', to: PATHS.systemHealth, label: 'API健康度', icon: Activity },
      { id: 'system_info', to: PATHS.systemInfo, label: '系統／部署資訊', icon: Info },
    ],
  },
]);

/**
 * Return all registered tool modules.
 */
export function getAllTools() {
  return TOOL_MODULES;
}

/**
 * Find a tool module by its unique identifier.
 */
export function getToolById(toolId) {
  return TOOL_MODULES.find((tool) => tool.id === toolId) || null;
}

/**
 * Retrieve all navigation groups across tools.
 */
export function getToolNavGroups() {
  return TOOL_MODULES.flatMap((tool) => tool.navGroups || []);
}

/**
 * Retrieve top-level system navigation items.
 */
export function getSystemNavItems() {
  const systemTool = getToolById('system-utility');
  return systemTool?.navItems || [];
}

/**
 * Retrieve dashboard feature cards.
 */
export function getDashboardFeatureCards() {
  const creatorTool = getToolById('creator-tools');
  return creatorTool?.featureCards || [];
}
