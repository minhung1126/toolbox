export const YOUTUBE_CATEGORIES = [
  { id: '22', name: '人物與網誌 (People & Blogs)' },
  { id: '24', name: '娛樂 (Entertainment)' },
  { id: '10', name: '音樂 (Music)' },
  { id: '1', name: '電影與動畫 (Film & Animation)' },
  { id: '17', name: '體育 (Sports)' },
  { id: '20', name: '遊戲 (Gaming)' },
  { id: '23', name: '喜劇 (Comedy)' },
  { id: '25', name: '新聞與政治 (News & Politics)' },
  { id: '26', name: '教學與技巧 (Howto & Style)' },
];

export const COMMON_BCP47_LANGS = [
  { code: 'zh-TW', label: '繁體中文 (zh-TW)' },
  { code: 'zh-CN', label: '簡體中文 (zh-CN)' },
  { code: 'ko', label: '韓文 (ko)' },
  { code: 'ja', label: '日文 (ja)' },
  { code: 'en-US', label: '英文 (en-US)' },
  { code: 'en', label: '英文 (en)' },
  { code: 'es', label: '西班牙文 (es)' },
  { code: 'fr', label: '法文 (fr)' },
  { code: 'de', label: '德文 (de)' },
  { code: 'id', label: '印尼文 (id)' },
  { code: 'th', label: '泰文 (th)' },
  { code: 'vi', label: '越南文 (vi)' },
  { code: 'ru', label: '俄文 (ru)' },
  { code: 'pt-PT', label: '葡萄牙文 (pt-PT)' },
  { code: 'it', label: '義大利文 (it)' },
  { code: 'hi', label: '印地文 (hi)' },
  { code: 'ar', label: '阿拉伯文 (ar)' },
];

export function formatBytes(bytes: number) {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
