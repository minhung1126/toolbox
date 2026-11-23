import { Button } from '../shared/ui';
import '../features/youtube/youtube-shared.css';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PATHS } from '../routes/paths';
import '../features/youtube/batch-update.css';
import '../features/youtube/bulk-edit.css';
import { useToast } from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import ThumbnailDialog from '../components/ThumbnailDialog';
import VideoThumbnail from '../components/VideoThumbnail';
import SheetDataSourcePanel from '../components/SheetDataSourcePanel';
import SourceLinkInput from '../components/SourceLinkInput';
import { personLabel } from '../features/sheets/model/personOptions';
import TeamPersonFilterPanel from '../components/TeamPersonFilterPanel';
import { YOUTUBE_COPY, formatVideoCount, formatVideoId } from '../utils/youtubeCopy';
import { youtubeRoutingReasonLabel } from '../features/youtube/model/routing';
import {
  AlertCircle,
  CheckCircle2,
  XCircle,
  Info,
  PlaySquare,
  RefreshCw,
  Save,
  Send,
  Shuffle,
  Video as VideoIcon,
} from 'lucide-react';

import {
  buildBatchPreview,
  buildPreviewSnapshot,
  createPreviewToken,
  getBatchPreviewStatus,
  isBatchPreviewUpdate,
  resolveDraftConfig,
} from '../utils/batchPreview';
import PreviewField from '../components/batch/PreviewField';
import { useBatchUpdateWorkflow } from '../features/youtube/hooks/useBatchUpdateWorkflow';
import { draftPublishApi } from '../features/youtube/api/draftPublishApi';
import {
  createSavedDraft,
  loadPublishDraft,
  rememberDraftContext,
  savePublishDraft,
} from '../features/youtube/model/draftPublishStorage';
import { getYoutubeAuthContext } from '../features/youtube/model/routing';
import { prepareDraftAvailability } from '../features/youtube/model/prepareDraftState';
import { editStatusLabel, useVideoEditStatus } from '../features/youtube/hooks/useVideoEditStatus';

export {
  buildBatchPreview,
  buildPreviewSnapshot,
  createPreviewToken,
  getBatchPreviewStatus,
  isBatchPreviewUpdate,
  resolveDraftConfig,
};

export default function BatchUpdatePage(props) {
  const account = props.authUser?.sub || props.authUser?.email || '';
  const channel = getYoutubeAuthContext(props.authUser).channelId;
  return <BatchUpdateEditor key={JSON.stringify([account, channel, props.videoType || 'Video'])} {...props} />;
}

