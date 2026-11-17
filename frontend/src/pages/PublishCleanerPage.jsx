import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '../shared/ui';
import ConfirmDialog from '../components/ConfirmDialog';
import SourceLinkInput from '../components/SourceLinkInput';
import { useToast } from '../components/Toast';
import { publishCleanupApi } from '../features/youtube/api/publishCleanupApi';
import { normalizeYoutubePlaylistInput } from '../features/youtube/api/youtubeBatchApi';
import { getYoutubeAuthContext } from '../features/youtube/model/routing';
import { PATHS } from '../routes/paths';
import '../features/youtube/youtube-shared.css';
import '../features/youtube/publish-cleaner.css';

const privacyLabels = { public: '已公開', private: '私人／排程未公開', unlisted: '不公開', unknown: '無法確認' };
const statusLabels = {
  succeeded: '已移除',
  skipped: '保留',
  failed: '失敗',
  not_attempted: '尚未執行',
  needs_reconciliation: '待核對',
};

export default function PublishCleanerPage({ sysSettings = {}, authUser }) {
  const playlistId = normalizeYoutubePlaylistInput(sysSettings.default_playlist_id || '');
  const auth = getYoutubeAuthContext(authUser);
  const scope = JSON.stringify([authUser?.sub, playlistId, auth]);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const generation = useRef(0);
  const locked = useRef(false);
  const toast = useToast();
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [quota, setQuota] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    generation.current += 1;
    setPreview(null);
    setResult(null);
    setQuota(null);
    setConfirm(false);
    setError('');
    setBusy(false);
    locked.current = false;
    return () => {
      generation.current += 1;
    };
  }, [scope]);

  async function load() {
    if (locked.current || !playlistId || !auth.authenticated) return;
    const requestScope = scope,
      revision = ++generation.current;
    const valid = () => currentScope.current === requestScope && generation.current === revision;
    locked.current = true;
    setBusy(true);
    setError('');
    setConfirm(false);
    setPreview(null);
    setQuota(null);
    setResult(null);
    try {
      const next = await publishCleanupApi.previewCleanup(playlistId);
      if (!valid()) return;
      if (next.youtube_channel_id !== auth.channelId) throw new Error('預覽頻道與目前授權不同，請重新連線。');
      setPreview(next);
      try {
        // Conservative estimate includes retained rows and full playlist pagination.
        const estimate = await publishCleanupApi.estimateQuota({
          operation: 'youtube.publish_cleanup',
          itemCount: next.total_count,
          slot: next.youtube_slot,
        });
        if (valid()) setQuota(estimate);
      } catch {
        /* The signed cleanup plan remains usable when estimation is unavailable. */
      }
    } catch (err) {
      if (valid()) {
        setError(err.message);
        toast.error(err.message);
      }
    } finally {
      if (valid()) {
        locked.current = false;
        setBusy(false);
      }
    }
  }

  async function cleanup() {
    if (locked.current || !preview || !preview.candidate_count || currentScope.current !== scope) return;
    const requestScope = scope,
      revision = generation.current;
    const valid = () => currentScope.current === requestScope && generation.current === revision;
    locked.current = true;
    setBusy(true);
    setError('');
    setConfirm(false);
    try {
      const next = await publishCleanupApi.cleanupPublicItems(playlistId, {
        youtubeSlot: preview.youtube_slot,
        previewToken: preview.preview_token,
        previewSnapshot: preview.preview_snapshot,
      });
      if (!valid()) return;
      setResult(next);
      setPreview(null);
      if (next.completed) toast.success(`已移除 ${next.succeeded_count} 筆清單成員，保留 ${next.skipped_count} 筆。`);
      else toast.warning('清理尚未全部確認，請查看逐項結果並核對。');
    } catch (err) {
      if (valid()) {
        setError(`${err.message} 請至作業紀錄核對已受理結果，再重新預覽。`);
        setPreview(null);
        toast.error(err.message);
      }
    } finally {
      if (valid()) {
        locked.current = false;
        setBusy(false);
      }
    }
  }

  const rows = result?.results || preview?.items || [];
  return (
    <div className="section-gap publish-cleaner-page">
      <header className="page-header">
        <p className="section-desc">③ 清理 To-Post</p>
        <h1>
          <Trash2 size={24} aria-hidden="true" /> 清理 To-Post
        </h1>
        <p className="section-desc">
          核實影片已公開後，移除對應的 To-Post 清單成員。私人、不公開與無法確認的影片會保留。
        </p>
        <Link to={PATHS.youtubeVideoStaging}>② 編輯草稿並公開</Link> ·{' '}
        <Link to={PATHS.operations}>查看作業紀錄／唯讀核對</Link>
      </header>
      {!auth.authenticated && (
        <p role="status">
          請先至 <Link to={PATHS.youtubeConnections}>YouTube 設定連線頻道</Link>。
        </p>
      )}
      <div className="glass-panel card-padding">
        <label htmlFor="cleanup-playlist">共用 To-Post 播放清單</label>
        <SourceLinkInput
          id="cleanup-playlist"
          value={playlistId}
          sourceType="youtube-playlist"
          placeholder="YouTube Playlist ID"
          readOnly
        />
        <p className="section-desc">
          於 <Link to={PATHS.youtubePlaylist}>YouTube 播放清單設定</Link> 管理來源。
        </p>
        <Button onClick={load} disabled={busy || !playlistId || !auth.authenticated}>
          <RefreshCw size={16} aria-hidden="true" /> {busy ? '處理中…' : '讀取 To-Post 播放清單'}
        </Button>
      </div>
      {error && <p role="alert">{error}</p>}
      {preview && (
        <div className="glass-panel card-padding" role="status">
          <p>
            {Object.entries(preview.counts)
              .map(([privacy, count]) => `${privacyLabels[privacy]} ${count} 筆`)
              .join(' · ')}
          </p>
          <p>
            可清理 {preview.candidate_count} 筆清單成員{quota ? ` · 配額保守估計 ${quota.projected_units} units` : ''}
          </p>
          {!preview.candidate_count && <p>目前沒有可清理的已公開影片。可先前往編輯草稿並公開，或稍後重新讀取。</p>}
          <Button onClick={() => setConfirm(true)} disabled={busy || !preview.candidate_count}>
            清理已公開影片
          </Button>
        </div>
      )}
      {result && (
        <div className="glass-panel card-padding" role="status">
          <p>
            已移除 {result.succeeded_count} · 保留 {result.skipped_count} · 失敗 {result.failed_count} · 尚未執行{' '}
            {result.not_attempted_count} · 待核對 {result.needs_reconciliation_count}
          </p>
          {result.quota_blocked && <p>配額中止；已確認的清理成果已保留。</p>}
          {result.operation_id && <Link to={PATHS.operations}>至作業紀錄核對結果</Link>}
        </div>
      )}
      <div className="section-gap">
        {rows.map((row) => (
          <article className="glass-panel card-padding cleanup-item" key={row.playlist_item_id}>
            <h2>{row.title}</h2>
            <p>
              {privacyLabels[row.observed_privacy]} ·{' '}
              {statusLabels[row.status] || (row.candidate ? '待確認清理' : '保留')}
            </p>
            <p>{row.reason}</p>
            <p className="section-desc">
              影片 {row.video_id} · 清單成員 {row.playlist_item_id}
            </p>
            <a
              href={`https://www.youtube.com/watch?v=${encodeURIComponent(row.video_id)}`}
              target="_blank"
              rel="noreferrer"
            >
              在 YouTube 查看影片
            </a>
          </article>
        ))}
      </div>
      <ConfirmDialog
        open={confirm && Boolean(preview)}
        title="確認清理已公開影片"
        message={`只移除預覽中的 ${preview?.candidate_count || 0} 筆清單成員。執行前將再次確認影片已公開。`}
        confirmText="確認清理"
        onConfirm={cleanup}
        onCancel={() => setConfirm(false)}
        busy={busy}
        variant="destructive"
      />
    </div>
  );
}
