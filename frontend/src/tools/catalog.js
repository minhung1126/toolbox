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
  Shield,
  Smartphone,
  StickyNote,
  Youtube,
} from 'lucide-react';
import { PATHS } from '../routes/paths';

export const TOOL_MODULES = Object.freeze([
  {
    id: 'sticky-notes',
    name: 'Sticky Notes',
    title: '便利貼備忘錄',
    description: '極簡文字便利貼，支援多便籤編輯、備註標記、一鍵複製與最後修改時間追蹤。',
    category: '生產力工具',
    icon: StickyNote,
    badge: '生產力模組',
    status: 'active',
    entryUrl: PATHS.notes,
    navGroups: [
      {
        id: 'notes',
        label: '便利貼',
        icon: StickyNote,
        items: [
          { id: 'sticky_notes_list', to: PATHS.notes, label: '便利貼備忘錄', icon: StickyNote },
        ],
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
  },
  {
    id: 'creator-tools',
    name: 'Creator Tools',
    title: '創作者工作流控制台',
    description: 'Google Sheets 整合、YouTube 影片與 Shorts 草稿維護及發布配額防護。',
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
          { id: 'sheet_settings', to: PATHS.sheetSettings, label: 'Sheet 設定', icon: Settings, activePrefix: PATHS.sheetSettings },
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
        id: 'sheet_copy',
        title: 'Sheet 內容複製',
        description: '在工作表或試算表間依團體與人物篩選，快速複製儲存格內容。',
        to: PATHS.sheetCopy,
        actionLabel: '進入內容複製',
        icon: Copy,
        colorTheme: 'secondary',
      },
    ],
  },
  {
    id: 'system-utility',
    name: 'System Utility',
    title: '系統診斷與維運資訊',
    description: '即時監控 Toolbox API 健康狀態、OAuth 憑證就緒度、環境參數與 Commit 部署版本。',
    category: '系統管理',
    icon: Shield,
    badge: '系統模組',
    status: 'active',
    entryUrl: PATHS.systemSettings,
    navGroups: [
      {
        id: 'system',
        label: '系統管理',
        icon: Shield,
        items: [
          { id: 'system_settings', to: PATHS.systemSettings, label: '系統設定', icon: Shield, activePrefix: PATHS.systemSettings },
          { id: 'system_info', to: PATHS.systemInfo, label: '系統／部署資訊', icon: Info },
          { id: 'api_health', to: PATHS.systemHealth, label: 'API 健康度', icon: Activity },
        ],
      },
    ],
    navItems: [
      { id: 'system_settings', to: PATHS.systemSettings, label: '系統設定', icon: Shield, activePrefix: PATHS.systemSettings },
      { id: 'system_info', to: PATHS.systemInfo, label: '系統／部署資訊', icon: Info },
      { id: 'api_health', to: PATHS.systemHealth, label: 'API 健康度', icon: Activity },
    ],
    featureCards: [
      {
        id: 'system_settings_card',
        title: '系統設定',
        description: '管理系統安全密鑰、Google OAuth 憑證配置與控制台登入白名單。',
        to: PATHS.systemSettings,
        actionLabel: '進入系統設定',
        icon: Shield,
        colorTheme: 'accent',
      },
      {
        id: 'system_info_card',
        title: '系統／部署資訊',
        description: '檢視執行環境參數、快取配置與當前 Docker 部署 Commit SHA。',
        to: PATHS.systemInfo,
        actionLabel: '檢視部署資訊',
        icon: Info,
        colorTheme: 'secondary',
      },
      {
        id: 'api_health_card',
        title: 'API 健康度',
        description: '即時監控後端 API 就緒狀態、憑證驗證與服務運作指標。',
        to: PATHS.systemHealth,
        actionLabel: '檢查 API 健康度',
        icon: Activity,
        colorTheme: 'secondary',
      },
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
  if (systemTool?.navGroups?.[0]?.items) {
    return systemTool.navGroups[0].items;
  }
  return systemTool?.navItems || [];
}

/**
 * Retrieve dashboard feature cards across all modules.
 */
export function getDashboardFeatureCards() {
  return TOOL_MODULES.flatMap((tool) => tool.featureCards || []);
}

/**
 * Group tools by their declared category.
 */
export function getToolsByCategory() {
  const categories = {};
  for (const tool of TOOL_MODULES) {
    const cat = tool.category || '一般工具';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(tool);
  }
  return categories;
}
