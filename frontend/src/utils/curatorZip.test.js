import { describe, expect, it, vi } from 'vitest';
import { exportCuratedZip, generateChecklistText } from './curatorZip';

describe('curatorZip utils', () => {
  describe('generateChecklistText', () => {
    it('produces formatted checklist text for posts', () => {
      const photos = [
        { id: 'ph-1', name: 'photo1.jpg' },
        { id: 'ph-2', name: 'photo2.jpg' },
      ];
      const photoMap = new Map([
        ['ph-1', photos[0]],
        ['ph-2', photos[1]],
      ]);
      const posts = [{ id: 'post-1', title: '首部曲', photoIds: ['ph-1', 'ph-2'] }];

      const text = generateChecklistText({ photos, posts, photoMap, unassignedIds: [] });
      expect(text).toContain('# Instagram 貼文三部曲發布對照表');
      expect(text).toContain('【Post 1】首部曲（共 2 張）');
      expect(text).toContain('01. photo1.jpg [★ 首圖 Cover]');
      expect(text).toContain('02. photo2.jpg');
    });

    it('lists unassigned photos if any', () => {
      const photos = [{ id: 'ph-unassigned', name: 'extra.jpg' }];
      const photoMap = new Map([['ph-unassigned', photos[0]]]);
      const text = generateChecklistText({
        photos,
        posts: [],
        photoMap,
        unassignedIds: ['ph-unassigned'],
      });
      expect(text).toContain('未分配備忘照片（共 1 張）：');
      expect(text).toContain('- extra.jpg');
    });
  });

  describe('exportCuratedZip', () => {
    it('creates zip blob and triggers anchor download', async () => {
      global.URL.createObjectURL = vi.fn(() => 'blob:mock-download-url');
      global.URL.revokeObjectURL = vi.fn();
      let downloadedAnchor;
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function recordDownloadClick() {
        downloadedAnchor = this;
      });

      const dummyFile = new Blob(['hello'], { type: 'image/jpeg' });
      const photoMap = new Map([['p1', { id: 'p1', name: 'test.jpg', file: dummyFile }]]);
      const posts = [{ id: 'post-1', title: 'My Post', photoIds: ['p1'] }];

      await exportCuratedZip({ posts, photoMap, checklistContent: 'test checklist' });

      expect(global.URL.createObjectURL).toHaveBeenCalled();
      expect(downloadedAnchor).toHaveAttribute('href', 'blob:mock-download-url');
      expect(downloadedAnchor).toHaveAttribute('download', expect.stringMatching(/\.zip$/));
    });
  });
});
