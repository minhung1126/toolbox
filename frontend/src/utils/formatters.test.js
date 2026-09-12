import { describe, expect, it } from 'vitest';
import { formatBytes, formatTokenDate, tokenStatusLabel } from './formatters';

describe('formatters', () => {
  describe('formatBytes', () => {
    it('handles zero or falsy values', () => {
      expect(formatBytes(0)).toBe('—');
      expect(formatBytes(null)).toBe('—');
      expect(formatBytes('')).toBe('—');
    });

    it('formats bytes, KB, MB, and GB', () => {
      expect(formatBytes(500)).toBe('500 B');
      expect(formatBytes(1024)).toBe('1.0 KB');
      expect(formatBytes(1536)).toBe('1.5 KB');
      expect(formatBytes(1048576)).toBe('1.0 MB');
      expect(formatBytes(1073741824)).toBe('1.0 GB');
    });
  });

  describe('formatTokenDate', () => {
    it('handles falsy or invalid dates', () => {
      expect(formatTokenDate('')).toBe('—');
      expect(formatTokenDate(null)).toBe('—');
      expect(formatTokenDate('invalid-date')).toBe('—');
    });

    it('formats valid date string', () => {
      const formatted = formatTokenDate('2026-09-12T12:00:00Z');
      expect(formatted).not.toBe('—');
      expect(typeof formatted).toBe('string');
    });
  });

  describe('tokenStatusLabel', () => {
    it('returns expected status labels', () => {
      expect(tokenStatusLabel('active')).toBe('正常（會自動更新）');
      expect(tokenStatusLabel('refresh_failed')).toBe('暫時更新失敗');
      expect(tokenStatusLabel('reauthorization_required')).toBe('需要重新授權');
      expect(tokenStatusLabel('not_connected')).toBe('尚未連結');
      expect(tokenStatusLabel('unknown')).toBe('未取得狀態');
    });
  });
});
