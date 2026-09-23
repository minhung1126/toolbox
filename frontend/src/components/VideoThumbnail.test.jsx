import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import VideoThumbnail from './VideoThumbnail';

describe('VideoThumbnail', () => {
  it('renders image with referrerPolicy="no-referrer"', () => {
    render(<VideoThumbnail src="https://example.com/thumb.jpg" alt="測試影片" />);
    const img = screen.getByAltText('測試影片');
    expect(img).toHaveAttribute('src', 'https://example.com/thumb.jpg');
    expect(img).toHaveAttribute('referrerPolicy', 'no-referrer');
  });

  it('upgrades http to https to prevent mixed content', () => {
    render(<VideoThumbnail src="http://i.ytimg.com/vi/test/hqdefault.jpg" alt="HTTP影片" />);
    const img = screen.getByAltText('HTTP影片');
    expect(img).toHaveAttribute('src', 'https://i.ytimg.com/vi/test/hqdefault.jpg');
  });

  it('falls back to hqdefault and then mqdefault on image error if videoId is provided', () => {
    render(<VideoThumbnail src="https://example.com/broken.jpg" videoId="vid-123" alt="出錯影片" />);
    const img = screen.getByAltText('出錯影片');
    expect(img).toHaveAttribute('src', 'https://example.com/broken.jpg');

    // First error -> falls back to hqdefault
    fireEvent.error(img);
    expect(img).toHaveAttribute('src', 'https://i.ytimg.com/vi/vid-123/hqdefault.jpg');

    // Second error -> falls back to mqdefault
    fireEvent.error(img);
    expect(img).toHaveAttribute('src', 'https://i.ytimg.com/vi/vid-123/mqdefault.jpg');

    // Third error -> falls back to empty placeholder
    fireEvent.error(img);
    expect(screen.getByText('無縮圖')).toBeInTheDocument();
  });

  it('renders empty placeholder if neither src nor videoId is provided', () => {
    render(<VideoThumbnail src="" videoId="" />);
    expect(screen.getByText('無縮圖')).toBeInTheDocument();
  });

  it('renders button wrapper when onPreview is provided', () => {
    const onPreview = vi.fn();
    render(<VideoThumbnail src="https://example.com/thumb.jpg" alt="可點擊影片" onPreview={onPreview} />);
    const btn = screen.getByRole('button', { name: '放大檢視可點擊影片縮圖' });
    fireEvent.click(btn);
    expect(onPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        src: 'https://example.com/thumb.jpg',
        alt: '可點擊影片',
      })
    );
  });
});
