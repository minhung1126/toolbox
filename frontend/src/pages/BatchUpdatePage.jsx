import React from 'react';
import '../features/youtube/batch-update.css';
import '../features/youtube/bulk-edit.css';
import { useToast } from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import ResultStatus from '../components/ResultStatus';
import ThumbnailDialog from '../components/ThumbnailDialog';
import VideoThumbnail from '../components/VideoThumbnail';
import SheetDataSourcePanel from '../components/SheetDataSourcePanel';
import SourceLinkInput from '../components/SourceLinkInput';
import TeamPersonFilterPanel from '../components/TeamPersonFilterPanel';
import { YOUTUBE_COPY, formatResultCounts, formatVideoCount, formatVideoId } from '../utils/youtubeCopy';
import { youtubeRoutingReasonLabel } from '../utils/youtubeRouting';
import {
  AlertCircle,
  CheckCircle2,
  Info,
  PlaySquare,
  RefreshCw,
  Save,
  Send,
  Shuffle,
  Video as VideoIcon,
  XCircle,
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
import BatchPreviewItem from '../components/batch/BatchPreviewItem';
import BatchUpdateConfirmationContent from '../components/batch/BatchUpdateConfirmationContent';
import { useBatchUpdateWorkflow } from '../features/youtube/hooks/useBatchUpdateWorkflow';

export {
  buildBatchPreview,
  buildPreviewSnapshot,
  createPreviewToken,
  getBatchPreviewStatus,
  isBatchPreviewUpdate,
  resolveDraftConfig,
};

export default function BatchUpdatePage({ sysSettings, authUser, videoType = 'Video' }) {
  const toast = useToast();
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
  } = useBatchUpdateWorkflow({ sysSettings, authUser, videoType, toast });
  return (
    <div className="section-gap batch-update-page">
      <ConfirmDialog
        open={confirmOpen}
        title={`確認${YOUTUBE_COPY.batchUpdate} ${formatVideoCount(previewCounts.willUpdate)}`}
        content={
          batchPreview ? (
            <BatchUpdateConfirmationContent
              batchPreview={batchPreview}
              previewCounts={previewCounts}
              quotaEstimate={quotaEstimate}
            />
          ) : null
        }
        confirmText={estimateLoading ? YOUTUBE_COPY.readLoading : `開始${YOUTUBE_COPY.batchUpdate}`}
        cancelText="取消"
        variant="destructive"
        busy={executing || estimateLoading}
        onConfirm={doExecute}
        onCancel={() => setConfirmOpen(false)}
      />
      <header className="page-header">
        <div className="section-header">
          <VideoIcon size={24} color="var(--primary)" />
          <h1>YouTube {videoType} 草稿</h1>
        </div>
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

      <SheetDataSourcePanel
        spreadsheetId={spreadsheetId}
        onSpreadsheetIdChange={handleSpreadsheetChange}
        worksheets={worksheets}
        worksheetName={worksheetName}
        onWorksheetChange={handleWorksheetChange}
        onRefresh={() => loadSheetResources({ showToast: true })}
        loading={loadingSheet}
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
        <div className="page-actions settings-card-actions" style={{ marginTop: '0.75rem' }}>
          <button type="button" className="btn btn-secondary" onClick={saveDraftConfig} disabled={configSaving}>
            <Save size={16} /> {configSaving ? '儲存中...' : '立即儲存草稿設定'}
          </button>
        </div>
      </SheetDataSourcePanel>

      <div className="glass-panel card-padding playlist-input-panel">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.5rem',
            marginBottom: '0.5rem',
          }}
        >
          <label className="form-label" htmlFor="batch-playlist-id" style={{ marginBottom: 0 }}>
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
          disabled={executing || loadingVideos}
        />
        <p className="section-desc">修改後會自動儲存至目前登入的 Google 帳號；所有 YouTube 流程共用這個設定。</p>
      </div>

      <TeamPersonFilterPanel
        teams={sourceStale ? [] : teams}
        selectedTeam={sourceStale ? '' : selectedTeam}
        onTeamChange={setSelectedTeam}
        people={sourceStale ? [] : teamPeople}
        selectedPeople={sourceStale ? [] : selectedPeople}
        onSelectedPeopleChange={setSelectedPeople}
        loadingTeams={loadingTeams}
        loadingPeople={loadingPeople}
        error={teamPeopleError}
        disabled={!authUser || !hydrated || !sourceReady || sourceStale}
        teamEmptyLabel="請選擇團體"
        peopleDisabledMessage="請先選擇團體；選定後才能載入人物。"
        description="先選擇團體，再勾選要出現在每支影片人物選單中的人物。"
      />

      <div className="glass-panel card-padding random-preview-panel card-stack">
        <div className="action-bar">
          <div>
            <h2 className="panel-title">
              <Shuffle size={19} /> 試算表隨機抽查
            </h2>
            <p className="panel-description">
              從「{visibleSelectedTeam || '尚未選擇團體'}
              」隨機抽一位真實成員，顯示目前選用欄位的內容；全團體列不會被抽中。
            </p>
          </div>
          <div className="page-actions">
            <button
              className="btn btn-primary"
              onClick={loadRandomPreview}
              disabled={randomPreviewLoading || !visibleSelectedTeam}
            >
              <RefreshCw size={16} className={randomPreviewLoading ? 'spin' : ''} />{' '}
              {randomPreviewLoading ? '抽查中...' : randomPreview ? '換一位成員' : '隨機抽查'}
            </button>
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
              <strong>抽中成員：{randomPreview.person}</strong>
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
        <button className="btn btn-primary" onClick={handleLoadVideos} disabled={loadingVideos}>
          <RefreshCw size={16} className={loadingVideos ? 'spin' : ''} />{' '}
          {loadingVideos ? YOUTUBE_COPY.readLoading : `讀取 ${videoType} 草稿影片`}
        </button>
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
            <div className="action-bar bulk-edit-heading">
              <div>
                <h3>批次勾選編輯（已勾選 {formatVideoCount(selectedVideoIds.length)}）</h3>
                <p>只會把人物選項套用到已勾選影片，不會送出 YouTube 更新。套用後會自動清除勾選。</p>
              </div>
              <label className="bulk-select-all">
                <input
                  type="checkbox"
                  checked={selectedVideoIds.length === videos.length}
                  onChange={(e) => setAllVideosSelected(e.target.checked)}
                />{' '}
                全選 / 全不選
              </label>
            </div>
            <div className="toolbar bulk-edit-controls">
              <div className="form-group bulk-person-field">
                <label className="form-label">批次套用人物</label>
                <select className="form-select" value={bulkPerson} onChange={(e) => setBulkPerson(e.target.value)}>
                  <option value="">請選擇人物</option>
                  <option value="不編輯">不編輯（略過）</option>
                  {availablePeople.map((person) => (
                    <option key={person} value={person}>
                      {person}
                    </option>
                  ))}
                </select>
              </div>
              <button
                className="btn btn-primary"
                onClick={applyBulkAssignment}
                disabled={!selectedVideoIds.length || !bulkPerson}
              >
                套用到已勾選影片
              </button>
            </div>
          </div>
          <div className="video-card-grid">
            {videos.map((video) => (
              <div
                key={video.video_id}
                className={`glass-panel video-card ${assignments[video.video_id] && assignments[video.video_id] !== '不編輯' ? 'video-card-assigned' : 'video-card-skipped'}${selectedVideoIds.includes(video.video_id) ? ' video-card-selected' : ''}`}
                role="button"
                tabIndex={0}
                aria-pressed={selectedVideoIds.includes(video.video_id)}
                aria-label={`${selectedVideoIds.includes(video.video_id) ? '取消選取' : '選取'}${video.title || '影片'}加入批次編輯`}
                onClick={(event) => handleVideoCardClick(event, video.video_id)}
                onKeyDown={(event) => handleVideoCardKeyDown(event, video.video_id)}
              >
                <label className="video-select-label">
                  <input
                    type="checkbox"
                    checked={selectedVideoIds.includes(video.video_id)}
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
                </div>
                <div className="form-group video-card-assignment">
                  <label className="form-label">指定套用人物</label>
                  <select
                    className="form-select"
                    value={assignments[video.video_id] || '不編輯'}
                    onChange={(e) => setAssignments((current) => ({ ...current, [video.video_id]: e.target.value }))}
                  >
                    <option value="不編輯">不編輯（略過）</option>
                    {availablePeople.map((person) => (
                      <option key={person} value={person}>
                        {person}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
          {batchPreview && (
            <section className="glass-panel card-padding batch-preview-panel" aria-label="完整批次變更預覽">
              <div className="page-header">
                <h3>{YOUTUBE_COPY.batchUpdate}預覽</h3>
                <p className="section-desc">逐片核對目前內容、更新後內容、人物與處理狀態；確認的是這份完整計畫。</p>
              </div>
              <div className="batch-preview-summary" aria-label="批次預覽狀態摘要">
                <span className="batch-preview-summary-item batch-preview-summary-success">
                  將更新 <strong>{formatVideoCount(previewCounts.willUpdate)}</strong>
                </span>
                <span className="batch-preview-summary-item">
                  沒有變更 <strong>{formatVideoCount(previewCounts.unchanged)}</strong>
                </span>
                <span className="batch-preview-summary-item">
                  略過 <strong>{formatVideoCount(previewCounts.skipped)}</strong>
                </span>
                <span className="batch-preview-summary-item batch-preview-summary-error">
                  失敗 <strong>{formatVideoCount(previewCounts.failed)}</strong>
                </span>
              </div>
              <div className="batch-preview-list">
                {batchPreview.map((item, index) => (
                  <BatchPreviewItem item={item} index={index} key={item.videoId || item.video_id} />
                ))}
              </div>
            </section>
          )}
          <div className="glass-panel execution-bar">
            <div>
              <strong>將處理目前清單中的 {formatVideoCount(videos.length)}</strong>
              <p>人物為「不編輯」的影片會安全略過。</p>
            </div>
            <button className="btn btn-success" onClick={requestExecute} disabled={executing}>
              <Send size={18} /> {executing ? YOUTUBE_COPY.updateLoading : `檢查並${YOUTUBE_COPY.updateMetadata}`}
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className="glass-panel card-padding result-panel card-stack">
          <h3
            className={
              result.completed ? 'result-heading result-heading-success' : 'result-heading result-heading-warning'
            }
          >
            <CheckCircle2 size={22} />{' '}
            {result.completed
              ? `YouTube ${YOUTUBE_COPY.batchUpdate}已執行完成`
              : `YouTube ${YOUTUBE_COPY.batchUpdate}部分完成`}
          </h3>
          <p className="section-desc">
            共 {formatVideoCount(result.total_count || 0)}：{formatResultCounts(result)}。
          </p>
          {result.quota_blocked && (
            <div className="info-banner">
              <Info size={15} />
              <span>已達 YouTube 配額上限；未執行項目請於官方重設後重新讀取草稿影片並送出。</span>
            </div>
          )}
          {(result.results || []).map((item) => (
            <div key={item.video_id} className="result-item result-row">
              <div>
                <strong>{item.title || item.video_id}</strong>
                <div className="result-meta">
                  {formatVideoId(item.video_id)}
                  {item.person ? ` · ${item.person}` : ''}
                </div>
                {item.reason && (
                  <div className={item.status === 'failed' ? 'result-reason result-reason-failed' : 'result-reason'}>
                    {item.reason}
                  </div>
                )}
              </div>
              <ResultStatus status={item.status} />
            </div>
          ))}
        </div>
      )}
      <ThumbnailDialog image={previewImage} onClose={() => setPreviewImage(null)} />
    </div>
  );
}
