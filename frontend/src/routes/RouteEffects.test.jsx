import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import RouteEffects, { buildRouteTitleMap, titleForPath } from './RouteEffects';
import { PATHS } from './paths';

describe('RouteEffects and titleForPath', () => {
  it('returns valid page title for all registered PATHS', () => {
    const expectedMappings = [
      ['/', '儀表板｜Toolbox'],
      [PATHS.dashboard, '儀表板｜Toolbox'],
      [PATHS.login, '登入｜Toolbox'],
      [PATHS.setup, '初次安裝精靈｜Toolbox'],
      [PATHS.notes, '便利貼備忘錄｜Toolbox'],
      [PATHS.operations, '作業紀錄與對帳｜Toolbox'],
      [PATHS.photoCurator, 'Instagram 貼文排版｜Toolbox'],
      [PATHS.ffmpegGenerator, 'FFmpeg 命令行生成器｜Toolbox'],
      [PATHS.componentShowcase, '共用元件展示｜Toolbox'],
      [PATHS.systemHealth, 'API 健康度｜Toolbox'],
      [PATHS.systemInfo, '系統／部署資訊｜Toolbox'],
      [PATHS.systemSettings, '系統安全與白名單｜Toolbox'],
      ['/settings/system', '系統安全與白名單｜Toolbox'],
      [PATHS.sheetCopy, 'Sheet 內容複製｜Toolbox'],
      [PATHS.sheetSettings, '預設 Google Sheet｜Toolbox'],
      ['/settings/sheets', '預設 Google Sheet｜Toolbox'],
      [PATHS.googleSettings, 'Google 帳號與授權｜Toolbox'],
      [PATHS.settings, 'Google 帳號與授權｜Toolbox'],
      [PATHS.youtubeVideoDrafts, 'Video 快速套用｜Toolbox'],
      [PATHS.youtubeShortsDrafts, 'Shorts 快速套用｜Toolbox'],
      [PATHS.youtubeVideoStaging, '編輯草稿並公開｜Toolbox'],
      [PATHS.youtubeShortsStaging, '編輯草稿並公開｜Toolbox'],
      [PATHS.youtubePublishCleanup, '清理 To-Post｜Toolbox'],
      [PATHS.youtubeSettings, 'YouTube 授權組合｜Toolbox'],
      [PATHS.youtubeConnections, 'YouTube 授權組合｜Toolbox'],
      [PATHS.youtubeRouting, 'YouTube 路由模式｜Toolbox'],
      [PATHS.youtubeQuota, 'YouTube 配額設定｜Toolbox'],
      [PATHS.youtubePlaylist, '預設播放清單｜Toolbox'],
      [PATHS.youtubePlaylistSort, 'YouTube Music 播放清單排序｜Toolbox'],
      [PATHS.ytmusicPlaylistSort, 'YouTube Music 播放清單排序｜Toolbox'],
      [PATHS.ytmusicSettings, 'YouTube Music 設定｜Toolbox'],
    ];

    for (const [path, expectedTitle] of expectedMappings) {
      const title = titleForPath(path);
      expect(title).toBe(expectedTitle);
      expect(title).not.toContain('不存在');
    }

    for (const path of Object.values(PATHS)) {
      expect(titleForPath(path)).not.toBe('頁面不存在｜Toolbox');
    }
  });

  it('derives titles dynamically for manifest routes without hardcoded route titles', () => {
    const customMap = buildRouteTitleMap([
      {
        id: 'sample-plugin',
        title: '範例工具標題',
        featureCards: [{ to: '/sample-plugin', title: '範例卡片標題' }],
        routes: [{ path: 'sample-plugin' }, { path: 'sample-plugin/sub' }],
      },
    ]);
    expect(titleForPath('/sample-plugin', customMap)).toBe('範例卡片標題｜Toolbox');
    expect(titleForPath('/sample-plugin/sub', customMap)).toBe('範例工具標題｜Toolbox');
  });

  it('returns 頁面不存在｜Toolbox for unknown routes', () => {
    expect(titleForPath('/some/unknown/page')).toBe('頁面不存在｜Toolbox');
    expect(titleForPath('/404')).toBe('頁面不存在｜Toolbox');
  });

  it('sets document.title when rendered inside a router', () => {
    render(
      <MemoryRouter initialEntries={[PATHS.photoCurator]}>
        <RouteEffects />
      </MemoryRouter>
    );
    expect(document.title).toBe('Instagram 貼文排版｜Toolbox');
  });
});
