import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { playlistSortApi } from '../api/playlistSortApi';
import type {
  PlaylistSortApplyMode,
  PlaylistSortApplyRequest,
  PlaylistSortApplyResponse,
  PlaylistSortPreview,
  PlaylistSortQuotaEstimate,
  PlaylistSortKey,
  PlaylistSortTrack,
} from '../api/types';
import { buildPreviewFromSorted, sortTracksLocally } from '../../../utils/playlistSort';

interface WorkflowError extends Error {
  status?: number;
  code?: string;
  detail?: { code?: string; message?: string };
}

interface WorkflowToast {
  warning(message: string): void;
  success(message: string): void;
  error(message: string): void;
  info(message: string): void;
}

interface PlaylistSortWorkflowOptions {
  activeLanguage: string;
  activeLocation: string;
  activeSortKeys: PlaylistSortKey[];
  activeCollationLocale: string;
  applyMode: PlaylistSortApplyMode;
  cachedOriginalTracks: PlaylistSortTrack[] | null;
  newPlaylistTitle: string;
  previewData: PlaylistSortPreview | null;
  previewToken: string;
  quotaEstimate: PlaylistSortQuotaEstimate | null;
  refreshAuthUser?: () => Promise<unknown> | unknown;
  selectedPlaylistId: string;
  toast: WorkflowToast;
  setApplyResult: Dispatch<SetStateAction<PlaylistSortApplyResponse | null>>;
  setApplying: Dispatch<SetStateAction<boolean>>;
  setCachedOriginalTracks: Dispatch<SetStateAction<PlaylistSortTrack[] | null>>;
  setIsManuallyAdjusted: Dispatch<SetStateAction<boolean>>;
  setPreviewData: Dispatch<SetStateAction<PlaylistSortPreview | null>>;
  setPreviewToken: Dispatch<SetStateAction<string>>;
  setPreviewing: Dispatch<SetStateAction<boolean>>;
  setQuotaEstimate: Dispatch<SetStateAction<PlaylistSortQuotaEstimate | null>>;
  setQuotaExceededRecovery: Dispatch<SetStateAction<{ message: string } | null>>;
  setShowConfirm: Dispatch<SetStateAction<boolean>>;
  setShowTokenDrawer: Dispatch<SetStateAction<boolean>>;
  setStrictFallbackPrompt: Dispatch<SetStateAction<{ message: string; quotaUnits: number } | null>>;
}

function normalizeWorkflowError(value: unknown): WorkflowError {
  if (value instanceof Error) return value as WorkflowError;
  return new Error(String(value || '未知錯誤')) as WorkflowError;
}

function isQuotaError(error: WorkflowError): boolean {
  return error?.status === 429 || error?.code === 'quota_unavailable' || error?.code === 'YOUTUBE_QUOTA_UNAVAILABLE';
}

