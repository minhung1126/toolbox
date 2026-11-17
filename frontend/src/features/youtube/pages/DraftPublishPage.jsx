import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PATHS } from '../../../routes/paths';
import { Button } from '../../../shared/ui';
import ConfirmDialog from '../../../components/ConfirmDialog';
import ResultStatus from '../../../components/ResultStatus';
import YouTubeVideoEditDialog from '../../../components/YouTubeVideoEditDialog';
import VideoThumbnail from '../../../components/VideoThumbnail';
import { api } from '../../../services/api';
import { draftPublishApi } from '../api/draftPublishApi';
import { normalizeYoutubePlaylistInput } from '../model/playlistInput';
import { getYoutubeAuthContext } from '../model/routing';
import { currentDraftContext, loadPublishDraft, savePublishDraft } from '../model/draftPublishStorage';
import '../youtube-shared.css';
import '../draft-publish.css';

export default function DraftPublishPage({ authUser, sysSettings, videoType = 'Video' }) {
  const account = authUser?.sub || authUser?.email || '';
  const auth = getYoutubeAuthContext(authUser);
  return (
    <DraftEditor
      key={`${account}:${auth.channelId}:${videoType}`}
      account={account}
      auth={auth}
      videoType={videoType}
      sysSettings={sysSettings}
    />
  );
}

