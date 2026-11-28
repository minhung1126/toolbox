import React, { useEffect } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProjectFiles from './ProjectFiles';
import { PhotoCuratorSessionProvider, usePhotoCuratorSession } from '../PhotoCuratorSession';
import { ToastProvider } from '../../../components/Toast';

function SeedMissingPhotos({ initialPhotos }) {
  const { setPhotos } = usePhotoCuratorSession();
  useEffect(() => {
    setPhotos(initialPhotos);
  }, [initialPhotos, setPhotos]);
  return <ProjectFiles />;
}

describe('ProjectFiles under StrictMode', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    let counter = 0;
    global.URL.createObjectURL = vi.fn(() => `blob:preview-${++counter}`);
    global.URL.revokeObjectURL = vi.fn();
  });

  it('calls URL.createObjectURL only once per matched or manually replaced file in StrictMode', () => {
    const initialPhotos = [
      { id: 'p1', name: 'one.jpg', size: 3, lastModified: 100, file: null, previewUrl: '', missing: true },
      { id: 'p2', name: 'two.jpg', size: 4, lastModified: 200, file: null, previewUrl: '', missing: true },
    ];

    render(
      <React.StrictMode>
        <ToastProvider>
          <PhotoCuratorSessionProvider>
            <SeedMissingPhotos initialPhotos={initialPhotos} />
          </PhotoCuratorSessionProvider>
        </ToastProvider>
      </React.StrictMode>
    );

    const batchInput = screen.getByLabelText(/重新選擇本機照片/);
    const matchFile = new File(['abc'], 'one.jpg', { type: 'image/jpeg', lastModified: 100 });
    fireEvent.change(batchInput, { target: { files: [matchFile] } });

    expect(global.URL.createObjectURL).toHaveBeenCalledTimes(1);

    const manualInput = screen.getByLabelText(/two\.jpg.*手動指定檔案/);
    const manualFile = new File(['wxyz'], 'two-replacement.jpg', { type: 'image/jpeg', lastModified: 300 });
    fireEvent.change(manualInput, { target: { files: [manualFile] } });

    expect(global.URL.createObjectURL).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/0 張待補/)).toBeInTheDocument();
  });
});