export function usePlaylistSortWorkflow({
  activeLanguage,
  activeLocation,
  activeSortKeys,
  applyMode,
  cachedOriginalTracks,
  newPlaylistTitle,
  previewData,
  previewToken,
  quotaEstimate,
  refreshAuthUser,
  selectedPlaylistId,
  toast,
  activeCollationLocale,
  setApplyResult,
  setApplying,
  setCachedOriginalTracks,
  setIsManuallyAdjusted,
  setPreviewData,
  setPreviewToken,
  setPreviewing,
  setQuotaEstimate,
  setQuotaExceededRecovery,
  setShowConfirm,
  setShowTokenDrawer,
  setStrictFallbackPrompt,
}: PlaylistSortWorkflowOptions) {
  const previewRequestId = useRef(0);
  const previewInFlight = useRef(false);
  const applyInFlight = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      previewRequestId.current += 1;
      previewInFlight.current = false;
    };
  }, []);

  useEffect(() => {
    previewRequestId.current += 1;
    previewInFlight.current = false;
    setPreviewing(false);
  }, [activeLanguage, activeLocation, activeSortKeys, selectedPlaylistId, setPreviewing]);

  const handlePreview = useCallback(async () => {
    if (previewInFlight.current) return;
    if (!selectedPlaylistId) {
      toast.warning('請先選擇播放清單');
      return;
    }
    if (activeSortKeys.length === 0) {
      toast.warning('請至少指定一個排序欄位');
      return;
    }

    previewInFlight.current = true;
    const requestId = ++previewRequestId.current;
    setPreviewing(true);
    setPreviewData(null);
    setApplyResult(null);
    try {
      const response = await playlistSortApi.preview({
        playlistId: selectedPlaylistId,
        sortKeys: activeSortKeys,
        language: activeLanguage,
        location: activeLocation,
      });
      if (!mounted.current || requestId !== previewRequestId.current) return;

      setPreviewData(response.preview || null);
      setPreviewToken(response.preview_token || '');
      setQuotaEstimate(response.quota_estimate || null);
      setIsManuallyAdjusted(false);

      if (response.preview?.items) {
        const originalTracks = [...response.preview.items].sort(
          (left, right) => (left.original_position ?? 0) - (right.original_position ?? 0)
        );
        setCachedOriginalTracks(originalTracks);
      }

      const moved = response.preview?.moved_count ?? 0;
      const total = response.preview?.total ?? 0;
      toast.success(
        moved === 0
          ? `清單已是正確順序，無需排序（共 ${total} 首）`
          : `預覽完成：${moved} 首需移動 / 共 ${total} 首（已啟用即時動態模擬）`
      );
    } catch (caughtError: unknown) {
      if (!mounted.current || requestId !== previewRequestId.current) return;
      const error = normalizeWorkflowError(caughtError);
      if (isQuotaError(error)) {
        setQuotaExceededRecovery({
          message: error.message || 'Google YouTube Data API 配額已達每日上限。',
        });
      }
      toast.error(`預覽失敗：${error.message || '未知錯誤'}`);
    } finally {
      if (requestId === previewRequestId.current) {
        previewInFlight.current = false;
        if (mounted.current) setPreviewing(false);
      }
    }
  }, [
    activeLanguage,
    activeLocation,
    activeSortKeys,
    selectedPlaylistId,
    setApplyResult,
    setCachedOriginalTracks,
    setIsManuallyAdjusted,
    setPreviewData,
    setPreviewToken,
    setPreviewing,
    setQuotaEstimate,
    setQuotaExceededRecovery,
    toast,
  ]);

  const handleTokenSaved = useCallback(async () => {
    await refreshAuthUser?.();
    setShowTokenDrawer(false);
    if (selectedPlaylistId) handlePreview();
  }, [handlePreview, refreshAuthUser, selectedPlaylistId, setShowTokenDrawer]);

  const handleTokenCleared = useCallback(async () => {
    await refreshAuthUser?.();
    if (selectedPlaylistId) handlePreview();
  }, [handlePreview, refreshAuthUser, selectedPlaylistId]);

  const handleReorderTracks = useCallback(
    (sourceIndex: number, targetIndex: number) => {
      if (!previewData?.items || !cachedOriginalTracks) return;
      const reorderedItems = [...previewData.items];
      const [draggedItem] = reorderedItems.splice(sourceIndex, 1);
      reorderedItems.splice(targetIndex, 0, draggedItem);
      setPreviewData(buildPreviewFromSorted(cachedOriginalTracks, reorderedItems));
      setIsManuallyAdjusted(true);
    },
    [cachedOriginalTracks, previewData, setIsManuallyAdjusted, setPreviewData]
  );

  const handleResetToRuleOrder = useCallback(() => {
    if (!cachedOriginalTracks) return;
    const orderedTracks = sortTracksLocally(cachedOriginalTracks, activeSortKeys, activeCollationLocale);
    setPreviewData(buildPreviewFromSorted(cachedOriginalTracks, orderedTracks));
    setIsManuallyAdjusted(false);
    toast.info('已重設為目前規則排序');
  }, [activeCollationLocale, activeSortKeys, cachedOriginalTracks, setIsManuallyAdjusted, setPreviewData, toast]);

  const handleApplyClick = useCallback(() => {
    if (!previewData || (applyMode === 'in_place' && previewData.moved_count === 0)) {
      toast.info('清單順序無需變更');
      return;
    }
    setShowConfirm(true);
  }, [applyMode, previewData, setShowConfirm, toast]);

  const handleApplyConfirm = useCallback(
    async (options: { forceAllowQuotaFallback?: boolean } = {}) => {
      if (applyInFlight.current) return;
      applyInFlight.current = true;
      const { forceAllowQuotaFallback = false } = options;
      setShowConfirm(false);
      setApplying(true);
      try {
        const payload: PlaylistSortApplyRequest = {
          playlistId: selectedPlaylistId,
          sortKeys: activeSortKeys,
          previewToken,
          language: activeLanguage,
          location: activeLocation,
        };
        if (forceAllowQuotaFallback) payload.allowQuotaFallback = true;
        if (applyMode === 'new_playlist') {
          payload.mode = 'new_playlist';
          payload.newPlaylistTitle = newPlaylistTitle;
        }
        if (previewData?.items?.length) {
          payload.sortedItemIds = previewData.items.map((item) => item.playlist_item_id);
        }

        const response = await playlistSortApi.apply(payload);
        if (!mounted.current) return;
        setApplyResult(response);
        const succeeded = response.succeeded ?? 0;
        const failed = response.failed ?? 0;
        if (failed > 0) {
          toast.warning(`排序完成：成功 ${succeeded} / 失敗 ${failed}`);
        } else if (response.mode === 'new_playlist') {
          toast.success(`全新已排序清單「${newPlaylistTitle}」已成功建立！`);
        } else {
          toast.success(`排序成功套用！已移動 ${succeeded} 首歌曲`);
        }
        setPreviewData(null);
        setPreviewToken('');
        setQuotaEstimate(null);
        setCachedOriginalTracks(null);
        setIsManuallyAdjusted(false);
      } catch (caughtError: unknown) {
        if (!mounted.current) return;
        const error = normalizeWorkflowError(caughtError);
        const errorCode = error.code || error.detail?.code;
        if (errorCode === 'TOKEN_FALLBACK_BLOCKED' || error.status === 401) {
          setStrictFallbackPrompt({
            message: error.message || error.detail?.message || 'YouTube Music Token 認證失效或已過期。',
            quotaUnits: quotaEstimate?.total_units || (previewData?.moved_count || 0) * 50,
          });
          return;
        }
        if (isQuotaError(error)) {
          setQuotaExceededRecovery({
            message: error.message || 'Google YouTube Data API 配額已達每日上限。',
          });
        }
        toast.error(`套用排序失敗：${error.message || '未知錯誤'}`);
      } finally {
        applyInFlight.current = false;
        if (mounted.current) setApplying(false);
      }
    },
    [
      activeLanguage,
      activeLocation,
      activeSortKeys,
      applyMode,
      newPlaylistTitle,
      previewData,
      previewToken,
      quotaEstimate,
      selectedPlaylistId,
      setApplyResult,
      setApplying,
      setCachedOriginalTracks,
      setIsManuallyAdjusted,
      setPreviewData,
      setPreviewToken,
      setQuotaEstimate,
      setQuotaExceededRecovery,
      setShowConfirm,
      setStrictFallbackPrompt,
      toast,
    ]
  );

  return {
    handleApplyClick,
    handleApplyConfirm,
    handlePreview,
    handleReorderTracks,
    handleResetToRuleOrder,
    handleTokenCleared,
    handleTokenSaved,
  };
}
