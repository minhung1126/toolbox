import { api } from '../../../services/api';
import type { CopyableSheetColumn, CopyableSheetRow, CopyableSheetTable, SpreadsheetMetadata } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseSpreadsheetMetadata(value: unknown): SpreadsheetMetadata {
  if (!isRecord(value) || !Array.isArray(value.worksheets)) {
    throw new Error('試算表 metadata 回應格式不正確。');
  }

  const worksheets = value.worksheets.map((worksheet) => {
    if (
      !isRecord(worksheet) ||
      typeof worksheet.title !== 'string' ||
      !Array.isArray(worksheet.columns) ||
      !worksheet.columns.every((column) => typeof column === 'string')
    ) {
      throw new Error('試算表工作表欄位回應格式不正確。');
    }

    return { title: worksheet.title, columns: worksheet.columns };
  });

  if (typeof value.spreadsheet_id !== 'string' || typeof value.spreadsheet_title !== 'string') {
    throw new Error('試算表識別資料回應格式不正確。');
  }

  return {
    spreadsheet_id: value.spreadsheet_id,
    spreadsheet_title: value.spreadsheet_title,
    worksheets,
  };
}

function parseCopyableSheetTable(value: unknown): CopyableSheetTable {
  if (!isRecord(value) || !Array.isArray(value.columns) || !Array.isArray(value.rows)) {
    throw new Error('工作表內容回應格式不正確。');
  }

  const columns = value.columns.map((column) => {
    if (
      !isRecord(column) ||
      typeof column.key !== 'string' ||
      typeof column.label !== 'string' ||
      !Number.isInteger(column.index) ||
      Number(column.index) < 0
    ) {
      throw new Error('工作表欄位回應格式不正確。');
    }

    return { key: column.key, label: column.label, index: Number(column.index) };
  });

  const rows = value.rows.map((row) => {
    if (
      !isRecord(row) ||
      !Number.isInteger(row.row_number) ||
      !Array.isArray(row.cells) ||
      !row.cells.every((cell) => typeof cell === 'string') ||
      typeof row.team !== 'string' ||
      typeof row.person !== 'string' ||
      typeof row.person_option !== 'string'
    ) {
      throw new Error('工作表資料列回應格式不正確。');
    }

    return {
      row_number: Number(row.row_number),
      cells: row.cells,
      team: row.team,
      person: row.person,
      person_option: row.person_option,
    };
  });

  if (typeof value.spreadsheet_id !== 'string' || typeof value.worksheet_name !== 'string') {
    throw new Error('工作表來源識別回應格式不正確。');
  }

  return {
    spreadsheet_id: value.spreadsheet_id,
    worksheet_name: value.worksheet_name,
    columns,
    rows,
  };
}

export const sheetsCopyApi = {
  async getSpreadsheetMetadata(spreadsheetUrlOrId: string): Promise<SpreadsheetMetadata> {
    const response: unknown = await api.getSpreadsheetMetadata(spreadsheetUrlOrId);
    return parseSpreadsheetMetadata(response);
  },

  async getCopyableSheetTable(spreadsheetUrlOrId: string, worksheetName: string): Promise<CopyableSheetTable> {
    const response: unknown = await api.getCopyableSheetTable(spreadsheetUrlOrId, worksheetName);
    return parseCopyableSheetTable(response);
  },
};
