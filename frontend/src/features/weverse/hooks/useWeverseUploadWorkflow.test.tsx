import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { useWeverseUploadWorkflow } from './useWeverseUploadWorkflow';
import { weverseUploadApi } from '../api/weverseUploadApi';

vi.mock('../api/weverseUploadApi', () => ({
  weverseUploadApi: {
    getRecentPaths: vi.fn().mockResolvedValue({ paths: [] }),
    getHistory: vi.fn().mockResolvedValue({ tasks: [] }),
    scanFolder: vi.fn(),
    uploadFromPath: vi.fn(),
  },
}));

it('retains the reviewed package when reset is requested in the same turn as upload starts', async () => {
  const toast = { success: vi.fn(), error: vi.fn() };
  vi.mocked(weverseUploadApi.scanFolder).mockResolvedValue({
    packages: [
      {
        package_id: 'sample',
        suggested_title: 'Sample Live',
        video: { filename: 'sample.mp4', full_path: '/sample.mp4', size_formatted: '10 MB' },
        subtitles: [],
      },
    ],
  } as any);
  let rejectUpload!: (error: unknown) => void;
  vi.mocked(weverseUploadApi.uploadFromPath).mockImplementation(
    () =>
      new Promise((_resolve, reject) => {
        rejectUpload = reject;
      })
  );
  const wrapper = ({ children }: { children: React.ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;
  const { result } = renderHook(() => useWeverseUploadWorkflow({ isVideoAuthConnected: true, toast }), { wrapper });
  await act(async () => result.current.handleScanPath('/sample'));

  let uploadPromise!: Promise<void>;
  act(() => {
    uploadPromise = result.current.handleStartUpload();
    result.current.handleReset();
  });
  expect(result.current.viewStep).toBe('review');
  expect(result.current.videoInfo?.filename).toBe('sample.mp4');
  expect(result.current.uploadStarting).toBe(true);

  await act(async () => {
    rejectUpload({ status: 403, message: '授權失效' });
    await uploadPromise;
  });
  act(() => result.current.handleReset());
  expect(result.current.viewStep).toBe('pick');
  expect(result.current.videoInfo).toBeNull();
});
