import type {
  PlaylistListResponse,
  PlaylistSortApplyRequest,
  PlaylistSortApplyResponse,
  PlaylistSortPreviewRequest,
  PlaylistSortPreviewResponse,
} from '../features/ytmusic/api/types';
import type { CopyableSheetTable, SpreadsheetMetadata } from '../features/sheets/api/types';

export const api: {
  getPlaylistSortPlaylists(params?: { language?: string; location?: string }): Promise<PlaylistListResponse>;
  previewPlaylistSort(request: PlaylistSortPreviewRequest): Promise<PlaylistSortPreviewResponse>;
  applyPlaylistSort(request: PlaylistSortApplyRequest): Promise<PlaylistSortApplyResponse>;
  getSpreadsheetMetadata(spreadsheetUrlOrId: string): Promise<SpreadsheetMetadata>;
  getCopyableSheetTable(spreadsheetUrlOrId: string, worksheetName: string): Promise<CopyableSheetTable>;
};