function DraftEditor({ account, auth, videoType, sysSettings }) {
  const backPath = videoType === 'Shorts' ? PATHS.youtubeShortsDrafts : PATHS.youtubeVideoDrafts;
  const [initial] = useState(() => {
    try {
      return { draft: loadPublishDraft(account, auth.channelId, videoType), error: '' };
    } catch (error) {
      return { draft: null, error: error.message };
    }
  });
  const [draft, setDraft] = useState(initial.draft);
  const [error, setError] = useState(initial.error);
  const [saveError, setSaveError] = useState('');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);
  const editingVideo = useMemo(
    () => (editingIndex === null || !draft ? null : draft.edits[editingIndex]),
    [draft, editingIndex]
  );
  const requestLock = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  let contextChanged = false;
  try {
    const context = currentDraftContext(account, videoType, auth.channelId);
    contextChanged = Boolean(draft && context && context !== draft.context);
  } catch {
    contextChanged = true;
  }
  const playlistChanged = Boolean(
    draft &&
    sysSettings?.default_playlist_id &&
    normalizeYoutubePlaylistInput(sysSettings.default_playlist_id) !==
      normalizeYoutubePlaylistInput(draft.source.playlist_id)
  );
  const blocked = contextChanged || playlistChanged || !auth.authenticated;
  const hasUnknownResult = draft?.result?.results.some((item) => item.status === 'needs_reconciliation');
  const locked = busy || Boolean(draft?.pending) || hasUnknownResult;
  const results = new Map((draft?.result?.results || []).map((item) => [item.video_id, item]));
  const validation = (draft?.edits || []).map((edit) =>
    edit.skip
      ? ''
      : !edit.title.trim()
        ? '標題不得為空。'
        : Array.from(edit.title).length > 100
          ? '標題最多 100 字元。'
          : Array.from(edit.description).length > 5000
            ? '描述最多 5,000 字元。'
            : ''
  );
  const invalid = validation.some(Boolean);

  const persist = (next) => {
    setDraft(next);
    try {
      savePublishDraft(next);
      setSaveError('');
      setSaved(true);
      return true;
    } catch {
      setSaved(false);
      setSaveError('暫存尚未保存：瀏覽器儲存空間不足或儲存權限已停用。請保留此頁並重試保存。');
      return false;
    }
  };
  const updateEdit = (index, patch) => {
    if (locked || blocked || results.get(draft.edits[index].video_id)?.status === 'succeeded') return false;
    setPreview(null);
    setConfirmOpen(false);
    return persist({ ...draft, edits: draft.edits.map((edit, i) => (i === index ? { ...edit, ...patch } : edit)) });
  };
  const payload = () => ({
    stage_token: draft.stage_token,
    stage_snapshot: draft.stage_snapshot,
    edits: draft.edits.map((edit) =>
      results.get(edit.video_id)?.status === 'succeeded' ? { ...edit, skip: true } : edit
    ),
  });
  const checkPreview = async () => {
    if (requestLock.current || blocked || locked || invalid || saveError) return;
    requestLock.current = true;
    setBusy(true);
    setError('');
    try {
      const response = await draftPublishApi.preview(payload());
      if (mounted.current) setPreview(response);
    } catch (caught) {
      if (mounted.current) {
        setPreview(null);
        setError(`${caught.message} 請保留手動內容，返回人物指定核對來源或重建暫存。`);
      }
    } finally {
      requestLock.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const publish = async () => {
    if (requestLock.current || blocked || locked || invalid || !preview || saveError) return;
    requestLock.current = true;
    setBusy(true);
    setError('');
    const request = {
      ...payload(),
      request_id: crypto.randomUUID(),
      youtube_slot: preview.preview_snapshot.youtube_slot,
      preview_token: preview.preview_token,
      preview_snapshot: preview.preview_snapshot,
    };
    const next = { ...draft, pending: request };
    if (!persist(next)) {
      requestLock.current = false;
      setBusy(false);
      return;
    }
    try {
      const result = await draftPublishApi.publish(request);
      if (!mounted.current) return;
      // Successful rows remain locked and skipped in later submissions from this stage.
      const merged = new Map(
        (draft.result?.results || []).filter((item) => item.status === 'succeeded').map((item) => [item.video_id, item])
      );
      result.results.forEach((item) => {
        if (!merged.has(item.video_id)) merged.set(item.video_id, item);
      });
      persist({ ...draft, pending: undefined, result: { ...result, results: [...merged.values()] } });
      setPreview(null);
    } catch (caught) {
      if (!mounted.current) return;
      // An HTTP validation rejection has not written anything; transport/contract failures remain locked.
      if (
        caught.status >= 400 &&
        caught.status < 500 &&
        !['operation_requires_reconciliation', 'operation_input_changed'].includes(caught.code)
      ) {
        persist({ ...draft, pending: undefined });
      }
      setPreview(null);
      setError(`${caught.message} 如結果不明，請先唯讀核對；暫存與手動修改仍保留。`);
    } finally {
      requestLock.current = false;
      if (mounted.current) {
        setBusy(false);
        setConfirmOpen(false);
      }
    }
  };
  const reconcile = async () => {
    if (requestLock.current || blocked) return;
    requestLock.current = true;
    setBusy(true);
    setError('');
    try {
      const list = await api.getOperations();
      const operation = list.operations.find(
        (op) =>
          op.kind === 'youtube.metadata_publish' && op.plan?.stage_snapshot?.stage_id === draft.stage_snapshot.stage_id
      );
      if (!operation) throw new Error('尚未找到已受理的作業。請稍後再核對或至作業紀錄檢查，避免重送。');
      const checked = await api.reconcileOperation(operation.id, operation.kind);
      if (!mounted.current) return;
      const result = checked.result;
      if (!result && checked.state === 'failed_before_write' && checked.items?.length === 0) {
        persist({ ...draft, pending: undefined });
        setPreview(null);
        setError('已確認尚未嘗試寫入。手動內容仍保留，可重新檢查變更與配額。');
        return;
      }
      const stillUnknown = checked.items?.some((item) => ['running', 'needs_reconciliation'].includes(item.state));
      if (result) {
        const succeeded = new Map(
          (draft.result?.results || [])
            .filter((item) => item.status === 'succeeded')
            .map((item) => [item.video_id, item])
        );
        result.results.forEach((item) => {
          if (!succeeded.has(item.video_id)) {
            const edit = draft.edits.find((candidate) => candidate.video_id === item.video_id);
            succeeded.set(
              item.video_id,
              item.status === 'succeeded' && (edit?.title !== item.title || edit?.description !== item.description)
                ? { ...item, status: 'failed', reason: '先前版本已寫入；目前手動修改尚未發布，請保留內容並重建暫存。' }
                : item
            );
          }
        });
        persist({
          ...draft,
          result: { ...result, operation_id: operation.id, results: [...succeeded.values()] },
          pending: stillUnknown ? draft.pending : undefined,
        });
      }
      setPreview(null);
      if (stillUnknown || !result) setError('部分結果仍待核對，請至作業紀錄查看；不會自動重送。');
    } catch (caught) {
      if (mounted.current) setError(caught.message);
    } finally {
      requestLock.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <div className="section-gap draft-publish-page">
      <header className="page-header">
        <h1>{videoType} 發布前暫存編輯</h1>
        <p className="section-desc">暫存與手動編輯不會寫入 YouTube。檢查變更後，最後確認才會編輯並設為公開。</p>
        <nav className="page-actions" aria-label="暫存影片類型">
          <Link to={PATHS.youtubeVideoStaging} aria-current={videoType === 'Video' ? 'page' : undefined}>
            Video 暫存
          </Link>
          <Link to={PATHS.youtubeShortsStaging} aria-current={videoType === 'Shorts' ? 'page' : undefined}>
            Shorts 暫存
          </Link>
        </nav>
        <div className="page-actions">
          <Link to={backPath}>返回人物指定／重建暫存</Link>
          <Link to={PATHS.operations}>作業紀錄與唯讀核對</Link>
        </div>
      </header>
      <YouTubeVideoEditDialog
        video={editingVideo}
        dialogTitle="編輯發布前暫存"
        saveLabel="儲存暫存"
        notice={saveError || '只儲存此瀏覽器的暫存；最後確認編輯並公開前，不會寫入 YouTube。'}
        saving={busy}
        saveDisabled={locked || blocked}
        confirmDiscard
        onClose={() => setEditingIndex(null)}
        onSave={(patch) => {
          if (updateEdit(editingIndex, patch)) setEditingIndex(null);
        }}
      />
      {error && (
        <p role="alert" className="error-banner">
          {error}
        </p>
      )}
      {saveError && (
        <div role="alert">
          <p>{saveError}</p>
          <Button onClick={() => persist(draft)}>重試保存暫存</Button>
        </div>
      )}
      {!draft ? (
        <p>目前帳號與頻道沒有 {videoType} 暫存，請返回人物指定產生暫存結果。</p>
      ) : (
        <>
          <div className="glass-panel card-padding card-stack">
            <p>
              頻道：{draft.stage_snapshot.youtube_channel_id} · 工作表：{draft.source.worksheet_name} ·{' '}
              {draft.edits.length} 支影片
            </p>
            <p role="status">
              {saved ? '手動修改已保存於此瀏覽器' : '已恢復此瀏覽器的暫存'} · 暫存／尚未發布與已寫入 YouTube
              的結果分別顯示於每支影片。
            </p>
            {blocked && (
              <p role="alert">
                資料來源、人物指定、影片清單或授權頻道已變更。請返回人物指定核對並重建暫存，現有手動內容仍保留。
              </p>
            )}
            {draft.pending && <p role="alert">發布請求已送出，結果待核對。編輯與再次發布已暫停。</p>}
            {(draft.pending || draft.result) && (
              <Button variant="secondary" disabled={busy || blocked} onClick={reconcile}>
                唯讀核對發布結果
              </Button>
            )}
          </div>
          <div className="draft-publish-list">
            {draft.stage_snapshot.plan.map((item, index) => {
              const edit = draft.edits[index];
              const result = results.get(item.video_id);
              const succeeded = result?.status === 'succeeded';
              const disabled = locked || blocked || succeeded || item.status === 'skipped';
              return (
                <article
                  key={item.video_id}
                  className="glass-panel draft-publish-card"
                  aria-label={`暫存影片 ${item.video_id}`}
                >
                  <div className="draft-publish-heading">
                    <VideoThumbnail
                      className="draft-publish-thumbnail"
                      src={item.thumbnailUrl}
                      videoId={item.video_id}
                      alt={item.currentTitle}
                    />
                    <div className="draft-publish-copy">
                      <h2>
                        {index + 1}. {edit.title || item.currentTitle || item.video_id}
                      </h2>
                      <div className="draft-publish-metadata text-muted">
                        <span>
                          {videoType} · {item.person || '未指定人物'}
                        </span>
                        <a
                          href={`https://youtu.be/${encodeURIComponent(item.video_id)}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          YouTube · {item.video_id}
                        </a>
                      </div>
                      <p>
                        {result ? (
                          <>
                            <ResultStatus status={result.status} />{' '}
                            <span>{succeeded ? '已寫入 YouTube' : result.reason}</span>
                          </>
                        ) : edit.skip || item.status === 'skipped' ? (
                          '略過／尚未發布'
                        ) : (
                          '暫存／尚未發布'
                        )}
                        {' · '}
                        {edit.skip || item.status === 'skipped'
                          ? `維持 ${item.currentPrivacy}`
                          : succeeded
                            ? '公開'
                            : '預計公開'}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={disabled || edit.skip}
                      onClick={() => setEditingIndex(index)}
                    >
                      編輯
                    </Button>
                  </div>
                  <p className="draft-publish-description" aria-label="預計套用的描述">
                    {edit.description || '（描述空白）'}
                  </p>
                  <details>
                    <summary>原標題／描述與套用人物後內容</summary>
                    <div className="draft-publish-original">
                      <h3>原標題</h3>
                      <p>{item.currentTitle}</p>
                      <h3>原描述</h3>
                      <pre>{item.currentDescription || '（空白）'}</pre>
                      <h3>套用人物後的標題</h3>
                      <p>{item.newTitle}</p>
                      <h3>套用人物後的描述</h3>
                      <pre>{item.newDescription || '（空白）'}</pre>
                    </div>
                  </details>
                  {item.reason && <p>{item.reason}</p>}
                  {validation[index] && (
                    <p id={`draft-error-${index}`} role="alert">
                      {validation[index]}
                    </p>
                  )}
                  <div className="draft-publish-actions">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={disabled}
                      onClick={() => updateEdit(index, { title: item.newTitle, description: item.newDescription })}
                    >
                      還原為套用人物後內容
                    </Button>
                    <label>
                      <input
                        type="checkbox"
                        checked={edit.skip}
                        disabled={disabled}
                        onChange={(event) => updateEdit(index, { skip: event.target.checked })}
                      />{' '}
                      略過此片
                    </label>
                  </div>
                </article>
              );
            })}
          </div>
          {preview && (
            <section className="glass-panel card-padding card-stack" aria-label="最終變更摘要">
              <h2>最終變更摘要</h2>
              <p>
                預估 {preview.quota.projected_units} units：寫入 {preview.quota.write_calls} 次／
                {preview.quota.write_units} units，讀取與驗證 {preview.quota.read_units}{' '}
                units；結果不明時的額外核對另計。
              </p>
              <ul>
                {preview.plan.map((item) => (
                  <li key={item.video_id}>
                    {item.title || item.video_id}：
                    {item.status === 'skipped'
                      ? '略過'
                      : item.parts.length
                        ? `${item.parts.includes('snippet') ? '編輯文字' : ''}${item.parts.length === 2 ? '＋' : ''}${item.parts.includes('status') ? '公開' : ''}，1 次寫入／50 units`
                        : '已符合，無需寫入'}{' '}
                    {item.reason}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <div className="page-actions">
            <Button
              variant="secondary"
              onClick={checkPreview}
              disabled={locked || blocked || invalid || Boolean(saveError)}
            >
              檢查變更與配額
            </Button>
            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={
                locked ||
                blocked ||
                invalid ||
                !preview ||
                Boolean(saveError) ||
                !preview.plan.some((item) => item.parts.length)
              }
            >
              確認編輯並公開
            </Button>
          </div>
          <p className="text-muted">本流程不會移出 To-Post 清單；需要清理時請使用既有「發布並清理」功能。</p>
          <ConfirmDialog
            open={confirmOpen && !blocked}
            title={`確認編輯並公開 ${preview?.quota.write_calls || 0} 支影片？`}
            message={`將使用目前最終標題與描述，並將選取影片設為公開。預估寫入 ${preview?.quota.write_units || 0} units，讀取與核對另計。`}
            confirmText="確認編輯並公開"
            variant="destructive"
            busy={busy}
            onCancel={() => setConfirmOpen(false)}
            onConfirm={publish}
          />
        </>
      )}
    </div>
  );
}
