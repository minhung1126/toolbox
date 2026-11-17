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
import { parsePublishAcceptance, parsePublishOperation } from '../api/draftPublishOperation';
import { useDraftPublishOperation } from '../hooks/useDraftPublishOperation';
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
  const draftRef = useRef(draft);
  draftRef.current = draft;
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
    draftRef.current = next;
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
  const receiveOperation = (operation) => {
    const current = draftRef.current;
    if (!current) return;
    const merged = new Map(
      (current.result?.results || []).filter((item) => item.status === 'succeeded').map((item) => [item.video_id, item])
    );
    operation.progress.rows.forEach((row) => {
      if (merged.has(row.video_id)) return;
      const edit = current.edits.find((item) => item.video_id === row.video_id);
      merged.set(
        row.video_id,
        row.status === 'succeeded' && (row.title !== edit?.title || row.description !== edit?.description)
          ? { ...row, status: 'failed', reason: '先前版本已寫入；目前手動修改尚未發布，請保留內容並重建暫存。' }
          : row
      );
    });
    const active = ['prepared', 'running'].includes(operation.state);
    const unknown = operation.progress.counts.needs_reconciliation > 0;
    const rows = [...merged.values()];
    persist({
      ...current,
      operation_ref: {
        version: 1,
        operation_id: operation.id,
        request_id: current.pending?.request_id || current.operation_ref?.request_id,
        revision: operation.progress.revision,
      },
      pending: active || unknown ? current.pending : undefined,
      result: {
        operation: 'youtube.metadata_publish',
        operation_id: operation.id,
        completed: rows.every((row) => ['succeeded', 'unchanged', 'skipped'].includes(row.status)),
        results: rows,
      },
    });
    setPreview(null);
  };
  const { operation, pollError, refresh } = useDraftPublishOperation({
    pending: draft?.pending,
    reference: draft?.operation_ref,
    enabled: !blocked,
    onOperation: receiveOperation,
  });

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
    if (
      !persist({
        ...draft,
        pending: request,
        operation_ref: { version: 1, request_id: request.request_id, revision: 0 },
      })
    ) {
      requestLock.current = false;
      setBusy(false);
      return;
    }
    try {
      const accepted = parsePublishAcceptance(await api.submitYoutubePublishJob(request), request);
      if (!mounted.current) return;
      persist({
        ...draftRef.current,
        operation_ref: { version: 1, operation_id: accepted.operation_id, request_id: request.request_id, revision: 0 },
      });
      setPreview(null);
    } catch (caught) {
      if (!mounted.current) return;
      if ([400, 401, 403, 422, 503].includes(caught.status) || caught.code === 'stale_preview')
        persist({ ...draftRef.current, pending: undefined });
      setPreview(null);
      setError(`${caught.message} 受理結果不明時保留原請求 ID，請重新查詢；手動內容仍保留。`);
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
      const current = draftRef.current;
      const id = current.operation_ref?.operation_id || current.result?.operation_id;
      const found = id
        ? await api.getOperation(id)
        : current.pending?.request_id
          ? await api.findYoutubePublishJob(current.pending.request_id)
          : await api.findYoutubePublishStage(current.stage_snapshot.stage_id);
      if (
        !found?.id ||
        found.kind !== 'youtube.metadata_publish' ||
        found.channel_id !== auth.channelId ||
        found.plan?.stage_snapshot?.stage_id !== current.stage_snapshot.stage_id
      )
        throw new Error('作業與目前草稿或頻道不符。');
      const checked = await api.reconcileOperation(found.id, found.kind);
      if (!mounted.current) return;
      const expected = current.pending || {
        stage_token: current.stage_token,
        stage_snapshot: current.stage_snapshot,
        edits: found.plan.edits,
      };
      receiveOperation(parsePublishOperation(checked, expected, found.id));
      refresh();
    } catch (caught) {
      if (mounted.current) setError(caught.message);
    } finally {
      requestLock.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const progress = operation?.progress;

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
      {pollError && (
        <p role="status">
          {pollError}{' '}
          <Button variant="secondary" onClick={refresh}>
            重新查詢進度
          </Button>
        </p>
      )}
      {progress && (
        <section className="glass-panel card-padding" aria-label="發布進度" aria-live="polite">
          <h2>發布進度</h2>
          <p>
            已處理 {progress.total - progress.counts.queued - progress.counts.running}／{progress.total} 支影片
          </p>
          <p>
            等待 {progress.counts.queued} · 執行中 {progress.counts.running} · 成功 {progress.counts.succeeded} · 已符合{' '}
            {progress.counts.unchanged} · 略過 {progress.counts.skipped} · 失敗 {progress.counts.failed} · 尚未執行{' '}
            {progress.counts.not_attempted} · 待核對 {progress.counts.needs_reconciliation}
          </p>
        </section>
      )}
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
            {draft.stage_snapshot.plan.some((item) => item.default_skip) && (
              <Button
                variant="secondary"
                disabled={locked || blocked}
                onClick={() => {
                  setPreview(null);
                  persist({
                    ...draft,
                    edits: draft.edits.map((edit, index) =>
                      draft.stage_snapshot.plan[index].default_skip &&
                      results.get(edit.video_id)?.status !== 'succeeded'
                        ? { ...edit, skip: false }
                        : edit
                    ),
                  });
                }}
              >
                將預設略過影片全部重新納入
              </Button>
            )}
            {draft.pending && <p role="alert">發布請求已送出，正在查詢逐片進度。編輯與再次發布已暫停。</p>}
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
                            {['queued', 'running', 'unchanged'].includes(result.status) ? (
                              { queued: '等待處理', running: '執行中', unchanged: '已符合／無須更新' }[result.status]
                            ) : (
                              <ResultStatus status={result.status} />
                            )}{' '}
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
                  {item.default_skip && <p>{item.skip_reason} 可取消「略過此片」重新編輯。</p>}
                  {item.pending_operations?.length > 0 && <p>此影片有執行中或待核對作業；重新納入仍須先核對。</p>}
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
                !preview.plan.some((item) => item.status !== 'skipped')
              }
            >
              確認編輯並公開
            </Button>
          </div>
          {draft.result?.completed && <Link to={PATHS.youtubePublishCleanup}>前往清理 To-Post</Link>}
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
