import type { BatchWorkflowOptions, BatchConfig } from '../model/batchWorkflowTypes';
import { useBatchConfigPersistence } from './useBatchConfigPersistence';
import { useBatchExecution } from './useBatchExecution';
import type { ChangeEvent, KeyboardEvent, MouseEvent } from 'react';

interface WorkflowError extends Error {
  code?: string;
  status?: number;
}
function workflowError(value: unknown): WorkflowError {
  return value instanceof Error ? value : new Error(String(value));
}
import { useBatchWorkflowState } from './useBatchWorkflowState';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { youtubeBatchApi } from '../api/youtubeBatchApi.ts';
import useAccountWorkState from '../../../hooks/useAccountWorkState';
import useTeamPersonFilter from '../../../hooks/useTeamPersonFilter';
import useSharedTeamPersonFilterPersistence from '../../../hooks/useSharedTeamPersonFilterPersistence';
import { readSharedTeamPersonFilter } from '../../../utils/teamPersonFilterStorage';
import { sortVideosByUploadTime } from '../../../utils/videoOrder';
import { getYoutubeAuthorizationFingerprint, youtubeIsConnected, youtubePreferredUiSlot } from '../model/routing';
import { YOUTUBE_COPY } from '../../../utils/youtubeCopy';
import {
  DEFAULT_COLUMNS,
  getBatchPreviewStatus,
  normalizeConfig,
  resolveDraftConfig,
} from '../../../utils/batchPreview';

