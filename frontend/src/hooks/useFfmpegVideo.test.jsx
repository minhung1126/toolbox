import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isVideoFile, useFfmpegVideo } from './useFfmpegVideo';

const toast = { error: vi.fn(), success: vi.fn() };

function renderVideoHook(overrides = {}) {
  const props = {
    toast,
    onFileSelected: vi.fn(),
    onMetadataLoaded: vi.fn(),
    setIsDragging: vi.fn(),
    enableStartCut: true,
    enableEndCut: true,
    cutMode: 'to',
    startTime: '00:00:01.000',
    endTime: '00:00:02.000',
    durationCut: '00:00:01.000',
    ...overrides,
  };
  return { ...renderHook(() => useFfmpegVideo(props)), props };
}

describe('useFfmpegVideo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:video') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('recognizes browser video MIME types and supported filename extensions', () => {
    expect(isVideoFile(new File(['video'], 'clip', { type: 'video/mp4' }))).toBe(true);
    expect(isVideoFile(new File(['video'], 'clip.mkv', { type: '' }))).toBe(true);
    expect(isVideoFile(new File(['text'], 'notes.txt', { type: 'text/plain' }))).toBe(false);
    expect(isVideoFile(null)).toBe(false);
  });

  it('rejects non-video files without creating an object URL', () => {
    const { result } = renderVideoHook();
    const file = new File(['text'], 'notes.txt', { type: 'text/plain' });

    act(() => result.current.handleSelectFile(file));

    expect(toast.error).toHaveBeenCalledOnce();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('selects a video, updates page metadata, and releases its object URL on unmount', () => {
    const { result, props, unmount } = renderVideoHook();
    const file = new File(['video'], 'clip.mp4', { type: 'video/mp4' });

    act(() => result.current.handleSelectFile(file));

    expect(result.current.videoFile).toBe(file);
    expect(result.current.videoUrl).toBe('blob:video');
    expect(props.onFileSelected).toHaveBeenCalledWith(file);
    expect(toast.success).toHaveBeenCalledWith('已載入影片：clip.mp4');

    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:video');
  });

  it('reports media metadata and stops trimmed playback at the selected endpoint', () => {
    const { result, props } = renderVideoHook();
    const pause = vi.fn();
    const play = vi.fn();
    result.current.videoRef.current = {
      duration: 8,
      videoWidth: 1920,
      videoHeight: 1080,
      currentTime: 0,
      pause,
      play,
    };

    act(() => result.current.handleLoadedMetadata());
    expect(result.current.videoMeta).toMatchObject({ width: 1920, height: 1080 });
    expect(props.onMetadataLoaded).toHaveBeenCalledWith(8);

    act(() => result.current.playTrimmedSegment());
    expect(play).toHaveBeenCalledOnce();
    result.current.videoRef.current.currentTime = 2;
    act(() => result.current.handleTimeUpdate());

    expect(pause).toHaveBeenCalledOnce();
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.isPlayingTrimmed).toBe(false);
    expect(result.current.currentTime).toBe(2);
  });
});
