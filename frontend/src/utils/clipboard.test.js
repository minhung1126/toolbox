import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copyToClipboard } from './clipboard';

describe('copyToClipboard', () => {
  const originalClipboard = navigator.clipboard;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      configurable: true,
      writable: true,
    });
  });

  it('uses navigator.clipboard.writeText when available', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
      writable: true,
    });

    await copyToClipboard('test text');
    expect(writeTextMock).toHaveBeenCalledWith('test text');
  });

  it('falls back to document.execCommand when navigator.clipboard is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    const execCommandMock = vi.fn().mockReturnValue(true);
    document.execCommand = execCommandMock;

    await copyToClipboard('fallback text');
    expect(execCommandMock).toHaveBeenCalledWith('copy');
  });

  it('throws an error if execCommand fails in fallback mode', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    document.execCommand = vi.fn().mockReturnValue(false);

    await expect(copyToClipboard('failed text')).rejects.toThrow('瀏覽器拒絕存取剪貼簿');
  });
});
