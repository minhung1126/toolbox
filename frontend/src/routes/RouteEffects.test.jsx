import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import RouteEffects, { titleForPath } from './RouteEffects';
import { PATHS } from './paths';

describe('RouteEffects and titleForPath', () => {
  it('returns valid page title for all registered PATHS', () => {
    const expectedMappings = [
      ['/', '儀表板｜Toolbox'],
      [PATHS.dashboard, '儀表板｜Toolbox'],
      [PATHS.login, '登入｜Toolbox'],
      [PATHS.setup, '初次安裝精靈｜Toolbox'],
      [PATHS.notes, '便利貼備忘錄｜Toolbox'],
      [PATHS.photoCurator, 'Instagram 貼文排版｜Toolbox'],
      [PATHS.systemHealth, 'API 健康度｜Toolbox'],
      [PATHS.systemInfo, '系統／部署資訊｜Toolbox'],
      [PATHS.systemSettings, '系統安全與白名單｜Toolbox'],
      ['/settings/system', '系統安全與白名單｜Toolbox'],
      [PATHS.sheetCopy, 'Sheet 內容複製｜Toolbox'],
      [PATHS.sheetSettings, '預設 Google Sheet｜Toolbox'],
      ['/settings/sheets', '預設 Google Sheet｜Toolbox'],
      [PATHS.googleSettings, 'Google 帳號與授權｜Toolbox'],
      [PATHS.settings, 'Google 帳號與授權｜Toolbox'],
      [PATHS.youtubeVideoDrafts, 'Video 草稿｜Toolbox'],
      [PATHS.youtubeShortsDrafts, 'Shorts 草稿｜Toolbox'],
      [PATHS.youtubePublishCleanup, '發布草稿｜Toolbox'],
      [PATHS.youtubeSettings, 'YouTube 授權組合｜Toolbox'],
      [PATHS.youtubeConnections, 'YouTube 授權組合｜Toolbox'],
      [PATHS.youtubeRouting, 'YouTube 路由模式｜Toolbox'],
      [PATHS.youtubeQuota, 'YouTube 配額設定｜Toolbox'],
      [PATHS.youtubePlaylist, '預設播放清單｜Toolbox'],
    ];

    for (const [path, expectedTitle] of expectedMappings) {
      const title = titleForPath(path);
      expect(title).toBe(expectedTitle);
      expect(title).not.toContain('不存在');
    }
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
