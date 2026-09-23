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
import { api } from '../services/api';
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

export default function WeverseUploaderPage({ authUser, refreshAuthUser }) {
  const toast = useToast();

  // YouTube Dedicated Authorization hook
  const { connecting, confirmDisconnect, setConfirmDisconnect, handleConnect, handleConfirmDisconnect } =
    useOAuthConnect({
      serviceName: 'video_uploader',
      getAuthUrl: api.getVideoUploaderAuthUrl,
      disconnect: api.disconnectVideoUploader,
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
        <div className="glass-panel" style={{ padding: '1.75rem' }}>
          <div
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}
          >
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FileText size={20} color="var(--primary)" /> 步驟二：辨識結果複查與編輯
            </h3>
            <button type="button" className="btn btn-sm btn-secondary" onClick={handleReset}>
              重新選擇資料夾
            </button>
          </div>

          {/* Video summary card */}
          {videoInfo && (
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                padding: '1rem',
                marginBottom: '1.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Video size={24} color="var(--primary)" />
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{videoInfo.filename}</div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    檔案大小：{videoInfo.size_formatted}
                    {videoInfo.full_path ? ` · 路徑：${videoInfo.full_path}` : ''}
                  </div>
                </div>
              </div>
              <span className="badge badge-connected" style={{ fontSize: '0.8rem' }}>
                主要影片已就緒
              </span>
            </div>
          )}

          {/* Video Metadata Settings */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '1rem',
              marginBottom: '1.5rem',
            }}
          >
            <div>
              <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                影片標題 (Title) <span style={{ color: 'var(--danger)' }}>*</span>
                <span style={{ float: 'right', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {metadata.title.length}/100
                </span>
              </label>
              <input
                type="text"
                className="input-field"
                value={metadata.title}
                maxLength={100}
                onChange={(e) => setMetadata({ ...metadata, title: e.target.value })}
                placeholder="輸入 YouTube 影片標題"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                公開隱私狀態 (Privacy Status)
              </label>
              <select
                className="input-field"
                value={metadata.privacy_status}
                onChange={(e) => setMetadata({ ...metadata, privacy_status: e.target.value })}
              >
                <option value="private">私人 (Private - 推薦)</option>
                <option value="unlisted">不公開 (Unlisted)</option>
                <option value="public">公開 (Public)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                影片類別 (Category)
              </label>
              <select
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

            <div>
              <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                標籤 (Tags, 逗號分隔)
              </label>
              <input
                type="text"
                className="input-field"
                value={metadata.tags}
                onChange={(e) => setMetadata({ ...metadata, tags: e.target.value })}
                placeholder="例如：weverse, live, idol"
              />
            </div>
          </div>

          <div style={{ marginBottom: '1.75rem' }}>
            <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 600, marginBottom: '0.35rem' }}>
              影片說明 (Description)
              <span style={{ float: 'right', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {metadata.description.length}/5000
              </span>
            </label>
            <textarea
              className="input-field"
              rows={3}
              maxLength={5000}
              value={metadata.description}
              onChange={(e) => setMetadata({ ...metadata, description: e.target.value })}
              placeholder="輸入影片詳細說明內容..."
              style={{ width: '100%', resize: 'vertical' }}
            />
          </div>

          {/* Subtitles review section */}
          <div style={{ marginBottom: '1.75rem' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '0.75rem',
              }}
            >
              <div>
                <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  字幕軌清單與語言對照
                  <span style={{ fontSize: '0.82rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>
                    (已勾選 {enabledSubsCount} / {subtitles.length} 軌)
                  </span>
                </h4>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => handleToggleAllSubs(true)}>
                  全選
                </button>
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => handleToggleAllSubs(false)}>
                  全消
                </button>
              </div>
            </div>

            {subtitles.length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                此資料夾中未偵測到任何 .vtt 或 .srt 字幕檔案。
              </div>
            ) : (
              <div style={{ overflowX: 'auto', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                  <thead>
                    <tr
                      style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        textAlign: 'left',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                      }}
                    >
                      <th style={{ padding: '0.75rem 1rem', width: '50px' }}>上傳</th>
                      <th style={{ padding: '0.75rem 1rem' }}>原字幕檔名 / 偵測代碼</th>
                      <th style={{ padding: '0.75rem 1rem' }}>YouTube 語言代碼 (BCP-47)</th>
                      <th style={{ padding: '0.75rem 1rem' }}>字幕軌顯示名稱 (Label)</th>
                      <th style={{ padding: '0.75rem 1rem', width: '90px' }}>大小</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subtitles.map((sub) => (
                      <tr
                        key={sub.id}
                        style={{
                          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                          background: sub.enabled ? 'transparent' : 'rgba(0, 0, 0, 0.2)',
                          opacity: sub.enabled ? 1 : 0.6,
                        }}
                      >
                        <td style={{ padding: '0.6rem 1rem', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={sub.enabled}
                            onChange={() => handleToggleSub(sub.id)}
                            style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                          />
                        </td>
                        <td style={{ padding: '0.6rem 1rem' }}>
                          <div style={{ fontWeight: 500 }}>{sub.filename}</div>
                          <span style={{ fontSize: '0.78rem', color: 'var(--accent)' }}>
                            代碼：{sub.raw_lang || '未知'}
                          </span>
                        </td>
                        <td style={{ padding: '0.6rem 1rem' }}>
                          <input
                            type="text"
                            className="input-field input-sm"
                            value={sub.bcp47}
                            disabled={!sub.enabled}
                            onChange={(e) => handleSubChange(sub.id, 'bcp47', e.target.value)}
                            list="bcp47-suggestions"
                            style={{ width: '120px' }}
                          />
                        </td>
                        <td style={{ padding: '0.6rem 1rem' }}>
                          <input
                            type="text"
                            className="input-field input-sm"
                            value={sub.label}
                            disabled={!sub.enabled}
                            onChange={(e) => handleSubChange(sub.id, 'label', e.target.value)}
                            style={{ width: '100%', maxWidth: '240px' }}
                          />
                        </td>
                        <td style={{ padding: '0.6rem 1rem', color: 'var(--text-muted)' }}>{sub.size_formatted}</td>
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
          <div
            style={{
              background: 'rgba(var(--accent-rgb), 0.07)',
              border: '1px solid rgba(var(--accent-rgb), 0.25)',
              borderRadius: '8px',
              padding: '1rem',
              marginBottom: '1.75rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '1rem',
            }}
          >
            <div>
              <div
                style={{ fontWeight: 600, fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <Clock size={16} color="var(--accent)" /> YouTube API 配額預估消耗：{estimatedQuota.toLocaleString()}{' '}
                單位
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                影片上傳：1,600 單位 · 字幕上傳：{enabledSubsCount} 軌 × 400 單位 ={' '}
                {(enabledSubsCount * 400).toLocaleString()} 單位
              </div>
            </div>

            {estimatedQuota >= 8000 && (
              <span className="badge badge-warning" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <AlertTriangle size={14} /> 接近 YouTube 每日預設上限 (10,000)
              </span>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
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
        <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center' }}>
          <Loader2 size={48} color="var(--primary)" className="animate-spin" style={{ margin: '0 auto 1.25rem' }} />
          <h3 style={{ margin: '0 0 0.5rem 0' }}>影片與字幕正在上傳至 YouTube...</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', margin: '0 0 1.5rem 0' }}>
            {taskStatus.current_step || '處理中，請勿關閉視窗...'}
          </p>

          {/* Progress bar */}
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              borderRadius: '999px',
              height: '14px',
              maxWidth: '500px',
              margin: '0 auto 1.5rem',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                background: 'linear-gradient(90deg, var(--primary), var(--accent))',
                height: '100%',
                width: `${taskStatus.progress_percent || 0}%`,
                transition: 'width 0.4s ease',
              }}
            />
          </div>

          <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--primary)' }}>
            {taskStatus.progress_percent || 0}%
          </div>
        </div>
      )}

      {/* 5. Step: Completed View */}
      {viewStep === 'completed' && taskStatus && (
        <div className="glass-panel" style={{ padding: '2.5rem 2rem', textAlign: 'center' }}>
          <CheckCircle2 size={54} color="var(--success)" style={{ margin: '0 auto 1rem' }} />
          <h2 style={{ margin: '0 0 0.5rem 0' }}>上傳成功！</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', margin: '0 0 1.75rem 0' }}>
            影片「{taskStatus.title}」已順利發布，並已掛載多語系字幕。
          </p>

          <div
            style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap' }}
          >
            {taskStatus.video_url && (
              <a
                href={taskStatus.video_url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
              >
                在 YouTube 開啟影片 <ExternalLink size={16} />
              </a>
            )}
            {taskStatus.studio_url && (
              <a
                href={taskStatus.studio_url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
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
