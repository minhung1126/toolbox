import type { SpreadsheetWorksheetMetadata } from '../../sheets/api/types';
import type { WorkflowPhase } from '../../../shared/model/useWorkflowModel';
import { useWorkflowModel } from '../../../shared/model/useWorkflowModel';
import type {
  RandomMemberPreviewResponse,
  YoutubeBatchPreviewItem,
  YoutubeBatchPreviewSnapshot,
  YoutubeBatchUpdateResponse,
} from '../api/youtubeBatchTypes';
import type { PublishCleanupVideo } from '../api/publishCleanupTypes';

type RecordValue = Record<string, unknown>;
interface InitialConfig {
  spreadsheetId: string;
  playlistId: string;
  worksheetName: string;
  titleColumn: string;
  descriptionColumn: string;
}
interface Remembered {
  assignments?: Record<string, string>;
  selectedVideoIds?: string[];
  bulkPerson?: string;
}
export function useBatchWorkflowState(initial: InitialConfig, remembered: Remembered) {
  return useWorkflowModel(() => ({
    phase: 'idle' as WorkflowPhase,
    spreadsheetId: initial.spreadsheetId,
    appliedSpreadsheetId: initial.spreadsheetId,
    sourceReady: false,
    sourceRevision: 0,
    playlistId: initial.playlistId,
    worksheets: [] as SpreadsheetWorksheetMetadata[],
    worksheetName: initial.worksheetName,
    columns: [] as string[],
    titleColumn: initial.titleColumn,
    descriptionColumn: initial.descriptionColumn,
    configSaving: false,
    randomPreview: null as RandomMemberPreviewResponse | null,
    randomPreviewLoading: false,
    loadingPreview: false,
    previewError: '',
    batchPreview: null as YoutubeBatchPreviewItem[] | null,
    previewToken: '',
    previewSnapshot: null as YoutubeBatchPreviewSnapshot | null,
    previewFingerprint: '',
    videos: [] as PublishCleanupVideo[],
    assignments: remembered.assignments && typeof remembered.assignments === 'object' ? remembered.assignments : {},
    selectedVideoIds: Array.isArray(remembered.selectedVideoIds) ? remembered.selectedVideoIds : [],
    bulkPerson: remembered.bulkPerson || '',
    playlistSource: '',
    playlistFallbackReason: '',
    youtubeRoutingInfo: null as { slot: string; reason: string } | null,
    loadingSheet: false,
    loadingVideos: false,
    executing: false,
    result: null as YoutubeBatchUpdateResponse | null,
    errorMsg: null as string | null,
    configSaveError: '',
    sourceError: '',
    confirmOpen: false,
    previewImage: null as string | null,
    quotaEstimate: null as RecordValue | null,
    estimateLoading: false,
    hydrated: false,
    draftAutosaveStatus: null as string | null,
    playlistAutosaveStatus: null as string | null,
    awaitingReconciliation: false,
  }));
}

export type BatchWorkflowState = ReturnType<typeof useBatchWorkflowState>['state'];
