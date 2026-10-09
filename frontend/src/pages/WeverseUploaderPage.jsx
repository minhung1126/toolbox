import UploadPackageReview from '../features/weverse/components/UploadPackageReview';
import UploadPackagePicker from '../features/weverse/components/UploadPackagePicker';
import UploadTaskDetails from '../features/weverse/components/UploadTaskDetails';
import { isActiveTask } from '../features/weverse/model/taskState';
import React from 'react';
import { FolderUp, Loader2, UploadCloud } from 'lucide-react';
import './WeverseUploaderPage.css';
import { useToast } from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import ServiceAuthCard from '../components/ServiceAuthCard';
import { StatusMessage } from '../components/StatusMessage';
import { PageHeader } from '../shared/ui';
import { useOAuthConnect } from '../hooks/useOAuthConnect';
import WeverseUploadHistory from './weverse/WeverseUploadHistory';
import { useWeverseUploadWorkflow } from '../features/weverse/hooks/useWeverseUploadWorkflow';
import { weverseUploadApi } from '../features/weverse/api/weverseUploadApi';

export default function WeverseUploaderPage(props) {
  return <WeverseUploaderContent key={props.authUser?.user?.sub || 'anonymous'} {...props} />;
}
function WeverseUploaderContent({ authUser, refreshAuthUser }) {
  const toast = useToast();

  // YouTube Dedicated Authorization hook
  const { connecting, confirmDisconnect, setConfirmDisconnect, handleConnect, handleConfirmDisconnect } =
    useOAuthConnect({
      serviceName: 'video_uploader',
      getAuthUrl: weverseUploadApi.getUploaderAuthUrl,
      disconnect: weverseUploadApi.disconnectUploader,
      onAfterDisconnect: refreshAuthUser,
      serviceLabel: '影片上傳 YouTube 頻道授權',
      successMessage: '已解除影片上傳專屬 YouTube 頻道授權',
    });

  const videoAuth = authUser?.authorizations?.video_uploader;
  const isVideoAuthConnected = Boolean(videoAuth?.connected);

  const {
    viewStep,
    pathInputMode,
    setPathInputMode,
    localPath,
    setLocalPath,
    recentPaths,
    scanning,
    isDragging,
    videoInfo,
    subtitles,
    metadata,
    setMetadata,
    taskStatus,
    taskLoading,
    taskPollingError,
    uploadConfirmOpen,
    setUploadConfirmOpen,
    uploadStarting,
    uploadOutcomeUncertain,
    historyList,
    historyLoading,
    historyError,
    loadHistory,
    openTask,
    trackQueued,
    folderInputRef,
    handleScanPath,
    handleFolderInputChange,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleToggleAllSubs,
    handleToggleSub,
    handleSubChange,
    enabledSubsCount,
    estimatedQuota,
    handleStartUpload,
    handleReset,
  } = useWeverseUploadWorkflow({ isVideoAuthConnected, toast });

  return (
    <div className="section-gap weverse-uploader-container">
      <PageHeader
        title={
          <span className="weverse-page-title">
            <FolderUp size={28} color="var(--primary)" aria-hidden="true" /> Weverse 影片與字幕上傳
          </span>
        }
        description="本機 Weverse 結構化資料夾自動辨識影片與 16 語系字幕，複查調整後直傳獨立授權之 YouTube 頻道。"
      />

      {/* 1. Independent YouTube Channel Authorization Card */}
      <ServiceAuthCard
        icon={UploadCloud}
        title="影片上傳專屬 YouTube 頻道"
        connected={isVideoAuthConnected}
        connectedBadgeText="已授權 YouTube 頻道"
        disconnectedBadgeText="尚未連結上傳頻道"
        description="本工具採用獨立的 YouTube 頻道授權，上傳影片與字幕不會干擾 YouTube 主頻道或 YouTube Music 設定。"
        accountEmail={videoAuth?.account_name || videoAuth?.channel_title}
        accountEmailPrefix="授權頻道："
        channelId={videoAuth?.channel_id}
        channelHandle={videoAuth?.channel_handle}
        warningText="尚未授權影片上傳 YouTube 頻道。請先點擊下方按鈕登入並連結目標頻道以啟用上傳功能。"
        connecting={connecting}
        onConnect={handleConnect}
        onDisconnect={() => setConfirmDisconnect(true)}
      />

      <ConfirmDialog
        open={confirmDisconnect}
        title="確認斷開影片上傳頻道？"
        message="斷開後將無法上傳新影片至此 YouTube 頻道，但已上傳的影片與設定不會受影響。"
        confirmText="確認斷開"
        onConfirm={handleConfirmDisconnect}
        onCancel={() => setConfirmDisconnect(false)}
      />

      {/* 2. Step: Pick / Drop Folder */}
      {viewStep === 'pick' && (
        <UploadPackagePicker
          pathInputMode={pathInputMode}
          folderInputRef={folderInputRef}
          handleFolderInputChange={handleFolderInputChange}
          isDragging={isDragging}
          handleDragOver={handleDragOver}
          handleDragLeave={handleDragLeave}
          handleDrop={handleDrop}
          scanning={scanning}
          localPath={localPath}
          recentPaths={recentPaths}
          setPathInputMode={setPathInputMode}
          setLocalPath={setLocalPath}
          handleScanPath={handleScanPath}
        />
      )}

      {/* 3. Step: Review & Inspect ("辨識後讓我複查") */}
      {viewStep === 'review' && (
        <UploadPackageReview
          handleReset={handleReset}
          videoInfo={videoInfo}
          metadata={metadata}
          enabledSubsCount={enabledSubsCount}
          subtitles={subtitles}
          estimatedQuota={estimatedQuota}
          uploadOutcomeUncertain={uploadOutcomeUncertain}
          uploadStarting={uploadStarting}
          isVideoAuthConnected={isVideoAuthConnected}
          setMetadata={setMetadata}
          handleToggleAllSubs={handleToggleAllSubs}
          handleToggleSub={handleToggleSub}
          handleSubChange={handleSubChange}
          setUploadConfirmOpen={setUploadConfirmOpen}
        />
      )}

      {/* Confirm upload dialog */}
      <ConfirmDialog
        open={uploadConfirmOpen}
        title="確認開始發布至 YouTube？"
        message={`即將上傳影片「${metadata.title}」並掛載 ${enabledSubsCount} 語系字幕，預估消耗 ${estimatedQuota.toLocaleString()} 單位 YouTube 配額。`}
        confirmText="立即上傳"
        onConfirm={handleStartUpload}
        onCancel={() => setUploadConfirmOpen(false)}
      />

      {/* 4. Step: Uploading / Progress */}
      {viewStep === 'uploading' && taskStatus && (isActiveTask(taskStatus) || taskPollingError) && (
        <div className="glass-panel weverse-upload-progress-panel">
          {taskPollingError ? (
            <StatusMessage tone="error" title="上傳狀態待核對">
              {taskPollingError}
            </StatusMessage>
          ) : (
            <>
              <Loader2 size={48} color="var(--primary)" className="animate-spin weverse-upload-spinner" />
              <h3 className="weverse-upload-progress-title">影片與字幕正在上傳至 YouTube...</h3>
              <p className="weverse-upload-progress-description">
                {taskStatus.current_step || '處理中，請勿關閉視窗...'}
              </p>

              <div
                className="weverse-progress-track"
                role="progressbar"
                aria-label="上傳進度"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={taskStatus.progress_percent || 0}
              >
                <div style={{ width: `${taskStatus.progress_percent || 0}%` }} className="weverse-progress-fill" />
              </div>
              <div className="weverse-progress-percent" aria-hidden="true">
                {taskStatus.progress_percent || 0}%
              </div>
            </>
          )}
        </div>
      )}

      {taskLoading && <p role="status">正在讀取任務詳情…</p>}
      {taskPollingError && !taskStatus && (
        <StatusMessage tone="error" title="上傳狀態待核對">
          {taskPollingError}
        </StatusMessage>
      )}
      {taskStatus && (
        <UploadTaskDetails
          key={taskStatus.task_id}
          task={taskStatus}
          connected={isVideoAuthConnected}
          onQueued={trackQueued}
          onOpen={openTask}
          onReset={handleReset}
        />
      )}

      <WeverseUploadHistory
        items={historyList}
        loading={historyLoading}
        error={historyError}
        onRefresh={loadHistory}
        onOpen={openTask}
      />
    </div>
  );
}
