import '../features/youtube/youtube-shared.css';
import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, Pencil, Save, X } from 'lucide-react';
import Dialog from './Dialog';
import ConfirmDialog from './ConfirmDialog';

const TITLE_MAX_LENGTH = 100;
const DESCRIPTION_MAX_LENGTH = 5000;

function youtubeVideoUrl(videoId) {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

export default function YouTubeVideoEditDialog({
  video,
  saving = false,
  onSave,
  onClose,
  dialogTitle = '編輯 YouTube 影片',
  saveLabel = '儲存變更',
  notice = '',
  confirmDiscard = false,
  saveDisabled = false,
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const titleRef = useRef(null);
  const submittingRef = useRef(false);
  const [discardOpen, setDiscardOpen] = useState(false);

  useEffect(() => {
    if (!video) return undefined;
    setTitle(video.title || '');
    setDescription(video.description || '');
    setDiscardOpen(false);
  }, [video]);

  if (!video) return null;

  const titleLength = Array.from(title).length;
  const descriptionLength = Array.from(description).length;
  const validation = !title.trim()
    ? '標題不得為空。'
    : titleLength > TITLE_MAX_LENGTH
      ? '標題最多 100 字元。'
      : descriptionLength > DESCRIPTION_MAX_LENGTH
        ? '描述最多 5,000 字元。'
        : '';
  const canSave = !validation && !saving && !saveDisabled;
  const handleSubmit = (event) => {
    event.preventDefault();
    if (!canSave || submittingRef.current) return;
    submittingRef.current = true;
    let result;
    try {
      result = onSave?.({ title: title.trim(), description });
    } catch (error) {
      submittingRef.current = false;
      throw error;
    }
    Promise.resolve(result).finally(() => {
      submittingRef.current = false;
    });
  };
  const close = () => {
    if (saving) return;
    if (confirmDiscard && (title !== (video.title || '') || description !== (video.description || ''))) {
      setDiscardOpen(true);
      return;
    }
    onClose?.();
  };
  const videoUrl = youtubeVideoUrl(video.video_id);

  return (
    <>
      <Dialog
        open={Boolean(video) && !discardOpen}
        className="youtube-edit-dialog"
        overlayClassName="youtube-edit-overlay"
        titleId="youtube-edit-dialog-title"
        initialFocusRef={titleRef}
        onEscape={close}
        onBackdropClick={close}
        busy={saving}
      >
        <div className="youtube-edit-dialog-header">
          <div>
            <div className="youtube-edit-dialog-heading">
              <Pencil size={20} aria-hidden="true" />
              <h2 id="youtube-edit-dialog-title">{dialogTitle}</h2>
            </div>
            <p className="youtube-edit-dialog-id">影片 ID：{video.video_id}</p>
          </div>
          <button
            type="button"
            className="youtube-edit-dialog-close"
            aria-label="關閉編輯視窗"
            onClick={close}
            disabled={saving}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <form className="youtube-edit-form" onSubmit={handleSubmit}>
          {notice && <p>{notice}</p>}
          <div className="form-group">
            <div className="youtube-edit-label-row">
              <label className="form-label" htmlFor="youtube-edit-title">
                標題
              </label>
              <span className="youtube-edit-counter">
                {titleLength}/{TITLE_MAX_LENGTH}
              </span>
            </div>
            <input
              ref={titleRef}
              id="youtube-edit-title"
              className="form-input"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              aria-invalid={!title.trim() || titleLength > TITLE_MAX_LENGTH}
              aria-describedby={validation ? 'youtube-edit-error' : undefined}
              required
            />
          </div>

          <div className="form-group">
            <div className="youtube-edit-label-row">
              <label className="form-label" htmlFor="youtube-edit-description">
                描述
              </label>
              <span className="youtube-edit-counter">
                {descriptionLength}/{DESCRIPTION_MAX_LENGTH}
              </span>
            </div>
            <textarea
              id="youtube-edit-description"
              className="form-input youtube-edit-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={10}
              aria-invalid={descriptionLength > DESCRIPTION_MAX_LENGTH}
              aria-describedby={validation ? 'youtube-edit-error' : undefined}
            />
          </div>
          {validation && (
            <p id="youtube-edit-error" role="alert">
              {validation}
            </p>
          )}

          <a
            className="youtube-video-link youtube-edit-preview-link"
            href={videoUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink size={15} aria-hidden="true" />
            編輯前後都可在 YouTube 查看影片
          </a>

          <div className="youtube-edit-dialog-actions">
            <button type="button" className="btn btn-secondary" onClick={close} disabled={saving}>
              取消
            </button>
            <button type="submit" className="btn btn-primary" disabled={!canSave}>
              <Save size={16} aria-hidden="true" />
              {saving ? '儲存中…' : saveLabel}
            </button>
          </div>
        </form>
      </Dialog>
      <ConfirmDialog
        open={discardOpen}
        title="捨棄尚未儲存的修改？"
        message="已保存的暫存內容仍會保留。"
        confirmText="捨棄修改"
        cancelText="繼續編輯"
        onCancel={() => setDiscardOpen(false)}
        onConfirm={() => {
          setDiscardOpen(false);
          onClose?.();
        }}
      />
    </>
  );
}
