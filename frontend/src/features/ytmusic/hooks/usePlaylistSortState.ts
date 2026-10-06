import type { WorkflowPhase } from '../../../shared/model/useWorkflowModel';
import { useWorkflowModel } from '../../../shared/model/useWorkflowModel';
import type {
  PlaylistSummary,
  PlaylistSortApplyResponse,
  PlaylistSortPreview,
  PlaylistSortQuotaEstimate,
  PlaylistSortTrack,
} from '../api/types';
export function usePlaylistSortState() {
  return useWorkflowModel(() => ({
    phase: 'idle' as WorkflowPhase,
    showTokenDrawer: false,
    strictFallbackPrompt: null as { message: string; quotaUnits: number } | null,
    quotaExceededRecovery: null as { message: string } | null,
    playlists: [] as PlaylistSummary[],
    selectedPlaylistId: '',
    loadingPlaylists: true,
    playlistFilterQuery: '',
    previewData: null as PlaylistSortPreview | null,
    previewToken: '',
    previewing: false,
    quotaEstimate: null as PlaylistSortQuotaEstimate | null,
    cachedOriginalTracks: null as PlaylistSortTrack[] | null,
    isManuallyAdjusted: false,
    draggedRuleIdx: null as number | null,
    dragOverRuleIdx: null as number | null,
    newPlaylistTitle: '',
    showConfirm: false,
    applying: false,
    applyResult: null as PlaylistSortApplyResponse | null,
    reconciliationMessage: '',
  }));
}

export type PlaylistSortState = ReturnType<typeof usePlaylistSortState>['state'];
