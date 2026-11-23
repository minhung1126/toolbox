import { describe, it, expect, vi } from 'vitest';
import { exportProject, parseProject, matchProjectFiles } from './project';
const photos = [
  { id: 'a', name: '中文.jpg', size: 10, lastModified: 100 },
  { id: 'b', name: 'other.jpg', size: 20, lastModified: 200 },
];
const project = {
  photos,
  posts: [
    { id: 'p1', title: '第一篇', photoIds: ['b', 'a'] },
    { id: 'p2', title: '第二篇', photoIds: [] },
    { id: 'p3', title: '第三篇', photoIds: [] },
  ],
  unassignedIds: [],
};
describe('portable photo arrangement', () => {
  it('round trips order and covers without embedding any local file or URL', () => {
    const exported = exportProject({
      ...project,
      photos: photos.map((photo) => ({ ...photo, file: { private: true }, previewUrl: 'blob:private' })),
    });
    expect(parseProject(JSON.stringify(exported))).toEqual(exportProject(project));
    expect(JSON.stringify(exported)).not.toContain('private');
    expect(exported.posts[0].photoIds[0]).toBe('b');
  });
  it('rejects future versions, duplicate placements and missing photo references', () => {
    const valid = exportProject(project);
    for (const invalid of [
      { ...valid, version: 2 },
      { ...valid, unassignedIds: ['a'] },
      { ...valid, photos: [] },
    ])
      expect(() => parseProject(JSON.stringify(invalid))).toThrow();
  });
  it('matches unique metadata only, leaving duplicate or absent files unresolved', () => {
    URL.createObjectURL = vi.fn(() => 'blob:matched');
    const match = matchProjectFiles(photos, [{ name: '中文.jpg', size: 10, lastModified: 100 }]);
    expect(match[0].file).toBeTruthy();
    expect(match[1].missing).toBe(true);
    expect(matchProjectFiles(photos, [{ ...photos[0] }, { ...photos[0] }])[0].file).toBeUndefined();
    expect(matchProjectFiles([photos[0], { ...photos[0], id: 'duplicate' }], [photos[0]])[0].file).toBeUndefined();
  });
});
