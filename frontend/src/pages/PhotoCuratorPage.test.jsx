import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PhotoCuratorPage from './PhotoCuratorPage';
import { api } from '../services/api';

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
  copyToClipboard: vi.fn().mockResolvedValue(true),
}));

describe('PhotoCuratorPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.URL.createObjectURL = vi.fn((file) => `mock://preview/${file?.name || 'test'}`);
    global.URL.revokeObjectURL = vi.fn();
    api.getPhotoCuratorPresets.mockResolvedValue([
      {
        id: 'theme-perspective',
        name: '主題視角型',
        buckets: [
          { id: 'post-1', title: '空間大景 (Space & Vibe)', default_theme: '空間大景' },
          { id: 'post-2', title: '人物穿搭 (Portrait & Outfit)', default_theme: '人物穿搭' },
          { id: 'post-3', title: '細節美食 (Details & Taste)', default_theme: '細節美食' },
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

    expect(screen.getByText('貼文三部曲策展工作台')).toBeInTheDocument();
    expect(screen.getByText('Instagram 主頁三聯排效果預覽')).toBeInTheDocument();
    expect(screen.getByText('待分配防漏池')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByDisplayValue('空間大景 (Space & Vibe)')).toBeInTheDocument();
      expect(screen.getByDisplayValue('人物穿搭 (Portrait & Outfit)')).toBeInTheDocument();
      expect(screen.getByDisplayValue('細節美食 (Details & Taste)')).toBeInTheDocument();
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

  it('does not display 策展模型 dropdown and allows customizing column titles directly', async () => {
    render(<PhotoCuratorPage />);

    expect(screen.queryByText('策展模型：')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByDisplayValue('空間大景 (Space & Vibe)')).toBeInTheDocument();
    });

    const p1Input = screen.getByDisplayValue('空間大景 (Space & Vibe)');
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
      expect(screen.getByText('清空策展工作台')).toBeInTheDocument();
      expect(screen.getByText('確定要清空所有已匯入的照片與貼文分組嗎？此操作無法復原。')).toBeInTheDocument();
    });

    const confirmBtn = screen.getByRole('button', { name: '確認清空' });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(screen.queryByText('test_pic.jpg')).not.toBeInTheDocument();
      expect(mockToast.info).toHaveBeenCalledWith('策展工作台已重設。');
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
      expect(mockToast.info).toHaveBeenCalledWith('已自策展工作台移除該照片。');
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
});
