import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { normalizeYoutubePlaylistInput, youtubeBatchApi } from '../api/youtubeBatchApi';
import useAccountWorkState from '../../../hooks/useAccountWorkState';
import useTeamPersonFilter from '../../../hooks/useTeamPersonFilter';
import useSharedTeamPersonFilterPersistence from '../../../hooks/useSharedTeamPersonFilterPersistence';
import { readSharedTeamPersonFilter } from '../../../utils/teamPersonFilterStorage';
import { sortVideosByUploadTime } from '../../../utils/videoOrder';
import {
  getYoutubeAuthorizationFingerprint,
  youtubeIsConnected,
  youtubePreferredUiSlot,
} from '../../../utils/youtubeRouting';
import { YOUTUBE_COPY, formatResultCounts } from '../../../utils/youtubeCopy';
import {
  DEFAULT_COLUMNS,
  getBatchPreviewStatus,
  isBatchPreviewUpdate,
  normalizeConfig,
  resolveDraftConfig,
} from '../../../utils/batchPreview';

export function useBatchUpdateWorkflow({ sysSettings, authUser, videoType, toast }) {
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
  const [spreadsheetId, setSpreadsheetId] = useState(initial.spreadsheetId);
  const [appliedSpreadsheetId, setAppliedSpreadsheetId] = useState(initial.spreadsheetId);
  const [sourceReady, setSourceReady] = useState(false);
  const [sourceRevision, setSourceRevision] = useState(0);
  const [playlistId, setPlaylistId] = useState(initial.playlistId);
  const sharedPlaylistIdRef = useRef(persistedDefaults.default_playlist_id || '');
  const [worksheets, setWorksheets] = useState([]);
  const [worksheetName, setWorksheetName] = useState(initial.worksheetName);
  const [columns, setColumns] = useState([]);
  const [titleColumn, setTitleColumn] = useState(initial.titleColumn);
  const [descriptionColumn, setDescriptionColumn] = useState(initial.descriptionColumn);
  const [configSaving, setConfigSaving] = useState(false);
  const [randomPreview, setRandomPreview] = useState(null);
  const [randomPreviewLoading, setRandomPreviewLoading] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [batchPreview, setBatchPreview] = useState(null);
  const [previewToken, setPreviewToken] = useState('');
  const [previewSnapshot, setPreviewSnapshot] = useState(null);
  const [previewFingerprint, setPreviewFingerprint] = useState('');
  const [videos, setVideos] = useState([]);
  const [assignments, setAssignments] = useState(() =>
    remembered.assignments && typeof remembered.assignments === 'object' ? remembered.assignments : {}
  );
  const [selectedVideoIds, setSelectedVideoIds] = useState(() =>
    Array.isArray(remembered.selectedVideoIds) ? remembered.selectedVideoIds : []
  );
  const [bulkPerson, setBulkPerson] = useState(remembered.bulkPerson || '');
  const [playlistSource, setPlaylistSource] = useState('');
  const [playlistFallbackReason, setPlaylistFallbackReason] = useState('');
  const [youtubeRoutingInfo, setYoutubeRoutingInfo] = useState(null);
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [configSaveError, setConfigSaveError] = useState('');
  const [sourceError, setSourceError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [quotaEstimate, setQuotaEstimate] = useState(null);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const initialLoadRequestedRef = useRef(false);
  const restoreVideoOptionsRef = useRef(true);
  const hydrationStartedRef = useRef('');
  const playlistRequestRef = useRef(0);
  const sheetRequestRef = useRef(0);
  const randomPreviewRequestRef = useRef(0);
  const previousAuthorizationKeyRef = useRef(authorizationKey);
  const draftSaveTimerRef = useRef(null);
  const playlistSaveTimerRef = useRef(null);
  const [draftAutosaveStatus, setDraftAutosaveStatus] = useState(null);
  const [playlistAutosaveStatus, setPlaylistAutosaveStatus] = useState(null);

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
    setVideos([]);
    setPlaylistSource('');
    setPlaylistFallbackReason('');
    setYoutubeRoutingInfo(null);
    setBatchPreview(null);
    setLoadingPreview(false);
    setPreviewToken('');
    setPreviewSnapshot(null);
    setPreviewFingerprint('');
    setConfirmOpen(false);
    setEstimateLoading(false);
    setResult(null);
    setErrorMsg(null);
    setSelectedVideoIds([]);
    setAssignments({});
    setBulkPerson('');
    setQuotaEstimate(null);
    restoreVideoOptionsRef.current = false;
  }, []);

  const clearConfigSaveError = useCallback(() => {
    setConfigSaveError('');
  }, []);

  const scheduleDraftSave = useCallback(
    (overrides = {}) => {
      if (!authUser) return;
      setDraftAutosaveStatus('saving');
      window.clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = window.setTimeout(async () => {
        try {
          const nextSpreadsheetId = overrides.spreadsheetId !== undefined ? overrides.spreadsheetId : spreadsheetId;
          const nextWorksheetName = overrides.worksheetName !== undefined ? overrides.worksheetName : worksheetName;
          const nextTitleColumn = overrides.titleColumn !== undefined ? overrides.titleColumn : titleColumn;
          const nextDescriptionColumn =
            overrides.descriptionColumn !== undefined ? overrides.descriptionColumn : descriptionColumn;
          const nextPlaylistId = overrides.playlistId !== undefined ? overrides.playlistId : playlistId;

          await youtubeBatchApi.updateDraftSettings(videoType, {
            spreadsheet_id: nextSpreadsheetId.trim(),
            worksheet_name: nextWorksheetName,
            title_column: nextTitleColumn,
            description_column: nextDescriptionColumn,
            playlist_id: nextPlaylistId.trim(),
          });
          setDraftAutosaveStatus('saved');
        } catch (error) {
          setDraftAutosaveStatus('error');
          setConfigSaveError(`草稿設定未能自動儲存：${error.message}`);
        }
      }, 800);
    },
    [authUser, descriptionColumn, playlistId, spreadsheetId, titleColumn, videoType, worksheetName]
  );

  const schedulePlaylistSave = useCallback(
    (value) => {
      if (!authUser) return;
      setPlaylistAutosaveStatus('saving');
      window.clearTimeout(playlistSaveTimerRef.current);
      playlistSaveTimerRef.current = window.setTimeout(async () => {
        try {
          const normalized = normalizeYoutubePlaylistInput(value);
          if (value.trim() && !normalized) {
            setPlaylistAutosaveStatus('invalid');
            return;
          }
          await youtubeBatchApi.updatePlaylist({ playlistId: normalized || '' });
          setPlaylistAutosaveStatus('saved');
          scheduleDraftSave({ playlistId: value });
        } catch {
          setPlaylistAutosaveStatus('error');
        }
      }, 800);
    },
    [authUser, scheduleDraftSave]
  );

  const saveDraftConfig = useCallback(async () => {
    if (!authUser) return;
    window.clearTimeout(draftSaveTimerRef.current);
    setConfigSaving(true);
    setDraftAutosaveStatus('saving');
    setConfigSaveError('');
    try {
      await youtubeBatchApi.updateDraftSettings(videoType, {
        spreadsheet_id: spreadsheetId.trim(),
        worksheet_name: worksheetName,
        title_column: titleColumn,
        description_column: descriptionColumn,
        playlist_id: playlistId.trim(),
      });
      setDraftAutosaveStatus('saved');
      toast.success('YouTube 草稿設定已儲存');
    } catch (error) {
      setDraftAutosaveStatus('error');
      setConfigSaveError(`設定未能同步至伺服器：${error.message}`);
    } finally {
      setConfigSaving(false);
    }
  }, [authUser, descriptionColumn, playlistId, spreadsheetId, titleColumn, toast, videoType, worksheetName]);

  useEffect(
    () => () => {
      window.clearTimeout(draftSaveTimerRef.current);
      window.clearTimeout(playlistSaveTimerRef.current);
    },
    []
  );

  const applyConfig = useCallback(
    (config) => {
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
    const fallbackConfig = normalizeConfig({}, defaults, persistedDefaults, sharedFilter);
    setHydrated(false);
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
      setHydrated(true);
      return () => {
        cancelled = true;
      };
    }

    youtubeBatchApi
      .getDraftSettings()
      .then((data) => {
        if (cancelled) return;
        const serverConfig = data?.[videoType.toLowerCase()];
        applyConfig(
          normalizeConfig(resolveDraftConfig(serverConfig, fallbackConfig), defaults, persistedDefaults, sharedFilter)
        );
      })
      .catch((err) => setConfigSaveError(`讀取 YouTube 草稿設定失敗：${err.message}`))
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });

    return () => {
      cancelled = true;
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
    saveWorkState(cache);
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
    } catch (err) {
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
      const nextSource = spreadsheetId.trim();
      if (!nextSource) {
        if (showToast) toast.warning('請先填寫主要試算表 ID / URL');
        return;
      }
      const requestId = sheetRequestRef.current + 1;
      sheetRequestRef.current = requestId;
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
      } catch (err) {
        if (requestId !== sheetRequestRef.current) return;
        invalidateLoadedVideos();
        setSourceError(`刷新試算表失敗：${err.message}`);
      } finally {
        if (requestId === sheetRequestRef.current) setLoadingSheet(false);
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

  const handleSpreadsheetChange = (event) => {
    const nextValue = event.target.value;
    sheetRequestRef.current += 1;
    setSpreadsheetId(nextValue);
    setLoadingSheet(false);
    clearConfigSaveError();
    if (nextValue.trim() !== appliedSpreadsheetId.trim()) invalidateLoadedVideos();
    setSourceError('');
    scheduleDraftSave({ spreadsheetId: nextValue });
  };

  const handleWorksheetChange = (nextWorksheet) => {
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

  const handlePlaylistChange = (nextPlaylist) => {
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
    if (!youtubeConnected) {
      toast.warning('請先在「YouTube 設定」連結 YouTube 頻道 Google 帳號！');
      return;
    }
    const shouldRestore = restoreVideoOptionsRef.current;
    const rememberedAssignments = shouldRestore && assignments && typeof assignments === 'object' ? assignments : {};
    const rememberedSelectedVideoIds = shouldRestore ? selectedVideoIds : [];
    invalidateLoadedVideos();
    const requestId = playlistRequestRef.current;
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
    } catch (err) {
      if (playlistRequestRef.current !== requestId) return;
      invalidateLoadedVideos();
      setErrorMsg(`載入草稿影片失敗：${err.message}`);
    } finally {
      setLoadingVideos(false);
    }
  };

  const toggleVideoSelection = (videoId) =>
    setSelectedVideoIds((current) =>
      current.includes(videoId) ? current.filter((item) => item !== videoId) : [...current, videoId]
    );
  const handleVideoCardClick = (event, videoId) => {
    if (event.target?.closest?.('button, input, select, textarea, a, label')) return;
    toggleVideoSelection(videoId);
  };
  const handleVideoCardKeyDown = (event, videoId) => {
    if (event.target !== event.currentTarget || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    toggleVideoSelection(videoId);
  };
  const setAllVideosSelected = (checked) => setSelectedVideoIds(checked ? videos.map((video) => video.video_id) : []);

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

  const loadBatchPreview = useCallback(async () => {
    const requestVersion = playlistRequestRef.current;
    setLoadingPreview(true);
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
      if (playlistRequestRef.current !== requestVersion)
        throw new Error('目前播放清單已變更，請重新讀取影片後再預覽。');
      const plan = Array.isArray(response?.plan) ? response.plan : [];
      const token = response?.preview_token || '';
      const snapshot = response?.preview_snapshot || null;
      if (!token || !snapshot) throw new Error('伺服器未提供可驗證的預覽，請重新整理後再試。');
      setBatchPreview(plan);
      setPreviewToken(token);
      setPreviewSnapshot(snapshot);
      setYoutubeRoutingInfo({
        slot: snapshot?.youtube_slot || response.youtube_slot || '',
        reason: snapshot?.youtube_slot_reason || response.youtube_slot_reason || '',
      });
      setPreviewFingerprint(currentPreviewFingerprint);
      return { plan, snapshot };
    } catch (error) {
      setBatchPreview(null);
      setPreviewToken('');
      setPreviewSnapshot(null);
      setPreviewFingerprint('');
      setErrorMsg(`建立完整批次預覽失敗：${error.message}`);
      return null;
    } finally {
      setLoadingPreview(false);
    }
  }, [
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

  const doExecute = async () => {
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
    setExecuting(true);
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
      setResult(res);
      setBatchPreview(null);
      setPreviewToken('');
      setPreviewSnapshot(null);
      setPreviewFingerprint('');
      const summary = formatResultCounts(res);
      if (res.quota_blocked || res.not_attempted_count)
        toast.warning(`YouTube ${YOUTUBE_COPY.batchUpdate}部分完成：${summary}`);
      else if (res.failed_count) toast.warning(`YouTube ${YOUTUBE_COPY.batchUpdate}完成但有失敗項目：${summary}`);
      else toast.success(`YouTube ${YOUTUBE_COPY.batchUpdate}完成：${summary}`);
    } catch (err) {
      if (err.code === 'stale_preview' || err.status === 409) {
        setResult(null);
        setBatchPreview(null);
        setPreviewToken('');
        setPreviewSnapshot(null);
        setPreviewFingerprint('');
        setErrorMsg('預覽已過期或資料已變更，已安全停止批次更新；請重新讀取影片並產生完整預覽。');
        toast.warning('預覽已過期，批次更新已安全停止');
        return;
      }
      setErrorMsg(`批次更新執行失敗：${err.message}`);
      toast.error('批次更新執行失敗');
    } finally {
      setExecuting(false);
    }
  };

  const requestExecute = async () => {
    if (executing || loadingPreview) return;
    if (!sourceReady || sourceStale) return toast.warning('請先刷新資料來源，讓目前來源設定套用完成');
    if (!worksheetName) return toast.warning('請先選擇工作表');
    if (!titleColumn || !descriptionColumn) return toast.warning('請先選擇標題與描述欄位');
    if (titleColumn === descriptionColumn) return toast.warning('標題與描述不能使用同一欄位');
    if (!selectedTeam) return toast.warning('請先選擇所屬團體');
    if (!videos.length) return toast.warning('請先讀取草稿影片');
    const previewResult = await loadBatchPreview();
    if (!previewResult) return;
    const { plan, snapshot } = previewResult;
    const activeCount = plan.filter(isBatchPreviewUpdate).length;
    if (!activeCount) return toast.warning('完整預覽中沒有可更新的影片');
    setEstimateLoading(true);
    try {
      setQuotaEstimate(
        await youtubeBatchApi.estimateQuota({
          operation: 'youtube.metadata_update',
          itemCount: activeCount,
          slot: snapshot?.youtube_slot || activeSlot,
        })
      );
    } catch (error) {
      setQuotaEstimate(null);
      toast.warning(`無法取得配額預估，仍可直接執行：${error.message}`);
    } finally {
      setEstimateLoading(false);
    }
    setConfirmOpen(true);
  };

  const sourceLabel = playlistSource === 'youtube-api' ? 'YouTube API' : '';
  const previewCounts = useMemo(() => {
    const counts = { willUpdate: 0, unchanged: 0, skipped: 0, failed: 0 };
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
    executing,
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
    requestExecute,
    sourceLabel,
    previewCounts,
  };
}
