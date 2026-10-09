import { describe, expect, it, vi } from 'vitest';
import { downloadResults, resultsCsv } from './resultExport';

describe('result exports', () => {
  it('preserves statuses, Unicode, line breaks and neutralizes spreadsheet formulas', () => {
    const csv = resultsCsv([
      { id: 'v1', title: '繁中,"標題"\n下一行', status: 'not_attempted', reason: '\t=HYPERLINK("bad")' },
      { id: 'v2', title: '+formula', status: 'failed', reason: '配額不足' },
    ]);
    expect(csv).toContain('繁中,""標題""\n下一行');
    expect(csv).toContain("'\t=HYPERLINK");
    expect(csv).toContain("'+formula");
    expect(csv).toContain('not_attempted');
    expect(csv).toContain('配額不足');
  });
  it('downloads JSON and releases its object URL', () => {
    vi.useFakeTimers();
    const create = vi.fn().mockReturnValue('blob:test');
    const revoke = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    downloadResults('results', [{ id: '1', title: '測試', status: 'succeeded', reason: '' }], 'json');
    expect(create.mock.calls[0][0].type).toBe('application/json');
    expect(click).toHaveBeenCalledOnce();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith('blob:test');
    vi.useRealTimers();
    click.mockRestore();
    vi.unstubAllGlobals();
  });
});
