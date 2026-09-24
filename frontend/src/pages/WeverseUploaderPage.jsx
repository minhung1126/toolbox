import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Folder,
  FolderOpen,
  FolderUp,
  Loader2,
  UploadCloud,
  Video,
} from 'lucide-react';
import './WeverseUploaderPage.css';
import { useToast } from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import ServiceAuthCard from '../components/ServiceAuthCard';
import { useOAuthConnect } from '../hooks/useOAuthConnect';
import WeverseUploadHistory from './weverse/WeverseUploadHistory';
import {
  COMMON_BCP47_LANGS,
  useWeverseUploadWorkflow,
  YOUTUBE_CATEGORIES,
} from '../features/weverse/hooks/useWeverseUploadWorkflow';
import { weverseUploadApi } from '../features/weverse/api/weverseUploadApi';

export default function WeverseUploaderPage({ authUser, refreshAuthUser }) {
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
    uploadConfirmOpen,
    setUploadConfirmOpen,
    uploadStarting,
    historyList,
    historyLoading,
    loadHistory,
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
      {/* Page Header */}
      <header className="page-header">
        <h1 className="weverse-page-title">
          <FolderUp size={28} color="var(--primary)" /> Weverse 影片與字幕上傳
        </h1>
        <p className="section-desc">
          本機 Weverse 結構化資料夾自動辨識影片與 16 語系字幕，複查調整後直傳獨立授權之 YouTube 頻道。
        </p>
      </header>

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
        <div className="glass-panel weverse-folder-picker-panel">
          <div className="weverse-folder-picker-header">
            <h3 className="weverse-folder-picker-title">
              <FolderOpen size={20} color="var(--accent)" /> 步驟一：選擇或拖曳本機資料夾
            </h3>
            <div className="weverse-folder-picker-actions">
              <button
                type="button"
                className={`btn btn-sm ${pathInputMode === 'folder_picker' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setPathInputMode('folder_picker')}
              >
                資料夾選取 / 拖曳
              </button>
              <button
                type="button"
                className={`btn btn-sm ${pathInputMode === 'manual_path' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setPathInputMode('manual_path')}
              >
                直接輸入本機路徑
              </button>
            </div>
          </div>

          {pathInputMode === 'folder_picker' ? (
            <div>
              {/* Hidden webkitdirectory input */}
              <input
                ref={folderInputRef}
                type="file"
                webkitdirectory=""
                multiple
                className="weverse-file-input"
                onChange={handleFolderInputChange}
              />

              {/* Drag and drop zone */}
              <div
                className={`dropzone-panel weverse-dropzone ${isDragging ? 'is-dragging' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => folderInputRef.current?.click()}
              >
                <FolderUp
                  size={54}
                  color={isDragging ? 'var(--primary)' : 'var(--text-muted)'}
                  className="weverse-dropzone-icon"
                />
                <h4 className="weverse-dropzone-title">按一下選擇資料夾，或將資料夾直接拖曳至此處</h4>
                <p className="weverse-dropzone-description">
                  支援包含 <code className="weverse-dropzone-extension">.mp4</code> 影片與多國語系{' '}
                  <code className="weverse-dropzone-extension">.vtt</code> 字幕檔的 Weverse 資料夾
                </p>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    folderInputRef.current?.click();
                  }}
                  disabled={scanning}
                >
                  {scanning ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> 正在辨識檔案結構...
                    </>
                  ) : (
                    '選擇資料夾'
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="weverse-manual-path-row">
                <input
                  type="text"
                  placeholder="例如：D:\Weverse\20260923_Artist_Live_3-241665049"
                  value={localPath}
                  onChange={(e) => setLocalPath(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleScanPath();
                  }}
                  className="input-field weverse-manual-path-input"
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => handleScanPath()}
                  disabled={scanning || !localPath.trim()}
                >
                  {scanning ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> 掃描中...
                    </>
                  ) : (
                    '掃描並辨識'
                  )}
                </button>
              </div>

              {recentPaths.length > 0 && (
                <div className="weverse-recent-paths">
                  <span className="weverse-recent-paths-label">最近掃描路徑：</span>
                  <div className="weverse-recent-path-list">
                    {recentPaths.map((p) => (
                      <button
                        key={p}
                        type="button"
                        className="btn btn-sm btn-secondary weverse-recent-path"
                        onClick={() => {
                          setLocalPath(p);
                          handleScanPath(p);
                        }}
                      >
                        <Folder size={12} className="weverse-recent-path-icon" /> {p}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 3. Step: Review & Inspect ("辨識後讓我複查") */}
      {viewStep === 'review' && (
        <div className="glass-panel weverse-review-panel">
          <div className="weverse-review-header">
            <h3 className="weverse-review-title">
              <FileText size={20} color="var(--primary)" /> 步驟二：辨識結果複查與編輯
            </h3>
            <button type="button" className="btn btn-sm btn-secondary" onClick={handleReset}>
              重新選擇資料夾
            </button>
          </div>

          {/* Video summary card */}
          {videoInfo && (
            <div className="weverse-video-summary">
              <div className="weverse-video-summary-content">
                <Video size={24} color="var(--primary)" className="weverse-video-summary-icon" />
                <div>
                  <div className="weverse-video-filename">{videoInfo.filename}</div>
                  <div className="weverse-video-details">
                    檔案大小：{videoInfo.size_formatted}
                    {videoInfo.full_path ? ` · 路徑：${videoInfo.full_path}` : ''}
                  </div>
                </div>
              </div>
              <span className="badge badge-connected weverse-video-ready">主要影片已就緒</span>
            </div>
          )}

          {/* Video Metadata Settings */}
          <div className="weverse-metadata-grid">
            <div className="weverse-metadata-field">
              <label className="weverse-field-label" htmlFor="weverse-video-title">
                影片標題 (Title) <span className="weverse-required">*</span>
                <span className="weverse-field-counter">{metadata.title.length}/100</span>
              </label>
              <input
                type="text"
                id="weverse-video-title"
                className="input-field"
                value={metadata.title}
                maxLength={100}
                onChange={(e) => setMetadata({ ...metadata, title: e.target.value })}
                placeholder="輸入 YouTube 影片標題"
              />
            </div>

            <div className="weverse-metadata-field">
              <label className="weverse-field-label" htmlFor="weverse-video-privacy">
                公開隱私狀態 (Privacy Status)
              </label>
              <select
                id="weverse-video-privacy"
                className="input-field"
                value={metadata.privacy_status}
                onChange={(e) => setMetadata({ ...metadata, privacy_status: e.target.value })}
              >
                <option value="private">私人 (Private - 推薦)</option>
                <option value="unlisted">不公開 (Unlisted)</option>
                <option value="public">公開 (Public)</option>
              </select>
            </div>

            <div className="weverse-metadata-field">
              <label className="weverse-field-label" htmlFor="weverse-video-category">
                影片類別 (Category)
              </label>
              <select
                id="weverse-video-category"
                className="input-field"
                value={metadata.category_id}
                onChange={(e) => setMetadata({ ...metadata, category_id: e.target.value })}
              >
                {YOUTUBE_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="weverse-metadata-field">
              <label className="weverse-field-label" htmlFor="weverse-video-tags">
                標籤 (Tags, 逗號分隔)
              </label>
              <input
                type="text"
                id="weverse-video-tags"
                className="input-field"
                value={metadata.tags}
                onChange={(e) => setMetadata({ ...metadata, tags: e.target.value })}
                placeholder="例如：weverse, live, idol"
              />
            </div>
          </div>

          <div className="weverse-description-field">
            <label className="weverse-field-label" htmlFor="weverse-video-description">
              影片說明 (Description)
              <span className="weverse-field-counter">{metadata.description.length}/5000</span>
            </label>
            <textarea
              id="weverse-video-description"
              rows={3}
              maxLength={5000}
              value={metadata.description}
              onChange={(e) => setMetadata({ ...metadata, description: e.target.value })}
              placeholder="輸入影片詳細說明內容..."
              className="input-field weverse-video-description-input"
            />
          </div>

          {/* Subtitles review section */}
          <div className="weverse-subtitle-section">
            <div className="weverse-subtitle-header">
              <div>
                <h4 className="weverse-subtitle-title">
                  字幕軌清單與語言對照
                  <span className="weverse-subtitle-count">
                    (已勾選 {enabledSubsCount} / {subtitles.length} 軌)
                  </span>
                </h4>
              </div>
              <div className="weverse-subtitle-actions">
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => handleToggleAllSubs(true)}>
                  全選
                </button>
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => handleToggleAllSubs(false)}>
                  全消
                </button>
              </div>
            </div>

            {subtitles.length === 0 ? (
              <div className="weverse-subtitle-empty">此資料夾中未偵測到任何 .vtt 或 .srt 字幕檔案。</div>
            ) : (
              <div className="weverse-subtitle-table-wrap">
                <table className="weverse-subtitle-table">
                  <thead>
                    <tr className="weverse-subtitle-table-head">
                      <th className="weverse-subtitle-table-heading weverse-subtitle-table-heading-upload">上傳</th>
                      <th className="weverse-subtitle-table-heading">原字幕檔名 / 偵測代碼</th>
                      <th className="weverse-subtitle-table-heading">YouTube 語言代碼 (BCP-47)</th>
                      <th className="weverse-subtitle-table-heading">字幕軌顯示名稱 (Label)</th>
                      <th className="weverse-subtitle-table-heading weverse-subtitle-table-heading-size">大小</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subtitles.map((sub) => (
                      <tr key={sub.id} className={`weverse-subtitle-row ${sub.enabled ? 'is-enabled' : 'is-disabled'}`}>
                        <td className="weverse-subtitle-cell weverse-subtitle-cell-upload">
                          <input
                            type="checkbox"
                            checked={sub.enabled}
                            onChange={() => handleToggleSub(sub.id)}
                            className="weverse-subtitle-checkbox"
                          />
                        </td>
                        <td className="weverse-subtitle-cell">
                          <div className="weverse-subtitle-filename">{sub.filename}</div>
                          <span className="weverse-subtitle-language-code">代碼：{sub.raw_lang || '未知'}</span>
                        </td>
                        <td className="weverse-subtitle-cell">
                          <input
                            type="text"
                            value={sub.bcp47}
                            disabled={!sub.enabled}
                            onChange={(e) => handleSubChange(sub.id, 'bcp47', e.target.value)}
                            list="bcp47-suggestions"
                            className="input-field input-sm weverse-subtitle-language-input"
                          />
                        </td>
                        <td className="weverse-subtitle-cell">
                          <input
                            type="text"
                            value={sub.label}
                            disabled={!sub.enabled}
                            onChange={(e) => handleSubChange(sub.id, 'label', e.target.value)}
                            className="input-field input-sm weverse-subtitle-label-input"
                          />
                        </td>
                        <td className="weverse-subtitle-cell weverse-subtitle-cell-size">{sub.size_formatted}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <datalist id="bcp47-suggestions">
              {COMMON_BCP47_LANGS.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </datalist>
          </div>

          {/* Quota preview card */}
          <div className="weverse-quota-card">
            <div>
              <div className="weverse-quota-title">
                <Clock size={16} color="var(--accent)" /> YouTube API 配額預估消耗：{estimatedQuota.toLocaleString()}{' '}
                單位
              </div>
              <div className="weverse-quota-description">
                影片上傳：1,600 單位 · 字幕上傳：{enabledSubsCount} 軌 × 400 單位 ={' '}
                {(enabledSubsCount * 400).toLocaleString()} 單位
              </div>
            </div>

            {estimatedQuota >= 8000 && (
              <span className="badge badge-warning weverse-quota-warning">
                <AlertTriangle size={14} /> 接近 YouTube 每日預設上限 (10,000)
              </span>
            )}
          </div>

          {/* Actions */}
          <div className="weverse-review-actions">
            <button type="button" className="btn btn-secondary" onClick={handleReset}>
              取消
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={uploadStarting || !isVideoAuthConnected || !metadata.title.trim()}
              onClick={() => setUploadConfirmOpen(true)}
            >
              {uploadStarting ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> 啟動中...
                </>
              ) : (
                '確認並開始上傳至 YouTube'
              )}
            </button>
          </div>
        </div>
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
      {viewStep === 'uploading' && taskStatus && (
        <div className="glass-panel weverse-upload-progress-panel">
          <Loader2 size={48} color="var(--primary)" className="animate-spin weverse-upload-spinner" />
          <h3 className="weverse-upload-progress-title">影片與字幕正在上傳至 YouTube...</h3>
          <p className="weverse-upload-progress-description">{taskStatus.current_step || '處理中，請勿關閉視窗...'}</p>

          {/* Progress bar */}
          <div
            className="weverse-progress-track"
            role="progressbar"
            aria-label="上傳進度"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={taskStatus.progress_percent || 0}
          >
            <div
              style={{
                width: `${taskStatus.progress_percent || 0}%`,
              }}
              className="weverse-progress-fill"
            />
          </div>

          <div className="weverse-progress-percent" aria-hidden="true">
            {taskStatus.progress_percent || 0}%
          </div>
        </div>
      )}

      {/* 5. Step: Completed View */}
      {viewStep === 'completed' && taskStatus && (
        <div className="glass-panel weverse-upload-complete-panel">
          <CheckCircle2 size={54} color="var(--success)" className="weverse-upload-success-icon" />
          <h2 className="weverse-upload-success-title">上傳成功！</h2>
          <p className="weverse-upload-success-description">
            影片「{taskStatus.title}」已順利發布，並已掛載多語系字幕。
          </p>

          <div className="weverse-upload-links">
            {taskStatus.video_url && (
              <a
                href={taskStatus.video_url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary weverse-result-link"
              >
                在 YouTube 開啟影片 <ExternalLink size={16} />
              </a>
            )}
            {taskStatus.studio_url && (
              <a
                href={taskStatus.studio_url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary weverse-result-link"
              >
                在 YouTube Studio 編輯 <ExternalLink size={16} />
              </a>
            )}
          </div>

          <button type="button" className="btn btn-secondary" onClick={handleReset}>
            上傳另一部影片
          </button>
        </div>
      )}

      <WeverseUploadHistory items={historyList} loading={historyLoading} onRefresh={loadHistory} />
    </div>
  );
}
