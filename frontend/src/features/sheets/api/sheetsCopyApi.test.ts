import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../services/api';
import { sheetsCopyApi } from './sheetsCopyApi';

vi.mock('../../../services/api', () => ({
  api: {
    getSpreadsheetMetadata: vi.fn(),
    getCopyableSheetTable: vi.fn(),
  },
}));

describe('sheetsCopyApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns typed spreadsheet metadata from the shared HTTP client', async () => {
    const metadata = {
      spreadsheet_id: 'sheet-123',
      spreadsheet_title: '工作簿',
      worksheets: [{ title: '工作表1', columns: ['標題', '說明'] }],
    };
    api.getSpreadsheetMetadata.mockResolvedValue(metadata);

    await expect(sheetsCopyApi.getSpreadsheetMetadata('sheet-123')).resolves.toEqual(metadata);
    expect(api.getSpreadsheetMetadata).toHaveBeenCalledWith('sheet-123');
  });

  it('rejects malformed spreadsheet metadata instead of hiding the contract error', async () => {
    api.getSpreadsheetMetadata.mockResolvedValue({ worksheets: [{ title: '工作表1' }] });

    await expect(sheetsCopyApi.getSpreadsheetMetadata('sheet-123')).rejects.toThrow('試算表工作表欄位回應格式不正確。');
  });

  it('returns validated copyable rows and columns', async () => {
    const table = {
      spreadsheet_id: 'sheet-123',
      worksheet_name: '工作表1',
      columns: [{ key: 'column_0', label: '標題', index: 0 }],
      rows: [{ row_number: 2, cells: ['影片'], team: '', person: '', person_option: '' }],
    };
    api.getCopyableSheetTable.mockResolvedValue(table);

    await expect(sheetsCopyApi.getCopyableSheetTable('sheet-123', '工作表1')).resolves.toEqual(table);
    expect(api.getCopyableSheetTable).toHaveBeenCalledWith('sheet-123', '工作表1');
  });

  it('rejects malformed copyable rows before they reach page state', async () => {
    api.getCopyableSheetTable.mockResolvedValue({
      spreadsheet_id: 'sheet-123',
      worksheet_name: '工作表1',
      columns: [],
      rows: [{ row_number: '2', cells: [] }],
    });

    await expect(sheetsCopyApi.getCopyableSheetTable('sheet-123', '工作表1')).rejects.toThrow(
      '工作表資料列回應格式不正確。'
    );
  });
});