function BatchUpdateEditor({ sysSettings, authUser, videoType = 'Video' }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [preparing, setPreparing] = useState(false);
  const [rebuildOpen, setRebuildOpen] = useState(false);
  const [stagingError, setStagingError] = useState('');
  const preparingRef = useRef(false);
  const prepareController = useRef(null);
  const mounted = useRef(true);
  const [editFilter, setEditFilter] = useState('all');
  const [includeUnknown, setIncludeUnknown] = useState(true);
  const [videoQuery, setVideoQuery] = useState('');
  const {
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
    errorMsg,
    configSaveError,
    sourceError,
    previewImage,
    setPreviewImage,
    hydrated,
    draftAutosaveStatus,
    playlistAutosaveStatus,
    sourceStale,
    teams,
    selectedTeams,
    setSelectedTeams,
    personQuery,
    setPersonQuery,
    teamPeople,
    selectedPeople,
    setSelectedPeople,
    loadingTeams,
    loadingPeople,
    teamPeopleError,
    randomPreviewTeam,
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
    sourceLabel,
  } = useBatchUpdateWorkflow({ sysSettings, authUser, videoType, toast });
  const workflowBusy = preparing || executing || loadingSheet || loadingVideos;
  const account = authUser?.sub || authUser?.email || '';
  const auth = getYoutubeAuthContext(authUser);
  const channel = auth.channelId;
  const editHistory = useVideoEditStatus(
    account,
    channel,
    videos.map((video) => video.video_id)
  );
  const filteredVideos = videos.filter((video) => {
    const status = editHistory.statuses[video.video_id] || 'unknown';
    return (
      (editFilter === 'all' || !editHistory.loading) &&
      (editFilter === 'all' ||
        status === editFilter ||
        (editFilter === 'not_applied' && includeUnknown && status === 'unknown')) &&
      `${video.title || ''} ${video.video_id} ${video.description || ''}`
        .toLocaleLowerCase()
        .includes(videoQuery.trim().toLocaleLowerCase())
    );
  });
  const filteredIds = filteredVideos.map((video) => video.video_id);
  const hiddenSelectedCount = selectedVideoIds.filter((id) => !filteredIds.includes(id)).length;
  const stagedPath = videoType === 'Shorts' ? PATHS.youtubeShortsStaging : PATHS.youtubeVideoStaging;
  const source = useMemo(
    () => ({
      spreadsheet_url_or_id: spreadsheetId.trim(),
      playlist_id: playlistId,
      video_type: videoType,
      worksheet_name: worksheetName,
      title_column: titleColumn,
      description_column: descriptionColumn,
      team: '',
      assignments: videos.map((video) => ({
        video_id: video.video_id,
        person: assignments[video.video_id] || '不編輯',
      })),
    }),
    [spreadsheetId, playlistId, videoType, worksheetName, titleColumn, descriptionColumn, videos, assignments]
  );
  const prepareContext = JSON.stringify([account, auth.authorizationFingerprint, source]);
  const currentPrepareContext = useRef(prepareContext);
  currentPrepareContext.current = prepareContext;
  const assignedCount = source.assignments.filter((item) => item.person && item.person !== '不編輯').length;
  const availability = prepareDraftAvailability({
    preparing,
    executing,
    loadingSheet,
    loadingVideos,
    hydrated,
    authenticated: Boolean(account && auth.authenticated),
    channel,
    sourceReady,
    sourceStale,
    worksheet: worksheets.some((sheet) => sheet.title === worksheetName) ? worksheetName : '',
    titleColumn: columns.includes(titleColumn) ? titleColumn : '',
    descriptionColumn: columns.includes(descriptionColumn) ? descriptionColumn : '',
    assignedCount,
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      prepareController.current?.abort();
    };
  }, []);
  useEffect(() => {
    setRebuildOpen(false);
    return () => prepareController.current?.abort();
  }, [prepareContext]);
  useEffect(() => {
    if (!hydrated || !sourceReady || !account || !channel) return;
    try {
      rememberDraftContext(account, source, channel);
    } catch {
      setStagingError('瀏覽器無法保存暫存資料，請確認儲存空間與網站儲存權限。');
    }
  }, [account, channel, hydrated, source, sourceReady]);
  const prepareDrafts = async (rebuild = false) => {
    if (preparingRef.current) return toast.warning('正在產生暫存，請稍候。');
    if (!availability.canPrepare) return toast.warning(availability.reason);
    try {
      if (!rebuild && channel && loadPublishDraft(account, channel, videoType)) {
        setRebuildOpen(true);
        return;
      }
    } catch (error) {
      setStagingError(`無法讀取既有暫存：${error.message}`);
      return;
    }
    preparingRef.current = true;
    const controller = new AbortController();
    prepareController.current = controller;
    try {
      setPreparing(true);
      setStagingError('');
      const stage = await draftPublishApi.prepare(source, { signal: controller.signal });
      if (controller.signal.aborted || currentPrepareContext.current !== prepareContext || !mounted.current) {
        if (mounted.current) setStagingError('來源或頻道變更，已取消產生暫存；請核對後重試。');
        return;
      }
      if (stage.stage_snapshot.youtube_channel_id !== channel) throw new Error('授權頻道已變更，請重新讀取影片。');
      const draft = createSavedDraft(stage, account, source);
      savePublishDraft(draft);
      rememberDraftContext(account, source, channel);
      navigate(stagedPath);
    } catch (error) {
      if (mounted.current)
        setStagingError(
          controller.signal.aborted
            ? '已取消產生暫存；既有暫存與手動修改仍保留，請核對來源與頻道後重試。'
            : `建立暫存失敗：${error.message}`
        );
    } finally {
      preparingRef.current = false;
      if (mounted.current) {
        setPreparing(false);
        setRebuildOpen(false);
      }
    }
  };
  return (
    <div className="section-gap batch-update-page">
      <ConfirmDialog
        open={rebuildOpen}
        title="重建發布前暫存？"
        message="重建會取代此頻道目前的暫存與手動修改。尚未確認的 YouTube 寫入仍須先到作業紀錄核對。"
        confirmText="重建暫存"
        onConfirm={() => prepareDrafts(true)}
        onCancel={() => setRebuildOpen(false)}
        busy={preparing}
      />
      <Link to={stagedPath}>繼續編輯草稿並公開</Link>
      {stagingError && (
        <div role="alert" className="error-banner">
          {stagingError}
        </div>
      )}
      <Link to={PATHS.operations}>查看作業紀錄／核對先前結果</Link>
      <header className="page-header">
        <div className="section-header">
          <VideoIcon size={24} color="var(--primary)" />
          <h1>{videoType} 快速套用</h1>
        </div>
        <p className="section-desc">① 快速套用人物並建立草稿；下一步為② 編輯草稿並公開。</p>
        <p className="section-desc">
          此頁只處理 {videoType}。先確認資料來源、工作表與欄位，再勾選要出現在人物下拉選單中的人物。
        </p>
        {youtubeRoutingInfo?.slot && (
          <p className="section-desc">
            本次 YouTube routing：{youtubeRoutingInfo.slot}；{youtubeRoutingReasonLabel(youtubeRoutingInfo.reason)}
          </p>
        )}
        {!youtubeConnected && (
          <div className="info-banner">
            <AlertCircle size={16} />
            <span>尚未連結 YouTube 頻道 Google 帳號；請先到「YouTube 設定」授權管理品牌帳號的 Google 帳號。</span>
          </div>
        )}
      </header>

      <p role="status">
        {videos.length ? '2. 配對人物並產生暫存' : '1. 讀取來源與影片'} · {videos.length} 支影片 · 目標頻道：
        {authUser?.youtube?.slots?.[authUser?.youtube?.active_slot || 'primary']?.channel_title || '待連線核對'}
      </p>
      <SheetDataSourcePanel
        collapsible
        summary={`標題：${titleColumn || '未選'}／說明：${descriptionColumn || '未選'}`}
        spreadsheetId={spreadsheetId}
        onSpreadsheetIdChange={handleSpreadsheetChange}
        worksheets={worksheets}
        worksheetName={worksheetName}
        onWorksheetChange={handleWorksheetChange}
        onRefresh={() => loadSheetResources({ showToast: true })}
        loading={loadingSheet}
        disabled={workflowBusy}
        sourceReady={sourceReady}
        stale={sourceStale}
        error={sourceError}
        autosaveStatus={draftAutosaveStatus}
      >
        <div className="form-group">
          <label className="form-label" htmlFor="batch-title-column">
            標題套用欄位
          </label>
          <select
            id="batch-title-column"
            className="form-select"
            value={titleColumn}
            onChange={(e) => {
              setTitleColumn(e.target.value);
              clearConfigSaveError();
              scheduleDraftSave({ titleColumn: e.target.value });
            }}
          >
            {columns.map((column) => (
              <option key={column} value={column}>
                {column}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="batch-description-column">
            描述套用欄位
          </label>
          <select
            id="batch-description-column"
            className="form-select"
            value={descriptionColumn}
            onChange={(e) => {
              setDescriptionColumn(e.target.value);
              clearConfigSaveError();
              scheduleDraftSave({ descriptionColumn: e.target.value });
            }}
          >
            {columns.map((column) => (
              <option key={column} value={column}>
                {column}
              </option>
            ))}
          </select>
        </div>
        <div className="info-banner filter-panel-full-width">
          <Info size={14} color="var(--primary)" />
          <span>
            Video / Shorts 各自保存工作表、欄位與工作流資源；Sheet 內容複製、Video、Shorts
            共用目前帳號的團體與人物篩選。未指定的資源會使用目前帳號的預設 Google Sheet 或 YouTube 播放清單。
          </span>
        </div>
        <div className="page-actions settings-card-actions batch-settings-actions">
          <Button
            variant="secondary"
            type="button"
            className="btn btn-secondary"
            onClick={saveDraftConfig}
            disabled={configSaving}
          >
            <Save size={16} /> {configSaving ? '儲存中...' : '立即儲存草稿設定'}
          </Button>
        </div>
      </SheetDataSourcePanel>

      <div className="glass-panel card-padding playlist-input-panel">
        <div className="playlist-input-heading">
          <label className="form-label" htmlFor="batch-playlist-id">
            <PlaySquare size={14} /> 共用 To-Post 播放清單
          </label>
          {playlistAutosaveStatus === 'saving' && (
            <span className="badge badge-info">
              <RefreshCw size={12} className="spin" /> 自動儲存中...
            </span>
          )}
          {playlistAutosaveStatus === 'saved' && (
            <span className="badge badge-connected">
              <CheckCircle2 size={12} /> 已自動儲存
            </span>
          )}
          {playlistAutosaveStatus === 'invalid' && <span className="badge badge-warning">播放清單網址格式不完整</span>}
          {playlistAutosaveStatus === 'error' && (
            <span className="badge badge-disconnected">
              <XCircle size={12} /> 自動儲存失敗
            </span>
          )}
        </div>
        <SourceLinkInput
          id="batch-playlist-id"
          value={playlistId}
          onChange={(event) => handlePlaylistChange(event.target.value)}
          sourceType="youtube-playlist"
          placeholder="YouTube Playlist ID 或網址"
          disabled={workflowBusy || loadingVideos}
        />
        <p className="section-desc">修改後會自動儲存至目前登入的 Google 帳號；所有 YouTube 流程共用這個設定。</p>
      </div>

      <TeamPersonFilterPanel
        teams={sourceStale ? [] : teams}
        selectedTeams={selectedTeams}
        onTeamsChange={setSelectedTeams}
        query={personQuery}
        onQueryChange={setPersonQuery}
        people={sourceStale ? [] : teamPeople}
        selectedPeople={selectedPeople}
        onSelectedPeopleChange={setSelectedPeople}
        loadingTeams={loadingTeams}
        loadingPeople={loadingPeople}
        error={teamPeopleError}
        disabled={workflowBusy || !authUser || !hydrated || !sourceReady || sourceStale}
        description="可跨團體選取人物；未選人物時，影片人物選單顯示全部可用人物。"
      />

      <div className="glass-panel card-padding random-preview-panel card-stack">
        <div className="action-bar">
          <div>
            <h2 className="panel-title">
              <Shuffle size={19} /> 試算表隨機抽查
            </h2>
            <p className="panel-description">
              從「{randomPreviewTeam || '尚無可用成員'}
              」隨機抽一位真實成員，顯示目前選用欄位的內容；全團體列不會被抽中。
            </p>
          </div>
          <div className="page-actions">
            <Button
              variant="primary"
              className="btn btn-primary"
              onClick={loadRandomPreview}
              disabled={workflowBusy || randomPreviewLoading || !randomPreviewTeam}
            >
              <RefreshCw size={16} className={randomPreviewLoading ? 'spin' : ''} />{' '}
              {randomPreviewLoading ? '抽查中...' : randomPreview ? '換一位成員' : '隨機抽查'}
            </Button>
          </div>
        </div>
        {previewError && (
          <div className="error-alert">
            <AlertCircle size={18} />
            <span>{previewError}</span>
          </div>
        )}
        {randomPreview && (
          <div className="random-preview-content">
            <div className="random-preview-person">
              <strong>
                抽中成員：{randomPreview.person} · {randomPreview.team}
              </strong>
            </div>
            <div className="responsive-grid">
              <PreviewField label={`標題欄位：${titleColumn}`} value={randomPreview.values?.[titleColumn]} />
              <PreviewField
                label={`描述欄位：${descriptionColumn}`}
                value={randomPreview.values?.[descriptionColumn]}
              />
            </div>
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="glass-panel error-alert">
          <AlertCircle size={20} />
          <span>{errorMsg}</span>
        </div>
      )}
      {workStateError && (
        <div className="filter-panel-status filter-panel-status-error" role="alert">
          工作狀態同步失敗：{workStateError}
        </div>
      )}
      {configSaveError && (
        <div className="glass-panel error-alert">
          <AlertCircle size={20} />
          <span>{configSaveError}</span>
        </div>
      )}
      <div className="page-actions">
        <Button
          variant="primary"
          className="btn btn-primary"
          onClick={handleLoadVideos}
          disabled={workflowBusy || !hydrated || !sourceReady || sourceStale}
        >
          <RefreshCw size={16} className={loadingVideos ? 'spin' : ''} />{' '}
          {loadingVideos ? YOUTUBE_COPY.readLoading : `讀取 ${videoType} 草稿影片`}
        </Button>
      </div>

      {videos.length > 0 && (
        <div className="section-gap batch-videos">
          <div className="page-header">
            <h2>為每支影片指定人物（{formatVideoCount(videos.length)}）</h2>
            <p className="section-desc batch-source-label">
              來源：{sourceLabel}
              {playlistFallbackReason ? `；回退原因：${playlistFallbackReason}` : ''}
            </p>
          </div>
          <div className="glass-panel bulk-edit-panel card-stack">
            <div className="toolbar">
              <label className="form-group">
                <span className="form-label">編輯套用狀態</span>
                <select
                  className="form-select"
                  value={editFilter}
                  onChange={(event) => setEditFilter(event.target.value)}
                >
                  <option value="all">全部（預設）</option>
                  <option value="not_applied">尚未套用編輯</option>
                  <option value="applied">已套用編輯</option>
                  <option value="unknown">狀態未知</option>
                </select>
              </label>
              <label className="form-group">
                <span className="form-label">搜尋影片</span>
                <input
                  className="form-input"
                  type="search"
                  value={videoQuery}
                  onChange={(event) => setVideoQuery(event.target.value)}
                  placeholder="標題、描述或影片 ID"
                />
              </label>
              <Button variant="secondary" disabled={editHistory.loading} onClick={editHistory.refresh}>
                刷新套用紀錄
              </Button>
            </div>
            {editFilter === 'not_applied' && (
              <label>
                <input
                  type="checkbox"
                  checked={includeUnknown}
                  onChange={(event) => setIncludeUnknown(event.target.checked)}
                />{' '}
                一起顯示狀態未知（無法確認歷史是否已編輯）
              </label>
            )}
            <p role="status">
              符合 {filteredVideos.length} / {videos.length} 支影片 · 已勾選 {selectedVideoIds.length} 支（其中{' '}
              {hiddenSelectedCount} 支不在目前結果）。篩選只改變顯示；人物指定與暫存內容保留。
            </p>
            {editHistory.loading && <p role="status">正在讀取編輯套用紀錄…</p>}
            {editHistory.error && (
              <p role="alert">{editHistory.error} 未能判定的影片標為未知，可按「刷新套用紀錄」重試。</p>
            )}
            <div className="action-bar bulk-edit-heading">
              <div>
                <h3>批次勾選編輯（已勾選 {formatVideoCount(selectedVideoIds.length)}）</h3>
                <p>只會把人物選項套用到已勾選影片，不會送出 YouTube 更新。套用後會自動清除勾選。</p>
              </div>
              <label className="bulk-select-all">
                <input
                  type="checkbox"
                  checked={filteredIds.length > 0 && filteredIds.every((id) => selectedVideoIds.includes(id))}
                  disabled={workflowBusy || !filteredIds.length}
                  onChange={(e) => setAllVideosSelected(e.target.checked, filteredIds)}
                />{' '}
                全選 / 全不選目前結果
              </label>
            </div>
            <div className="toolbar bulk-edit-controls">
              <div className="form-group bulk-person-field">
                <label className="form-label">批次套用人物</label>
                <select
                  className="form-select"
                  value={bulkPerson}
                  onChange={(e) => setBulkPerson(e.target.value)}
                  disabled={workflowBusy}
                >
                  <option value="">請選擇人物</option>
                  <option value="不編輯">不編輯（略過）</option>
                  {[...new Set([...availablePeople, bulkPerson].filter((person) => person && person !== '不編輯'))].map(
                    (person) => (
                      <option key={person} value={person}>
                        {personLabel(person)}
                      </option>
                    )
                  )}
                </select>
              </div>
              <Button
                variant="primary"
                className="btn btn-primary"
                onClick={applyBulkAssignment}
                disabled={workflowBusy || !selectedVideoIds.length || !bulkPerson}
              >
                套用到已勾選影片
              </Button>
            </div>
          </div>
          <div className="video-card-grid">
            {filteredVideos.map((video) => (
              <div
                key={video.video_id}
                className={`glass-panel video-card ${assignments[video.video_id] && assignments[video.video_id] !== '不編輯' ? 'video-card-assigned' : 'video-card-skipped'}${selectedVideoIds.includes(video.video_id) ? ' video-card-selected' : ''}`}
                role="button"
                tabIndex={workflowBusy ? -1 : 0}
                aria-disabled={workflowBusy || undefined}
                aria-pressed={selectedVideoIds.includes(video.video_id)}
                aria-label={`${selectedVideoIds.includes(video.video_id) ? '取消選取' : '選取'}${video.title || '影片'}加入批次編輯`}
                onClick={(event) => !workflowBusy && handleVideoCardClick(event, video.video_id)}
                onKeyDown={(event) => !workflowBusy && handleVideoCardKeyDown(event, video.video_id)}
              >
                <label className="video-select-label">
                  <input
                    type="checkbox"
                    checked={selectedVideoIds.includes(video.video_id)}
                    disabled={workflowBusy}
                    onChange={() => toggleVideoSelection(video.video_id)}
                  />{' '}
                  加入批次編輯
                </label>
                <div className="video-thumbnail-wrapper">
                  <VideoThumbnail
                    src={video.thumbnail_url}
                    videoId={video.video_id}
                    alt={video.title || '影片'}
                    onPreview={(imgInfo) => setPreviewImage(imgInfo)}
                  />
                </div>
                <div className="video-card-copy">
                  <h4>{video.title || '無標題影片'}</h4>
                  <p>{formatVideoId(video.video_id)}</p>
                  <p>
                    {editHistory.loading
                      ? '套用狀態讀取中…'
                      : editStatusLabel[editHistory.statuses[video.video_id] || 'unknown']}
                  </p>
                </div>
                <div className="form-group video-card-assignment">
                  <label className="form-label">指定套用人物</label>
                  <select
                    className="form-select"
                    value={assignments[video.video_id] || '不編輯'}
                    disabled={workflowBusy}
                    onChange={(e) => setAssignments((current) => ({ ...current, [video.video_id]: e.target.value }))}
                  >
                    <option value="不編輯">不編輯（略過）</option>
                    {[
                      ...new Set(
                        [...availablePeople, assignments[video.video_id]].filter(
                          (person) => person && person !== '不編輯'
                        )
                      ),
                    ].map((person) => (
                      <option key={person} value={person}>
                        {personLabel(person)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
          {!filteredVideos.length && !editHistory.loading && (
            <p role="status">沒有符合目前搜尋與套用狀態的影片。請調整篩選，或一起顯示狀態未知的影片。</p>
          )}
          <div className="glass-panel execution-bar">
            <div>
              <strong>下一步：編輯草稿並公開</strong>
              <p>先套用人物，再到獨立頁面逐片修改標題與描述。最後確認編輯並公開前，不會寫入 YouTube。</p>
              <p>將處理全部 {assignedCount} 支已指定人物的影片（含篩選外影片）。</p>
              {availability.reason && (
                <p id="prepare-draft-reason" role="status">
                  {availability.reason}
                </p>
              )}
              {(!auth.authenticated || !channel) && <Link to={PATHS.youtubeConnections}>前往 YouTube 設定</Link>}
            </div>
            <Button
              variant="primary"
              onClick={() => prepareDrafts()}
              disabled={!availability.canPrepare}
              aria-describedby={availability.reason ? 'prepare-draft-reason' : undefined}
              aria-busy={preparing || undefined}
            >
              <Send size={18} /> {preparing ? '產生暫存中…' : '套用人物並建立草稿'}
            </Button>
            {preparing && (
              <Button variant="secondary" onClick={() => prepareController.current?.abort()}>
                取消產生暫存
              </Button>
            )}
          </div>
        </div>
      )}

      <ThumbnailDialog image={previewImage} onClose={() => setPreviewImage(null)} />
    </div>
  );
}
