export interface SpreadsheetWorksheetMetadata {
  title: string;
  columns: string[];
}

export interface SpreadsheetMetadata {
  spreadsheet_id: string;
  spreadsheet_title: string;
  worksheets: SpreadsheetWorksheetMetadata[];
}

export interface CopyableSheetColumn {
  key: string;
  label: string;
  index: number;
}

export interface CopyableSheetRow {
  row_number: number;
  cells: string[];
  team: string;
  person: string;
  person_option: string;
}

export interface CopyableSheetTable {
  spreadsheet_id: string;
  worksheet_name: string;
  columns: CopyableSheetColumn[];
  rows: CopyableSheetRow[];
}
