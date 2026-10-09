import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, MutableRefObject } from 'react';
import type { FieldSetters, ModelAction } from '../../../shared/model/useWorkflowModel';
import type { BatchWorkflowState } from './useBatchWorkflowState';
import type { BatchWorkflowOptions } from '../model/batchWorkflowTypes';
import { youtubeBatchApi } from '../api/youtubeBatchApi';
import { isBatchPreviewUpdate } from '../../../utils/batchPreview';
import { YOUTUBE_COPY, formatResultCounts } from '../../../utils/youtubeCopy';

interface WorkflowError extends Error {
  code?: string;
  status?: number;
}
function workflowError(value: unknown): WorkflowError {
  return value instanceof Error ? value : new Error(String(value));
}
interface Options {
  state: BatchWorkflowState;
  setters: FieldSetters<BatchWorkflowState>;
  dispatchWorkflow: Dispatch<ModelAction<BatchWorkflowState>>;
  playlistRequestRef: MutableRefObject<number>;
  currentPreviewFingerprint: string;
  videoType: BatchWorkflowOptions['videoType'];
  toast: BatchWorkflowOptions['toast'];
  selectedTeam: string;
  youtubeConnected: boolean;
  sourceStale: boolean;
  activeSlot: string;
  accountKey?: string;
  executionLockRef?: MutableRefObject<boolean>;
  sourceReadLockRef?: MutableRefObject<boolean>;
}
export function useBatchExecution({
  state,
  setters,
  dispatchWorkflow,
  playlistRequestRef,
  currentPreviewFingerprint,
  videoType,
  toast,
  selectedTeam,
  youtubeConnected,
  sourceStale,
  activeSlot,
  accountKey = '',
  executionLockRef,
  sourceReadLockRef,
}: Options) {
  const {
    appliedSpreadsheetId,
    playlistId,
    worksheetName,
    titleColumn,
    descriptionColumn,
    videos,
    assignments,
    previewToken,
    previewSnapshot,
    previewFingerprint,
    batchPreview,
    awaitingReconciliation,
    executing,
    loadingPreview,
    sourceReady,
  } = state;
  const {
    setErrorMsg,
    setYoutubeRoutingInfo,
    setPreviewFingerprint,
    setBatchPreview,
    setPreviewToken,
    setPreviewSnapshot,
    setLoadingPreview,
    setConfirmOpen,
    setResult,
    setExecuting,
    setQuotaEstimate,
    setEstimateLoading,
  } = setters;
  const latestFingerprint = useRef(currentPreviewFingerprint);
  latestFingerprint.current = currentPreviewFingerprint;
  const latestAccountKey = useRef(accountKey);
  latestAccountKey.current = accountKey;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loadBatchPreview = useCallback(async () => {
    if (previewInFlight.current) return null;
    previewInFlight.current = true;
    const requestVersion = playlistRequestRef.current;
    dispatchWorkflow({ type: 'transition', phase: 'previewing', patch: { loadingPreview: true } });
    setErrorMsg(null);
    try {
      const response = await youtubeBatchApi.getBatchPreview({
        spreadsheetUrlOrId: appliedSpreadsheetId,
        playlistId,
        videoType,
        worksheetName,
        titleColumn,
        descriptionColumn,
        team: selectedTeam,
        assignments: videos.map((video) => ({
          video_id: video.video_id,
          person: assignments[video.video_id] || '不編輯',
        })),
      });
      if (playlistRequestRef.current !== requestVersion || latestFingerprint.current !== currentPreviewFingerprint)
        return null;
      const plan = Array.isArray(response?.plan) ? response.plan : [];
      const token = response?.preview_token || '';
      const snapshot = response?.preview_snapshot || null;
      if (!token || !snapshot) throw new Error('伺服器未提供可驗證的預覽，請重新整理後再試。');
      dispatchWorkflow({
        type: 'transition',
        phase: 'ready',
        patch: { batchPreview: plan, previewToken: token, previewSnapshot: snapshot, awaitingReconciliation: false },
      });
      setYoutubeRoutingInfo({
        slot: snapshot?.youtube_slot || response.youtube_slot || '',
        reason: snapshot?.youtube_slot_reason || response.youtube_slot_reason || '',
      });
      setPreviewFingerprint(currentPreviewFingerprint);
      return { plan, snapshot };
    } catch (caughtError: unknown) {
      const error = workflowError(caughtError);
      if (playlistRequestRef.current !== requestVersion || latestFingerprint.current !== currentPreviewFingerprint)
        return null;
      setBatchPreview(null);
      setPreviewToken('');
      setPreviewSnapshot(null);
      setPreviewFingerprint('');
      dispatchWorkflow({ type: 'transition', phase: 'idle', patch: {} });
      setErrorMsg(`建立完整批次預覽失敗：${error.message}`);
      return null;
    } finally {
      previewInFlight.current = false;
      if (playlistRequestRef.current === requestVersion) setLoadingPreview(false);
    }
  }, [
    dispatchWorkflow,
    setBatchPreview,
    setErrorMsg,
    setLoadingPreview,
    setPreviewFingerprint,
    setPreviewSnapshot,
    setPreviewToken,
    setYoutubeRoutingInfo,
    appliedSpreadsheetId,
    assignments,
    currentPreviewFingerprint,
    descriptionColumn,
    playlistId,
    selectedTeam,
    titleColumn,
    videoType,
    videos,
    worksheetName,
  ]);

  const internalExecutionInFlight = useRef(false);
  const executionInFlight = executionLockRef || internalExecutionInFlight;
  const previewInFlight = useRef(false);
  const confirmationInFlight = useRef(false);
  const doExecute = async () => {
    if (
      executionInFlight.current ||
      awaitingReconciliation ||
      sourceReadLockRef?.current ||
      state.loadingSheet ||
      state.loadingVideos ||
      loadingPreview ||
      state.estimateLoading
    )
      return;
    if (!sourceReady || sourceStale) return toast.warning('請先刷新資料來源，讓目前來源設定套用完成');
    if (!youtubeConnected) {
      setConfirmOpen(false);
      toast.warning('請先連結 YouTube 頻道 Google 帳號！');
      return;
    }
    if (!previewToken || !previewSnapshot || previewFingerprint !== currentPreviewFingerprint) {
      setConfirmOpen(false);
      setErrorMsg('完整批次預覽已過期，已安全停止；請重新產生預覽後再執行。');
      return;
    }
    setConfirmOpen(false);
    executionInFlight.current = true;
    const executionVersion = playlistRequestRef.current;
    const executionAccountKey = accountKey;
    dispatchWorkflow({ type: 'transition', phase: 'executing', patch: { executing: true } });
    setErrorMsg(null);
    setResult(null);
    try {
      const res = await youtubeBatchApi.updateMetadata({
        spreadsheetUrlOrId: appliedSpreadsheetId,
        playlistId,
        videoType,
        worksheetName,
        titleColumn,
        descriptionColumn,
        team: selectedTeam,
        assignments: videos.map((video) => ({
          video_id: video.video_id,
          person: assignments[video.video_id] || '不編輯',
        })),
        youtubeSlot: previewSnapshot?.youtube_slot,
        previewToken,
        previewSnapshot,
      });
      if (!mounted.current || latestAccountKey.current !== executionAccountKey) return;
      dispatchWorkflow({ type: 'transition', phase: 'completed', patch: { result: res } });
      if (executionVersion === playlistRequestRef.current) {
        setBatchPreview(null);
        setPreviewToken('');
        setPreviewSnapshot(null);
        setPreviewFingerprint('');
      }
      const summary = formatResultCounts(res);
      if (res.quota_blocked || res.not_attempted_count)
        toast.warning(`YouTube ${YOUTUBE_COPY.batchUpdate}部分完成：${summary}`);
      else if (res.failed_count) toast.warning(`YouTube ${YOUTUBE_COPY.batchUpdate}完成但有失敗項目：${summary}`);
      else toast.success(`YouTube ${YOUTUBE_COPY.batchUpdate}完成：${summary}`);
    } catch (caughtError: unknown) {
      const err = workflowError(caughtError);
      if (!mounted.current || latestAccountKey.current !== executionAccountKey) return;
      if (err.code === 'stale_preview' || err.status === 409) {
        dispatchWorkflow({ type: 'transition', phase: 'idle', patch: {} });
        setResult(null);
        setBatchPreview(null);
        setPreviewToken('');
        setPreviewSnapshot(null);
        setPreviewFingerprint('');
        setErrorMsg('預覽已過期或資料已變更，已安全停止批次更新；請重新讀取影片並產生完整預覽。');
        toast.warning('預覽已過期，批次更新已安全停止');
        return;
      }
      if (
        err.code === 'batch_result_invalid' ||
        err.code === 'timeout' ||
        err.code === 'network_error' ||
        (err.status ?? 0) >= 500
      ) {
        setResult(null);
        setBatchPreview(null);
        setPreviewToken('');
        setPreviewSnapshot(null);
        setPreviewFingerprint('');
        dispatchWorkflow({ type: 'transition', phase: 'reconciliation', patch: { awaitingReconciliation: true } });
        setErrorMsg(
          '無法確認批次更新是否已完成；請先至 YouTube Studio 核對影片標題與描述，再重新讀取並預覽。勿直接重送。'
        );
        toast.warning('批次更新結果待核對，請先檢查 YouTube Studio');
        return;
      }
      dispatchWorkflow({ type: 'transition', phase: 'ready', patch: {} });
      setErrorMsg(`批次更新執行失敗：${err.message}`);
      toast.error('批次更新執行失敗');
    } finally {
      executionInFlight.current = false;
      if (mounted.current) setExecuting(false);
    }
  };

  const requestPreview = async () => {
    if (
      confirmationInFlight.current ||
      executionInFlight.current ||
      previewInFlight.current ||
      executing ||
      loadingPreview ||
      state.loadingSheet ||
      state.loadingVideos ||
      sourceReadLockRef?.current
    )
      return;
    if (!sourceReady || sourceStale) return toast.warning('請先刷新資料來源，讓目前來源設定套用完成');
    if (!worksheetName) return toast.warning('請先選擇工作表');
    if (!titleColumn || !descriptionColumn) return toast.warning('請先選擇標題與描述欄位');
    if (titleColumn === descriptionColumn) return toast.warning('標題與描述不能使用同一欄位');
    if (!selectedTeam) return toast.warning('請先選擇所屬團體');
    if (!videos.length) return toast.warning('請先讀取草稿影片');
    if (awaitingReconciliation) return toast.warning('請先核對 YouTube Studio，再重新讀取草稿影片');
    if (!sourceReady || sourceStale) return toast.warning('請先刷新資料來源，讓目前來源設定套用完成');
    confirmationInFlight.current = true;
    try {
      const requestVersion = playlistRequestRef.current;
      const fingerprint = currentPreviewFingerprint;
      const previewResult = await loadBatchPreview();
      if (!previewResult) return;
      const { plan, snapshot } = previewResult;
      const activeCount = plan.filter(isBatchPreviewUpdate).length;
      if (!activeCount) return toast.warning('完整預覽中沒有可更新的影片');
      setEstimateLoading(true);
      try {
        const estimate = await youtubeBatchApi.estimateQuota({
          operation: 'youtube.metadata_update',
          itemCount: activeCount,
          slot: snapshot?.youtube_slot || activeSlot,
        });
        if (requestVersion !== playlistRequestRef.current || fingerprint !== latestFingerprint.current) return;
        setQuotaEstimate(estimate);
      } catch (caughtError: unknown) {
        const error = workflowError(caughtError);
        if (requestVersion !== playlistRequestRef.current || fingerprint !== latestFingerprint.current) return;
        setQuotaEstimate(null);
        toast.warning(`無法取得配額預估，仍可直接執行：${error.message}`);
      } finally {
        if (requestVersion === playlistRequestRef.current) setEstimateLoading(false);
      }
    } finally {
      confirmationInFlight.current = false;
    }
  };

  const requestExecute = () => {
    if (
      executionInFlight.current ||
      previewInFlight.current ||
      executing ||
      loadingPreview ||
      state.estimateLoading ||
      state.loadingSheet ||
      state.loadingVideos ||
      sourceReadLockRef?.current
    )
      return;
    if (awaitingReconciliation) return toast.warning('請先核對 YouTube Studio，再重新讀取草稿影片');
    if (!batchPreview || !previewToken || !previewSnapshot || previewFingerprint !== currentPreviewFingerprint) {
      setErrorMsg('完整批次預覽已過期，請重新產生預覽並檢查變更內容。');
      return;
    }
    if (!batchPreview.some(isBatchPreviewUpdate)) return toast.warning('完整預覽中沒有可更新的影片');
    setConfirmOpen(true);
  };

  return { doExecute, requestPreview, requestExecute };
}