export function useBatchUpdateWorkflow({ sysSettings, authUser, videoType, toast }: BatchWorkflowOptions) {
  const activeSlot = youtubePreferredUiSlot(authUser?.youtube);
  const youtubeConnected = youtubeIsConnected(authUser?.youtube);
  const authorizationKey = useMemo(() => {
    return getYoutubeAuthorizationFingerprint(authUser?.youtube, activeSlot);
  }, [activeSlot, authUser?.youtube]);
  const defaults = DEFAULT_COLUMNS[videoType];
  const draftStateKey = videoType === 'Shorts' ? 'youtube_draft_shorts' : 'youtube_draft_video';
  const { value: rememberedState, error: workStateError, save: saveWorkState } = useAccountWorkState(draftStateKey, {});
  const remembered = useMemo(
    () => (rememberedState && typeof rememberedState === 'object' ? rememberedState : {}),
    [rememberedState]
  );
  const sharedFilter = useMemo(
    () => readSharedTeamPersonFilter(sysSettings.shared_team_person_filter),
    [sysSettings.shared_team_person_filter]
  );
  const persistedDefaults = useMemo(
    () => ({
      default_spreadsheet_id: sysSettings.default_spreadsheet_id,
      default_playlist_id: sysSettings.default_playlist_id,
    }),
    [sysSettings.default_playlist_id, sysSettings.default_spreadsheet_id]
  );
  const initial = normalizeConfig({}, defaults, persistedDefaults, sharedFilter);
  const { state, setters, dispatch: dispatchWorkflow } = useBatchWorkflowState(initial, remembered);
  const {
    spreadsheetId,
    appliedSpreadsheetId,
    sourceReady,
    sourceRevision,
    playlistId,
    worksheets,
    worksheetName,
    columns,
    titleColumn,
    descriptionColumn,
    configSaving,
    randomPreview,
    randomPreviewLoading,
    loadingPreview,
    previewError,
    batchPreview,
    previewToken,
    previewSnapshot,
    previewFingerprint,
    videos,
    assignments,
    selectedVideoIds,
    bulkPerson,
    playlistSource,
    playlistFallbackReason,
    youtubeRoutingInfo,
    loadingSheet,
    loadingVideos,
    executing,
    result,
    errorMsg,
    configSaveError,
    sourceError,
    confirmOpen,
    previewImage,
    quotaEstimate,
    estimateLoading,
    hydrated,
    draftAutosaveStatus,
    playlistAutosaveStatus,
    awaitingReconciliation,
  } = state;
  const {
    setSpreadsheetId,
    setAppliedSpreadsheetId,
    setSourceReady,
    setSourceRevision,
    setPlaylistId,
    setWorksheets,
    setWorksheetName,
    setColumns,
    setTitleColumn,
    setDescriptionColumn,
    setRandomPreview,
    setRandomPreviewLoading,
    setPreviewError,
    setBatchPreview,
    setPreviewToken,
    setPreviewSnapshot,
    setPreviewFingerprint,
    setVideos,
    setAssignments,
    setSelectedVideoIds,
    setBulkPerson,
    setPlaylistSource,
    setPlaylistFallbackReason,
    setYoutubeRoutingInfo,
    setLoadingSheet,
    setLoadingVideos,
    setResult,
    setErrorMsg,
    setConfigSaveError,
    setSourceError,
    setConfirmOpen,
    setPreviewImage,
    setQuotaEstimate,
    setEstimateLoading,
    setHydrated,
    setAwaitingReconciliation,
  } = setters;
  const sharedPlaylistIdRef = useRef(persistedDefaults.default_playlist_id || '');
  const initialLoadRequestedRef = useRef(false);
  const restoreVideoOptionsRef = useRef(true);
  const hydrationStartedRef = useRef('');
  const playlistRequestRef = useRef(0);
  const sheetRequestRef = useRef(0);
  const randomPreviewRequestRef = useRef(0);
  const previousAuthorizationKeyRef = useRef(authorizationKey);
  const writeInFlightRef = useRef(false);
  const sourceReadInFlightRef = useRef(false);
  const latestWorkflowState = useRef(state);
  latestWorkflowState.current = state;

  const sourceStale = spreadsheetId.trim() !== appliedSpreadsheetId.trim();
  const teamPersonFilter = useTeamPersonFilter({
    source: appliedSpreadsheetId,
    worksheetName,
    enabled: Boolean(authUser && hydrated && sourceReady),
    initialTeam: initial.selectedTeam,
    initialSelectedPeople: initial.selectedPeople,
    defaultTeam: 'first',
    refreshKey: sourceRevision,
  });
  const {
    teams,
    selectedTeam,
    setSelectedTeam,
    people: teamPeople,
    selectedPeople,
    setSelectedPeople,
    loadingTeams,
    loadingPeople,
    ready: teamPersonReady,
    error: teamPeopleError,
    resetSelection,
  } = teamPersonFilter;
  const visibleSelectedTeam = sourceStale ? '' : selectedTeam;
  const filterPersistenceReady = hydrated && sourceReady && (!worksheetName || (teamPersonReady && !loadingPeople));
  const currentPreviewFingerprint = useMemo(
    () =>
      JSON.stringify({
        spreadsheetId: appliedSpreadsheetId,
        playlistId,
        playlistSource,
        authorizationKey,
        videoType,
        worksheetName,
        titleColumn,
        descriptionColumn,
        team: selectedTeam,
        videos: videos.map((video) => ({
          video_id: video.video_id,
          title: video.title || '',
          description: video.description || '',
        })),
        assignments,
      }),
    [
      appliedSpreadsheetId,
      assignments,
      authorizationKey,
      descriptionColumn,
      playlistId,
      playlistSource,
      selectedTeam,
      titleColumn,
      videoType,
      videos,
      worksheetName,
    ]
  );

  useSharedTeamPersonFilterPersistence({
    team: selectedTeam,
    selectedPeople,
    ready: filterPersistenceReady,
    onError: setConfigSaveError,
  });

  const invalidateLoadedVideos = useCallback(() => {
    playlistRequestRef.current += 1;
    sourceReadInFlightRef.current = false;
    setLoadingVideos(false);
    setVideos([]);
    setPlaylistSource('');
    setPlaylistFallbackReason('');
    setYoutubeRoutingInfo(null);
    dispatchWorkflow({
      type: 'patch',
      patch: {
        batchPreview: null,
        loadingPreview: false,
        previewToken: '',
        previewSnapshot: null,
        previewFingerprint: '',
        confirmOpen: false,
      },
    });
    setEstimateLoading(false);
    setResult(null);
    setErrorMsg(null);
    setSelectedVideoIds([]);
    setAssignments({});
    setBulkPerson('');
    setQuotaEstimate(null);
    restoreVideoOptionsRef.current = false;
  }, []);

  const { clearConfigSaveError, scheduleDraftSave, schedulePlaylistSave, saveDraftConfig } = useBatchConfigPersistence({
    state,
    setters,
    authUser,
    videoType,
    toast,
  });
  useEffect(
    () => () => {
      playlistRequestRef.current += 1;
      sheetRequestRef.current += 1;
      randomPreviewRequestRef.current += 1;
    },
    []
  );

  const applyConfig = useCallback(
    (config: BatchConfig) => {
      setSpreadsheetId(config.spreadsheetId);
      setAppliedSpreadsheetId(config.spreadsheetId);
      setSourceReady(false);
      setPlaylistId(config.playlistId);
      setWorksheetName(config.worksheetName);
      setTitleColumn(config.titleColumn);
      setDescriptionColumn(config.descriptionColumn);
      resetSelection({ team: config.selectedTeam, selectedPeople: config.selectedPeople });
    },
    [resetSelection]
  );

  useEffect(() => {
    const accountKey = authUser?.sub || authUser?.email || '';
    const hydrationKey = `${accountKey}:${videoType}`;
    if (hydrationStartedRef.current === hydrationKey) return undefined;
    hydrationStartedRef.current = hydrationKey;
    let cancelled = false;
    let settled = false;
    const fallbackConfig = normalizeConfig({}, defaults, persistedDefaults, sharedFilter);
    playlistRequestRef.current += 1;
    sheetRequestRef.current += 1;
    randomPreviewRequestRef.current += 1;
    dispatchWorkflow({
      type: 'transition',
      phase: 'loading',
      patch: {
        hydrated: false,
        configSaving: false,
        draftAutosaveStatus: null,
        playlistAutosaveStatus: null,
        executing: false,
        loadingSheet: false,
        loadingVideos: false,
        loadingPreview: false,
        estimateLoading: false,
        awaitingReconciliation: false,
        result: null,
        errorMsg: null,
        confirmOpen: false,
      },
    });
    setWorksheets([]);
    setColumns([]);
    setSourceReady(false);
    setSourceError('');
    setRandomPreview(null);
    setPreviewError('');
    setBatchPreview(null);
    setPreviewToken('');
    setPreviewSnapshot(null);
    setPreviewFingerprint('');
    setVideos([]);
    setAssignments(remembered.assignments && typeof remembered.assignments === 'object' ? remembered.assignments : {});
    setSelectedVideoIds(Array.isArray(remembered.selectedVideoIds) ? remembered.selectedVideoIds : []);
    setBulkPerson(remembered.bulkPerson || '');
    initialLoadRequestedRef.current = false;
    restoreVideoOptionsRef.current = true;
    applyConfig(fallbackConfig);

    if (!accountKey) {
      settled = true;
      setHydrated(true);
      return () => {
        cancelled = true;
      };
    }

    youtubeBatchApi
      .getDraftSettings()
      .then((data) => {
        if (cancelled) return;
        const serverConfig = data?.[videoType === 'Shorts' ? 'shorts' : 'video'];
        applyConfig(
          normalizeConfig(resolveDraftConfig(serverConfig, fallbackConfig), defaults, persistedDefaults, sharedFilter)
        );
      })
      .catch((err) => {
        if (!cancelled) setConfigSaveError(`讀取 YouTube 草稿設定失敗：${err.message}`);
      })
      .finally(() => {
        settled = true;
        if (!cancelled) setHydrated(true);
      });

    return () => {
      cancelled = true;
      if (!settled && hydrationStartedRef.current === hydrationKey) hydrationStartedRef.current = '';
    };
  }, [
    applyConfig,
    authUser?.email,
    authUser?.sub,
    defaults,
    persistedDefaults,
    sharedFilter,
    videoType,
    remembered.assignments,
    remembered.bulkPerson,
    remembered.selectedVideoIds,
  ]);

  useEffect(() => {
    const sharedPlaylistId = persistedDefaults.default_playlist_id || '';
    if (sharedPlaylistId === sharedPlaylistIdRef.current) return;
    sharedPlaylistIdRef.current = sharedPlaylistId;
    if (sharedPlaylistId !== playlistId) {
      setPlaylistId(sharedPlaylistId);
      invalidateLoadedVideos();
    }
  }, [invalidateLoadedVideos, persistedDefaults.default_playlist_id, playlistId]);

  useEffect(() => {
    if (!hydrated) return undefined;
    const cache = {
      assignments,
      selectedVideoIds,
      bulkPerson,
    };
    saveWorkState(cache, {});
    return undefined;
  }, [assignments, bulkPerson, hydrated, saveWorkState, selectedVideoIds]);

  useEffect(() => {
    const selectedWorksheet = worksheets.find((sheet) => sheet.title === worksheetName);
    const nextColumns = selectedWorksheet?.columns || [];
    setColumns(nextColumns);
    if (nextColumns.length && !nextColumns.includes(titleColumn)) {
      setTitleColumn(nextColumns.includes(defaults.title) ? defaults.title : nextColumns[0]);
    }
    if (nextColumns.length && !nextColumns.includes(descriptionColumn)) {
      setDescriptionColumn(nextColumns.includes(defaults.description) ? defaults.description : nextColumns[0]);
    }
  }, [worksheets, worksheetName, titleColumn, descriptionColumn, defaults.title, defaults.description]);

  const availablePeople = useMemo(
    () => (sourceStale ? [] : teamPeople.filter((person) => selectedPeople.includes(person))),
    [sourceStale, teamPeople, selectedPeople]
  );

  useEffect(() => {
    if (
      !sourceStale &&
      !loadingPeople &&
      teamPersonReady &&
      bulkPerson &&
      bulkPerson !== '不編輯' &&
      !availablePeople.includes(bulkPerson)
    )
      setBulkPerson('');
  }, [availablePeople, bulkPerson, loadingPeople, sourceStale, teamPersonReady]);

  useEffect(() => {
    if (sourceStale || loadingPeople || !teamPersonReady || !videos.length) return;
    setAssignments((current) =>
      Object.fromEntries(
        Object.entries(current).map(([videoId, person]) => [
          videoId,
          person === '不編輯' || availablePeople.includes(person) ? person : '不編輯',
        ])
      )
    );
  }, [availablePeople, loadingPeople, sourceStale, teamPersonReady, videos.length]);

  const loadRandomPreview = useCallback(async () => {
    if (
      !appliedSpreadsheetId ||
      !sourceReady ||
      sourceStale ||
      !worksheetName ||
      !selectedTeam ||
      !titleColumn ||
      !descriptionColumn
    ) {
      setRandomPreview(null);
      setPreviewError('請先選擇工作表、團體、標題欄位與描述欄位');
      setRandomPreviewLoading(false);
      return;
    }
    const requestId = randomPreviewRequestRef.current + 1;
    randomPreviewRequestRef.current = requestId;
    setRandomPreviewLoading(true);
    setPreviewError('');
    try {
      const preview = await youtubeBatchApi.getRandomMemberPreview(appliedSpreadsheetId, worksheetName, selectedTeam, [
        titleColumn,
        descriptionColumn,
      ]);
      if (requestId !== randomPreviewRequestRef.current) return;
      setRandomPreview(preview);
    } catch (caughtError: unknown) {
      const err = workflowError(caughtError);
      if (requestId !== randomPreviewRequestRef.current) return;
      setRandomPreview(null);
      setPreviewError(err.message);
    } finally {
      if (requestId === randomPreviewRequestRef.current) setRandomPreviewLoading(false);
    }
  }, [appliedSpreadsheetId, sourceReady, sourceStale, worksheetName, selectedTeam, titleColumn, descriptionColumn]);

  useEffect(() => {
    if (
      !hydrated ||
      !authUser ||
      !appliedSpreadsheetId ||
      !sourceReady ||
      sourceStale ||
      !worksheetName ||
      !selectedTeam ||
      !titleColumn ||
      !descriptionColumn
    ) {
      randomPreviewRequestRef.current += 1;
      setRandomPreview(null);
      setPreviewError('');
      setRandomPreviewLoading(false);
      return;
    }
    loadRandomPreview();
  }, [
    hydrated,
    authUser,
    appliedSpreadsheetId,
    sourceReady,
    sourceStale,
    worksheetName,
    selectedTeam,
    titleColumn,
    descriptionColumn,
    loadRandomPreview,
  ]);

  const loadSheetResources = useCallback(
    async ({ showToast = false } = {}) => {
      const latest = latestWorkflowState.current;
      if (
        writeInFlightRef.current ||
        sourceReadInFlightRef.current ||
        latest.executing ||
        latest.loadingVideos ||
        latest.loadingPreview ||
        latest.estimateLoading
      )
        return;
      const nextSource = spreadsheetId.trim();
      if (!nextSource) {
        if (showToast) toast.warning('請先填寫主要試算表 ID / URL');
        return;
      }
      const requestId = sheetRequestRef.current + 1;
      sheetRequestRef.current = requestId;
      sourceReadInFlightRef.current = true;
      const sourceChanged = nextSource !== appliedSpreadsheetId.trim();
      setLoadingSheet(true);
      setErrorMsg(null);
      setSourceError('');
      try {
        const metadata = await youtubeBatchApi.getSpreadsheetMetadata(nextSource);
        if (requestId !== sheetRequestRef.current) return;
        const sheetList = metadata.worksheets || [];
        setWorksheets(sheetList);
        const nextWorksheet = sheetList.some((sheet) => sheet.title === worksheetName)
          ? worksheetName
          : sheetList.some((sheet) => sheet.title === defaults.worksheet)
            ? defaults.worksheet
            : sheetList[0]?.title || '';
        const worksheetChanged = nextWorksheet !== worksheetName;
        if (sourceChanged || worksheetChanged) {
          setRandomPreview(null);
          setPreviewError('');
          invalidateLoadedVideos();
          if (worksheetChanged) clearConfigSaveError();
        }
        setAppliedSpreadsheetId(nextSource);
        setWorksheetName(nextWorksheet);
        setSourceReady(true);
        setSourceRevision((current) => current + 1);
        if (showToast) toast.success('工作表與欄位已刷新');
      } catch (caughtError: unknown) {
        const err = workflowError(caughtError);
        if (requestId !== sheetRequestRef.current) return;
        invalidateLoadedVideos();
        setSourceError(`刷新試算表失敗：${err.message}`);
      } finally {
        if (requestId === sheetRequestRef.current) {
          sourceReadInFlightRef.current = false;
          setLoadingSheet(false);
        }
      }
    },
    [
      appliedSpreadsheetId,
      defaults.worksheet,
      invalidateLoadedVideos,
      clearConfigSaveError,
      spreadsheetId,
      toast,
      worksheetName,
    ]
  );

  useEffect(() => {
    if (hydrated && authUser && appliedSpreadsheetId && !initialLoadRequestedRef.current) {
      initialLoadRequestedRef.current = true;
      loadSheetResources();
    }
  }, [hydrated, authUser, appliedSpreadsheetId, loadSheetResources]);

  const handleSpreadsheetChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (writeInFlightRef.current || executing) return;
    const nextValue = event.target.value;
    sheetRequestRef.current += 1;
    setSpreadsheetId(nextValue);
    setLoadingSheet(false);
    clearConfigSaveError();
    if (nextValue.trim() !== appliedSpreadsheetId.trim()) invalidateLoadedVideos();
    setSourceError('');
    scheduleDraftSave({ spreadsheetId: nextValue });
  };

  const handleWorksheetChange = (nextWorksheet: string) => {
    if (writeInFlightRef.current || executing) return;
    sheetRequestRef.current += 1;
    setWorksheetName(nextWorksheet);
    clearConfigSaveError();
    setSelectedTeam('');
    setSelectedPeople([]);
    setRandomPreview(null);
    setPreviewError('');
    invalidateLoadedVideos();
    scheduleDraftSave({ worksheetName: nextWorksheet });
  };

  const handlePlaylistChange = (nextPlaylist: string) => {
    if (writeInFlightRef.current || executing) return;
    setPlaylistId(nextPlaylist);
    clearConfigSaveError();
    invalidateLoadedVideos();
    schedulePlaylistSave(nextPlaylist);
  };

  useEffect(() => {
    if (previousAuthorizationKeyRef.current === authorizationKey) return;
    previousAuthorizationKeyRef.current = authorizationKey;
    invalidateLoadedVideos();
  }, [authorizationKey, invalidateLoadedVideos]);

  useEffect(() => {
    if (!batchPreview || !previewFingerprint || previewFingerprint === currentPreviewFingerprint) return;
    setBatchPreview(null);
    setPreviewToken('');
    setPreviewSnapshot(null);
    setPreviewFingerprint('');
    setConfirmOpen(false);
  }, [batchPreview, currentPreviewFingerprint, previewFingerprint]);

  const handleLoadVideos = async () => {
    if (
      writeInFlightRef.current ||
      sourceReadInFlightRef.current ||
      executing ||
      loadingSheet ||
      loadingVideos ||
      loadingPreview ||
      estimateLoading
    )
      return;
    if (!hydrated || !sourceReady || sourceStale) return toast.warning('請先刷新資料來源，讓目前來源設定套用完成');
    if (!youtubeConnected) {
      toast.warning('請先在「YouTube 設定」連結 YouTube 頻道 Google 帳號！');
      return;
    }
    const shouldRestore = restoreVideoOptionsRef.current;
    const rememberedAssignments = shouldRestore && assignments && typeof assignments === 'object' ? assignments : {};
    const rememberedSelectedVideoIds = shouldRestore ? selectedVideoIds : [];
    invalidateLoadedVideos();
    const requestId = playlistRequestRef.current;
    sourceReadInFlightRef.current = true;
    setLoadingVideos(true);
    setErrorMsg(null);
    setResult(null);
    try {
      const res = await youtubeBatchApi.getPlaylistVideos(playlistId);
      if (playlistRequestRef.current !== requestId) return;
      const videoList = sortVideosByUploadTime(res.videos || []);
      const nextAssignments = Object.fromEntries(
        videoList.map((video) => [
          video.video_id,
          shouldRestore ? rememberedAssignments[video.video_id] || '不編輯' : '不編輯',
        ])
      );
      const videoIds = new Set(videoList.map((video) => video.video_id));
      setAwaitingReconciliation(false);
      setVideos(videoList);
      setAssignments(nextAssignments);
      setSelectedVideoIds(shouldRestore ? rememberedSelectedVideoIds.filter((videoId) => videoIds.has(videoId)) : []);
      if (!shouldRestore) setBulkPerson('');
      restoreVideoOptionsRef.current = false;
      setPlaylistSource(res.source || '');
      setPlaylistFallbackReason(res.fallback_reason || '');
      setYoutubeRoutingInfo({
        slot: res.youtube_slot || '',
        reason: res.youtube_slot_reason || '',
      });
    } catch (caughtError: unknown) {
      const err = workflowError(caughtError);
      if (playlistRequestRef.current !== requestId) return;
      invalidateLoadedVideos();
      setErrorMsg(`載入草稿影片失敗：${err.message}`);
    } finally {
      if (playlistRequestRef.current === requestId) {
        sourceReadInFlightRef.current = false;
        setLoadingVideos(false);
      }
    }
  };

  const toggleVideoSelection = (videoId: string) =>
    setSelectedVideoIds((current) =>
      current.includes(videoId) ? current.filter((item) => item !== videoId) : [...current, videoId]
    );
  const handleVideoCardClick = (event: MouseEvent<HTMLElement>, videoId: string) => {
    if ((event.target as HTMLElement)?.closest?.('button, input, select, textarea, a, label')) return;
    toggleVideoSelection(videoId);
  };
  const handleVideoCardKeyDown = (event: KeyboardEvent<HTMLElement>, videoId: string) => {
    if (event.target !== event.currentTarget || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    toggleVideoSelection(videoId);
  };
  const setAllVideosSelected = (checked: boolean) =>
    setSelectedVideoIds(checked ? videos.map((video) => video.video_id) : []);

  const applyBulkAssignment = () => {
    if (!selectedVideoIds.length) return toast.warning('請先勾選要批次編輯的影片');
    if (!bulkPerson) return toast.warning('請先選擇要套用的人物');
    const selectedCount = selectedVideoIds.length;
    setAssignments((current) => {
      const next = { ...current };
      selectedVideoIds.forEach((videoId) => {
        next[videoId] = bulkPerson;
      });
      return next;
    });
    setSelectedVideoIds([]);
    setBulkPerson('');
    toast.success(`已套用到 ${selectedCount} 支影片，尚未送出`);
  };

  const { doExecute, requestPreview, requestExecute } = useBatchExecution({
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
    accountKey: authUser?.sub || authUser?.email || '',
    executionLockRef: writeInFlightRef,
    sourceReadLockRef: sourceReadInFlightRef,
  });

  const sourceLabel = playlistSource === 'youtube-api' ? 'YouTube API' : '';
  const previewCounts = useMemo(() => {
    const counts: Record<string, number> = { willUpdate: 0, unchanged: 0, skipped: 0, failed: 0 };
    (batchPreview || []).forEach((item) => {
      counts[getBatchPreviewStatus(item).key] += 1;
    });
    return counts;
  }, [batchPreview]);

  return {
    youtubeConnected,
    workStateError,
    spreadsheetId,
    sourceReady,
    playlistId,
    worksheets,
    worksheetName,
    columns,
    titleColumn,
    setTitleColumn,
    descriptionColumn,
    setDescriptionColumn,
    configSaving,
    randomPreview,
    randomPreviewLoading,
    loadingPreview,
    previewError,
    batchPreview,
    videos,
    assignments,
    setAssignments,
    selectedVideoIds,
    bulkPerson,
    setBulkPerson,
    playlistFallbackReason,
    youtubeRoutingInfo,
    loadingSheet,
    loadingVideos,
    executing: executing || writeInFlightRef.current,
    result,
    errorMsg,
    configSaveError,
    sourceError,
    confirmOpen,
    setConfirmOpen,
    previewImage,
    setPreviewImage,
    quotaEstimate,
    estimateLoading,
    hydrated,
    draftAutosaveStatus,
    playlistAutosaveStatus,
    sourceStale,
    teams,
    selectedTeam,
    setSelectedTeam,
    teamPeople,
    selectedPeople,
    setSelectedPeople,
    loadingTeams,
    loadingPeople,
    teamPeopleError,
    visibleSelectedTeam,
    clearConfigSaveError,
    scheduleDraftSave,
    saveDraftConfig,
    availablePeople,
    loadRandomPreview,
    loadSheetResources,
    handleSpreadsheetChange,
    handleWorksheetChange,
    handlePlaylistChange,
    handleLoadVideos,
    toggleVideoSelection,
    handleVideoCardClick,
    handleVideoCardKeyDown,
    setAllVideosSelected,
    applyBulkAssignment,
    doExecute,
    requestPreview,
    requestExecute,
    sourceLabel,
    previewCounts,
  };
}
