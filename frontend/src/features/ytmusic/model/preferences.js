export const REGION_PRESETS = [
  {
    id: 'TW',
    label: '台灣（繁體中文）',
    badge: '預設',
    language: 'zh_TW',
    location: 'TW',
    description: '顯示台灣在地化中文歌名與藝人名稱（例如：五月天、周興哲、小男孩樂團）',
  },
  {
    id: 'US',
    label: '英文 (English)',
    badge: 'US',
    language: 'en',
    location: 'US',
    description: '顯示英文歌名與羅馬拼音藝人名稱（例如：Mayday、Eric Chou）',
  },
  {
    id: 'KR',
    label: '韓文 (한국어)',
    badge: 'KR',
    language: 'ko',
    location: 'KR',
    description: '顯示韓文在地化藝人與歌曲名稱',
  },
  {
    id: 'JP',
    label: '日文 (日本語)',
    badge: 'JP',
    language: 'ja',
    location: 'JP',
    description: '顯示日文在地化藝人與歌曲名稱',
  },
  {
    id: 'custom',
    label: '其他（自訂地區與語言代碼）',
    badge: '自訂',
    language: '',
    location: '',
    description: '自訂 YouTube Music Innertube API 與備援管道的語言代碼與地區縮寫',
  },
];

export const PRESET_OPTIONS = [
  { value: 'album-order', label: '經典完整專輯（藝人 → 年份 → 專輯 → 曲目 #）' },
  { value: 'artist-album-track', label: '藝人專輯曲目（藝人 → 專輯 → 曲目 #）' },
  { value: 'title-asc', label: '歌名 A → Z' },
  { value: 'title-desc', label: '歌名 Z → A' },
  { value: 'artist-asc', label: '頻道／藝人 A → Z' },
  { value: 'artist-desc', label: '頻道／藝人 Z → A' },
  { value: 'added-newest', label: '新增日期（新 → 舊）' },
  { value: 'added-oldest', label: '新增日期（舊 → 新）' },
  { value: 'published-newest', label: '發布日期（新 → 舊）' },
  { value: 'published-oldest', label: '發布日期（舊 → 新）' },
  { value: 'duration-shortest', label: '長度（短 → 長）' },
  { value: 'duration-longest', label: '長度（長 → 短）' },
  { value: 'random', label: '隨機排序' },
];

export const DEFAULT_PREFERENCES = Object.freeze({
  defaultPreset: 'title-asc',
  regionPreset: 'TW',
  language: 'zh_TW',
  location: 'TW',
  customLanguage: '',
  customLocation: '',
});
