import React from 'react';
import { createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PhotoCuratorPage from './PhotoCuratorPage';
import { api } from '../services/api';
import { copyToClipboard } from '../utils/clipboard';
import { exportCuratedZip } from '../features/photo-curator/model/curatorZip';
import { PhotoCuratorSessionProvider } from '../features/photo-curator/PhotoCuratorSession';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../services/api', () => ({
  api: {
    getPhotoCuratorPresets: vi.fn(),
    generatePhotoCuratorChecklist: vi.fn(),
  },
}));

const mockToast = {
  success: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
};

vi.mock('../components/Toast', () => ({
  useToast: () => mockToast,
}));

vi.mock('../utils/clipboard', () => ({
  copyToClipboard: vi.fn(),
}));

vi.mock('../features/photo-curator/model/curatorZip', async (importOriginal) => ({
  ...(await importOriginal()),
  exportCuratedZip: vi.fn(),
}));

describe('PhotoCuratorPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    copyToClipboard.mockResolvedValue(undefined);
    exportCuratedZip.mockResolvedValue(undefined);
    global.URL.createObjectURL = vi.fn((file) => `mock://preview/${file?.name || 'test'}`);
    global.URL.revokeObjectURL = vi.fn();
    api.getPhotoCuratorPresets.mockResolvedValue([
      {
        id: 'theme-perspective',
        name: '主題視角型',
        buckets: [
          { id: 'post-1', title: 'Post 1', default_theme: 'Post 1' },
          { id: 'post-2', title: 'Post 2', default_theme: 'Post 2' },
          { id: 'post-3', title: 'Post 3', default_theme: 'Post 3' },
        ],
      },
      {
        id: 'chronological',
        name: '時序敘事型',
        buckets: [
          { id: 'post-1', title: '啟程破題', default_theme: '啟程破題' },
          { id: 'post-2', title: '核心體驗', default_theme: '核心體驗' },
          { id: 'post-3', title: '尾聲收尾', default_theme: '尾聲收尾' },
        ],
      },
    ]);
  });

  it('renders workbench with 3 post columns and unassigned pool', async () => {
    render(<PhotoCuratorPage />);

    expect(screen.getByText('貼文三部曲排版工作台')).toBeInTheDocument();
    expect(screen.getByText('Instagram 主頁三聯排效果預覽')).toBeInTheDocument();
    expect(screen.getByText('待分配防漏池')).toBeInTheDocument();
    expect(screen.getAllByText(/Post [123] 封面/).map((node) => node.textContent)).toEqual([
      'Post 3 封面',
      'Post 2 封面',
      'Post 1 封面',
    ]);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Post 1')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Post 2')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Post 3')).toBeInTheDocument();
    });
  });

  it('allows importing photos and assigning them to post buckets', async () => {
    const { container } = render(<PhotoCuratorPage />);

    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();

    const file1 = new File(['content1'], 'cafe_wide.jpg', { type: 'image/jpeg' });
    const file2 = new File(['content2'], 'outfit.jpg', { type: 'image/jpeg' });

    fireEvent.change(fileInput, { target: { files: [file1, file2] } });

    await waitFor(() => {
      expect(screen.getByText('cafe_wide.jpg')).toBeInTheDocument();
      expect(screen.getByText('outfit.jpg')).toBeInTheDocument();
      expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining('成功匯入 2 張照片'));
    });

    // Quick assign file1 to Post 1
    const p1Buttons = screen.getAllByRole('button', { name: '+ P1' });
    fireEvent.click(p1Buttons[0]);

    await waitFor(() => {
      // cafe_wide.jpg should now be in Post 1 and marked as #01 封面
      expect(screen.getByText(/#01 封面/)).toBeInTheDocument();
      expect(screen.getByText('剩餘 1 張')).toBeInTheDocument();
    });
  });

  it('allows customizing column titles directly without preset model', async () => {
    render(<PhotoCuratorPage />);

    expect(screen.queryByText('策展模型：')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByDisplayValue('Post 1')).toBeInTheDocument();
    });

    const p1Input = screen.getByDisplayValue('Post 1');
    fireEvent.change(p1Input, { target: { value: '我的自訂空間主題' } });

    expect(screen.getByDisplayValue('我的自訂空間主題')).toBeInTheDocument();
  });

  it('allows resetting workbench through ConfirmDialog', async () => {
    const { container } = render(<PhotoCuratorPage />);
    const fileInput = container.querySelector('input[type="file"]');
    const file1 = new File(['content1'], 'test_pic.jpg', { type: 'image/jpeg' });

    fireEvent.change(fileInput, { target: { files: [file1] } });

    await waitFor(() => {
      expect(screen.getByText('test_pic.jpg')).toBeInTheDocument();
    });

    const resetBtn = screen.getByRole('button', { name: /清空重置/ });
    fireEvent.click(resetBtn);

    // ConfirmDialog should now be open
    await waitFor(() => {
      expect(screen.getByText('清空工作台')).toBeInTheDocument();
      expect(screen.getByText('確定要清空所有已匯入的照片與貼文分組嗎？此操作無法復原。')).toBeInTheDocument();
    });

    const confirmBtn = screen.getByRole('button', { name: '確認清空' });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(screen.queryByText('test_pic.jpg')).not.toBeInTheDocument();
      expect(mockToast.info).toHaveBeenCalledWith('工作台已重設。');
    });
  });

  it('auto-distributes photos by chronological order', async () => {
    const { container } = render(<PhotoCuratorPage />);
    const fileInput = container.querySelector('input[type="file"]');
    const file1 = new File(['1'], 'photo1.jpg', { type: 'image/jpeg' });
    const file2 = new File(['2'], 'photo2.jpg', { type: 'image/jpeg' });
    const file3 = new File(['3'], 'photo3.jpg', { type: 'image/jpeg' });

    fireEvent.change(fileInput, { target: { files: [file1, file2, file3] } });

    await waitFor(() => {
      expect(screen.getByText('photo1.jpg')).toBeInTheDocument();
    });

    const autoBtn = screen.getByRole('button', { name: /按時間均分/ });
    fireEvent.click(autoBtn);

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining('已依時間軸自動均分'));
      expect(screen.getByText('已全部分配')).toBeInTheDocument();
    });
  });

  it('allows returning photo from post to unassigned pool and deleting from workbench', async () => {
    const { container } = render(<PhotoCuratorPage />);
    const fileInput = container.querySelector('input[type="file"]');
    const file1 = new File(['1'], 'item.jpg', { type: 'image/jpeg' });

    fireEvent.change(fileInput, { target: { files: [file1] } });

    await waitFor(() => {
      expect(screen.getByText('item.jpg')).toBeInTheDocument();
    });

    // Assign to Post 1
    const p1Button = screen.getByRole('button', { name: '+ P1' });
    fireEvent.click(p1Button);

    await waitFor(() => {
      expect(screen.getByLabelText(/移回待分配池 item.jpg/)).toBeInTheDocument();
    });

    // Return to pool
    const returnBtn = screen.getByLabelText(/移回待分配池 item.jpg/);
    fireEvent.click(returnBtn);

    await waitFor(() => {
      expect(screen.getByLabelText(/移除 item.jpg/)).toBeInTheDocument();
    });

    // Delete photo completely from workbench
    const deleteBtn = screen.getByLabelText(/移除 item.jpg/);
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(screen.queryByText('item.jpg')).not.toBeInTheDocument();
      expect(mockToast.info).toHaveBeenCalledWith('已自工作台移除該照片。');
    });
  });

  it('copies checklist text to clipboard', async () => {
    const { copyToClipboard } = await import('../utils/clipboard');
    const { container } = render(<PhotoCuratorPage />);
    const fileInput = container.querySelector('input[type="file"]');
    const file1 = new File(['content'], 'sample.jpg', { type: 'image/jpeg' });

    fireEvent.change(fileInput, { target: { files: [file1] } });

    await waitFor(() => {
      expect(screen.getByText('sample.jpg')).toBeInTheDocument();
    });

    const copyBtn = screen.getByRole('button', { name: /複製對照表/ });
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(copyToClipboard).toHaveBeenCalled();
      expect(mockToast.success).toHaveBeenCalledWith('已複製發布對照清單至剪貼簿！');
    });
  });

  it('reports clipboard rejection without an unhandled failure or a success message', async () => {
    copyToClipboard.mockRejectedValueOnce(new Error('permission denied'));
    const { container } = render(<PhotoCuratorPage />);
    fireEvent.change(container.querySelector('input[type="file"]'), {
      target: { files: [new File(['photo'], 'copy.jpg', { type: 'image/jpeg' })] },
    });
    mockToast.success.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /複製對照表/ }));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('複製失敗，請手動選取。'));
    expect(mockToast.success).not.toHaveBeenCalled();
  });

  it('keeps local files, titles and ordering when switching tools and releases them on logout', () => {
    const { container, unmount } = render(
      <MemoryRouter initialEntries={['/photo-curator']}>
        <PhotoCuratorSessionProvider>
          <Link to="/other">其他工具</Link>
          <Link to="/photo-curator">返回排版</Link>
          <Routes>
            <Route path="/photo-curator" element={<PhotoCuratorPage />} />
            <Route path="/other" element={<p>其他工具頁面</p>} />
          </Routes>
        </PhotoCuratorSessionProvider>
      </MemoryRouter>
    );
    importAndAssign(container, ['a.jpg', 'b.jpg']);
    fireEvent.change(screen.getByLabelText('Post 1 主題名稱'), { target: { value: '旅行' } });
    fireEvent.click(screen.getByRole('button', { name: '往前移 b.jpg' }));
    fireEvent.click(screen.getByRole('link', { name: '其他工具' }));
    expect(screen.queryByText('貼文三部曲排版工作台')).not.toBeInTheDocument();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    fireEvent.click(screen.getByRole('link', { name: '返回排版' }));
    expect(screen.getByLabelText('Post 1 主題名稱')).toHaveValue('旅行');
    expect(photoNames(container, 'post-1')).toEqual(['b.jpg', 'a.jpg']);
    fireEvent.click(screen.getByRole('button', { name: /復原上一步/ }));
    expect(photoNames(container, 'post-1')).toEqual(['a.jpg', 'b.jpg']);
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('mock://preview/a.jpg');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('mock://preview/b.jpg');
    const afterLogout = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(afterLogout);
    expect(afterLogout.defaultPrevented).toBe(false);
  });

  it('warns before losing work until all photos are exported, and warns again after edits', async () => {
    const { container } = render(<PhotoCuratorPage />);
    importAndAssign(container, ['saved.jpg']);
    const shouldWarn = () => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(shouldWarn()).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /下載分組照片/ }));
    await waitFor(() => expect(shouldWarn()).toBe(false));
    fireEvent.change(screen.getByLabelText('Post 1 主題名稱'), { target: { value: '新版主題' } });
    expect(shouldWarn()).toBe(true);
  });

  it('keeps the unload warning for edits made while a ZIP export is still running', async () => {
    let finishExport;
    exportCuratedZip.mockReturnValueOnce(
      new Promise((resolve) => {
        finishExport = resolve;
      })
    );
    const { container } = render(<PhotoCuratorPage />);
    importAndAssign(container, ['pending.jpg']);
    fireEvent.click(screen.getByRole('button', { name: /下載分組照片/ }));
    fireEvent.change(screen.getByLabelText('Post 1 主題名稱'), { target: { value: '匯出後的新主題' } });
    finishExport();
    await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining('已成功打包下載 ZIP')));
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
  });
  function importAndAssign(container, names) {
    fireEvent.change(container.querySelector('input[type="file"]'), {
      target: { files: names.map((name) => new File(['image'], name, { type: 'image/jpeg' })) },
    });
    names.forEach(() => fireEvent.click(screen.getAllByRole('button', { name: '+ P1' })[0]));
  }

  function photoNames(container, postId) {
    return Array.from(container.querySelectorAll(`[data-post-id="${postId}"] .photo-card-name`)).map(
      (node) => node.textContent
    );
  }

  function dragPhoto(container, name, targetName, edge = 'before', postId = 'post-1') {
    const source = screen.getByText(name).closest('.post-item-card');
    const target = targetName
      ? screen.getByText(targetName).closest('.post-item-card')
      : container.querySelector(`[data-post-id="${postId}"]`);
    const dataTransfer = { setData: vi.fn(), getData: () => source.dataset.photoId };
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({ top: 100, height: 100 });
    fireEvent.dragStart(source, { dataTransfer });
    const over = createEvent.dragOver(target, { dataTransfer });
    Object.defineProperty(over, 'clientY', { value: edge === 'before' ? 110 : 190 });
    fireEvent(target, over);
    if (targetName && name !== targetName) expect(target).toHaveClass(`drop-${edge}`);
    const drop = createEvent.drop(target, { dataTransfer });
    Object.defineProperty(drop, 'clientY', { value: edge === 'before' ? 110 : 190 });
    fireEvent(target, drop);
  }

  it('inserts in both directions, synchronizes cover/checklist, and restores the previous order', async () => {
    const { container } = render(<PhotoCuratorPage />);
    importAndAssign(container, ['a.jpg', 'b.jpg', 'c.jpg']);
    dragPhoto(container, 'c.jpg', 'a.jpg');
    expect(photoNames(container, 'post-1')).toEqual(['c.jpg', 'a.jpg', 'b.jpg']);
    expect(screen.getByText('c.jpg').closest('.post-item-card')).toHaveClass('is-cover-item');
    fireEvent.click(screen.getByRole('button', { name: /複製對照表/ }));
    const { copyToClipboard } = await import('../utils/clipboard');
    expect(copyToClipboard).toHaveBeenLastCalledWith(expect.stringContaining('01. c.jpg [★ 首圖 Cover]'));
    dragPhoto(container, 'c.jpg', 'b.jpg', 'after');
    expect(photoNames(container, 'post-1')).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
    fireEvent.click(screen.getByRole('button', { name: /復原上一步/ }));
    expect(photoNames(container, 'post-1')).toEqual(['c.jpg', 'a.jpg', 'b.jpg']);
    expect(container.querySelector('.drop-before, .drop-after, .is-dragging')).toBeNull();
  });

  it('moves between posts at a specific position without duplicates and ignores self/foreign drops', () => {
    const { container } = render(<PhotoCuratorPage />);
    importAndAssign(container, ['a.jpg', 'b.jpg', 'c.jpg']);
    dragPhoto(container, 'c.jpg', null, 'after', 'post-2');
    dragPhoto(container, 'b.jpg', 'c.jpg');
    expect(photoNames(container, 'post-1')).toEqual(['a.jpg']);
    expect(photoNames(container, 'post-2')).toEqual(['b.jpg', 'c.jpg']);
    dragPhoto(container, 'b.jpg', 'b.jpg');
    expect(photoNames(container, 'post-2')).toEqual(['b.jpg', 'c.jpg']);
    fireEvent.drop(container.querySelector('[data-post-id="post-1"]'), {
      dataTransfer: { getData: () => 'unknown-photo' },
    });
    expect(photoNames(container, 'post-1')).toEqual(['a.jpg']);
    fireEvent.change(screen.getByLabelText('移動 b.jpg 至貼文'), { target: { value: 'post-3' } });
    expect(photoNames(container, 'post-3')).toEqual(['b.jpg']);
    expect(container.querySelectorAll('.post-item-card')).toHaveLength(3);
  });

  it('protects existing groups before redistribution and permits undo without reverting renamed titles', () => {
    const { container } = render(<PhotoCuratorPage />);
    importAndAssign(container, ['a.jpg', 'b.jpg', 'c.jpg']);
    fireEvent.click(screen.getByRole('button', { name: /按時間均分/ }));
    expect(screen.getByText('重新按時間均分？')).toBeInTheDocument();
    expect(photoNames(container, 'post-1')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: '保留目前排版' }));
    expect(photoNames(container, 'post-1')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: /按時間均分/ }));
    fireEvent.click(screen.getByRole('button', { name: '重新均分' }));
    expect(photoNames(container, 'post-1')).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Post 1 主題名稱'), { target: { value: '新主題' } });
    fireEvent.click(screen.getByRole('button', { name: /復原上一步/ }));
    expect(photoNames(container, 'post-1')).toHaveLength(3);
    expect(screen.getByDisplayValue('新主題')).toBeInTheDocument();
  });
});
