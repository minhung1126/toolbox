import { describe, expect, it } from 'vitest';
import { readDroppedFiles } from './droppedFiles';

describe('directory drop', () => {
  it('drains every batch and nested folder instead of truncating at 100 files', async () => {
    const file = (name: string) => ({
      isFile: true,
      file: (resolve: (f: File) => void) => resolve(new File(['x'], name)),
    });
    const batches = [Array.from({ length: 100 }, (_, i) => file(`${i}.vtt`)), [file('last.vtt')], []];
    const directory = {
      isDirectory: true,
      createReader: () => ({ readEntries: (resolve: (entries: unknown[]) => void) => resolve(batches.shift()!) }),
    };
    const items = [{ webkitGetAsEntry: () => directory }] as unknown as DataTransferItemList;
    const result = await readDroppedFiles(items);
    expect(result).toHaveLength(101);
    expect(result[100].name).toBe('last.vtt');
  });
  it('rejects directory read errors instead of hanging the upload UI', async () => {
    const entry = {
      isDirectory: true,
      createReader: () => ({ readEntries: (_: unknown, reject: (e: Error) => void) => reject(new Error('denied')) }),
    };
    await expect(
      readDroppedFiles([{ webkitGetAsEntry: () => entry }] as unknown as DataTransferItemList)
    ).rejects.toThrow('denied');
  });
});
