import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const TITLES = [
  [/^\/login$/, '登入｜Toolbox'],
  [/^\/setup$/, '初次安裝精靈｜Toolbox'],
  [/^\/dashboard$/, '儀表板｜Toolbox'],
  [/^\/system\/health$/, 'API 健康度｜Toolbox'],
  [/^\/system\/info$/, '系統／部署資訊｜Toolbox'],
  [/^\/youtube\/drafts\/videos$/, 'Video 草稿｜Toolbox'],
  [/^\/youtube\/drafts\/shorts$/, 'Shorts 草稿｜Toolbox'],
  [/^\/youtube\/publish-cleanup$/, '發布草稿｜Toolbox'],
  [/^\/youtube\/settings\/connections$/, 'YouTube 授權組合｜Toolbox'],
  [/^\/youtube\/settings\/routing$/, 'YouTube 路由模式｜Toolbox'],
  [/^\/youtube\/settings\/quota$/, 'YouTube 配額設定｜Toolbox'],
  [/^\/youtube\/settings\/playlist$/, '預設播放清單｜Toolbox'],
  [/^\/sheets\/copy$/, 'Sheet 內容複製｜Toolbox'],
  [/^\/settings\/google$/, 'Google 帳號與授權｜Toolbox'],
  [/^\/settings\/sheets$/, '預設 Google Sheet｜Toolbox'],
  [/^\/settings\/system$/, '系統安全與白名單｜Toolbox'],
];

export function titleForPath(pathname) {
  return TITLES.find(([pattern]) => pattern.test(pathname))?.[1] || '頁面不存在｜Toolbox';
}

export default function RouteEffects() {
  const location = useLocation();

  useEffect(() => {
    document.title = titleForPath(location.pathname);
    if (!window.navigator.userAgent.includes('jsdom')) window.scrollTo?.(0, 0);
  }, [location.pathname, location.search]);

  return null;
}
