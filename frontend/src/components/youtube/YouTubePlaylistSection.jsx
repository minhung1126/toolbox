import React from 'react';
import { CheckCircle2, PlaySquare, RefreshCw, Save } from 'lucide-react';
import SourceLinkInput from '../SourceLinkInput';

export default function YouTubePlaylistSection({
  playlistId,
  handlePlaylistChange,
  playlistAutosaveStatus,
  saveResources,
  pageBusy,
  busyAction,
}) {
  return (
    <form className="glass-panel card-padding settings-card card-stack" onSubmit={saveResources}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h2 className="settings-heading"><PlaySquare size={20} color="var(--secondary)" /> 共用 To-Post 播放清單</h2>
          <p className="section-desc">這是目前帳號所有 YouTube 子頁面共用的 To-Post 播放清單；新上傳、Video、Shorts 與發布草稿流程都會以這個設定為準。</p>
        </div>
        {playlistAutosaveStatus === 'saving' && (
          <span className="badge badge-info"><RefreshCw size={12} className="spin" /> 自動儲存中...</span>
        )}
        {playlistAutosaveStatus === 'saved' && (
          <span className="badge badge-connected"><CheckCircle2 size={12} /> 已自動儲存</span>
        )}
        {playlistAutosaveStatus === 'invalid' && (
          <span className="badge badge-warning">播放清單網址格式不完整</span>
        )}
        {playlistAutosaveStatus === 'error' && (
          <span className="badge badge-disconnected">自動儲存失敗，請手動儲存</span>
        )}
      </div>
      <div className="form-group">
        <label className="form-label"><PlaySquare size={14} /> 共用 To-Post 播放清單</label>
        <SourceLinkInput
          value={playlistId}
          onChange={(event) => handlePlaylistChange(event.target.value)}
          sourceType="youtube-playlist"
          placeholder="YouTube Playlist ID 或網址"
        />
        <p className="section-desc">修改後會自動儲存至目前登入的 Google 帳號；換瀏覽器或重新登入仍可取回。</p>
      </div>
      <div className="page-actions settings-card-actions">
        <button className="btn btn-success" type="submit" disabled={pageBusy}>
          <Save size={18} />{busyAction?.kind === 'playlist' ? '儲存中...' : '儲存預設播放清單'}
        </button>
      </div>
    </form>
  );
}
