/**
 * Frontend Tool Registry & Module Catalog for Toolbox.
 *
 * This registry acts as the single source of truth for tool modules,
 * defining navigation structures, metadata, dashboard cards, and capabilities.
 * New tools can register here to automatically appear in navigation and dashboard.
 */

import {
  Activity,
  ArrowUpDown,
  BarChart3,
  Clapperboard,
  Copy,
  Disc3,
  FileSpreadsheet,
  GitFork,
  Info,
  Instagram,
  Key,
  LayoutGrid,
  ListMusic,
  Send,
  Settings,
  Shield,
  Sliders,
  Smartphone,
  StickyNote,
  UploadCloud,
  Video,
  Youtube,
} from 'lucide-react';
import { PATHS } from '../routes/paths';

export const TOOL_MODULES = Object.freeze([
  {
    id: 'creator-tools',
    name: 'Creator Tools',
    title: '影音創作工作流',
    description: 'YouTube 影片與 Shorts 專屬草稿批次維護、標題說明套用與排程發布自動化。',
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
          { id: 'youtube_video_drafts', to: PATHS.youtubeVideoDrafts, label: 'Video 草稿', icon: Clapperboard },
          { id: 'youtube_shorts_drafts', to: PATHS.youtubeShortsDrafts, label: 'Shorts 草稿', icon: Smartphone },
          { id: 'publish_clean', to: PATHS.youtubePublishCleanup, label: '發布草稿', icon: Send },
          { id: 'youtube_settings', to: PATHS.youtubeConnections, label: 'YouTube 設定', icon: Settings, activePrefix: PATHS.youtubeSettings },
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
    ],
  },
  {
    id: 'youtube-music',
    name: 'YouTube Music',
    title: 'YouTube Music',
    description: 'YouTube Music 專屬音樂工具箱，提供智慧播放清單排序、多欄位自訂規則與即時模擬比對。',
    category: 'YouTube Music',
    icon: Disc3,
    badge: '音樂工具',
    status: 'active',
    entryUrl: PATHS.ytmusicPlaylistSort,
    navGroups: [
      {
        id: 'ytmusic',
        label: 'YouTube Music',
        icon: Disc3,
        items: [
          { id: 'ytmusic_playlist_sort', to: PATHS.ytmusicPlaylistSort, label: '播放清單排序', icon: ArrowUpDown },
          { id: 'ytmusic_settings', to: PATHS.ytmusicSettings, label: 'YouTube Music 設定', icon: Settings, activePrefix: PATHS.ytmusicSettings },
        ],
      },
    ],
    featureCards: [
      {
        id: 'ytmusic_playlist_sort_card',
        title: '播放清單排序',
        description: '讀取 YouTube Music 播放清單，以歌名、藝人/頻道、日期、長度等欄位自訂排序，並即時預覽變更。',
        to: PATHS.ytmusicPlaylistSort,
        actionLabel: '進入音樂排序工具',
        icon: Disc3,
        colorTheme: 'primary',
      },
      {
        id: 'ytmusic_settings_card',
        title: 'YouTube Music 設定',
        description: '管理專屬 YouTube Music 帳號授權、個人音樂庫連線狀態與排序預設偏好。',
        to: PATHS.ytmusicSettings,
        actionLabel: '進入音樂設定',
        icon: Settings,
        colorTheme: 'secondary',
      },
    ],
  },
  {
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
          { id: 'sheet_settings', to: PATHS.sheetSettings, label: 'Sheet 設定', icon: Settings, activePrefix: PATHS.sheetSettings },
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
  },
  {
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
        items: [
          { id: 'photo_curator_workbench', to: PATHS.photoCurator, label: 'Instagram 排版', icon: Instagram },
        ],
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
  },
  {
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
        items: [
          { id: 'ffmpeg_generator_workbench', to: PATHS.ffmpegGenerator, label: 'FFmpeg 生成器', icon: Video },
        ],
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
  },
  {
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
  },
  {
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
    id: 'integrations-quota',
    name: 'Integrations & Quota',
    title: 'API 整合與配額控管',
    description: 'YouTube 雙槽位頻道連線、智慧容錯路由分流、即時 API Quota 監控與預設計帳清單。',
    category: '整合與配額',
    icon: Sliders,
    badge: '維運模組',
    status: 'active',
    entryUrl: PATHS.youtubeConnections,
    navGroups: [
      {
        id: 'integrations',
        label: '整合與配額',
        icon: Sliders,
        items: [
          { id: 'youtube_connections', to: PATHS.youtubeConnections, label: 'YouTube 授權設定', icon: Key },
          { id: 'youtube_routing', to: PATHS.youtubeRouting, label: '路由分流模式', icon: GitFork },
          { id: 'youtube_quota', to: PATHS.youtubeQuota, label: '配額監控與計帳', icon: BarChart3 },
          { id: 'youtube_playlist', to: PATHS.youtubePlaylist, label: '預設播放清單', icon: Settings },
        ],
      },
    ],
    featureCards: [
      {
        id: 'youtube_connections_card',
        title: 'YouTube 連線授權',
        description: '管理主要 (Primary) 與次要 (Secondary) 雙槽位頻道連線與同頻道驗證。',
        to: PATHS.youtubeConnections,
        actionLabel: '管理授權連線',
        icon: Key,
        colorTheme: 'primary',
      },
      {
        id: 'youtube_routing_card',
        title: '智慧路由分流',
        description: '設定請求優先槽位與配額滿載自動備援容錯機制 (Auto Primary / Manual)。',
        to: PATHS.youtubeRouting,
        actionLabel: '設定路由分流',
        icon: GitFork,
        colorTheme: 'secondary',
      },
      {
        id: 'youtube_quota_card',
        title: '配額監控與防護',
        description: '即時監控 YouTube API Quota 當日消耗水位、重設時間與自訂安全緩衝值。',
        to: PATHS.youtubeQuota,
        actionLabel: '檢視配額狀況',
        icon: BarChart3,
        colorTheme: 'accent',
      },
    ],
  },
  {
    id: 'system-utility',
    name: 'System Utility',
    title: '系統維運與安全控制',
    description: '即時監控 Toolbox API 健康狀態、OAuth 憑證遮罩維護、登入白名單與 Commit 部署版本。',
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
