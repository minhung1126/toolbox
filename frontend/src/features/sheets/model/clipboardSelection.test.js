import { describe, it, expect } from 'vitest';
import { buildClipboardSelection } from './clipboardSelection';
describe('selected Sheet clipboard output', () => {
  it('preserves Chinese, multiline text, empty cells and sheet order in TSV', () => {
    const rows = [
      { row_number: 2, cells: ['中文\n第二行', ''] },
      { row_number: 3, cells: ['later', '"quoted"'] },
    ];
    const columns = [
      { key: 'a', index: 0, label: 'A' },
      { key: 'b', index: 1, label: 'B' },
    ];
    const selected = new Set(['3:b', '2:b', '2:a']);
    expect(buildClipboardSelection(rows, columns, selected)).toEqual({
      rowCount: 2,
      columns: ['A', 'B'],
      text: '"中文\n第二行"\t\n\t"""quoted"""',
    });
    expect(buildClipboardSelection(rows.slice(0, 1), columns, selected, 'plain').text).toBe('中文\n第二行\n');
  });
});
