import React, { useRef, useState } from 'react';
import Dialog from '../../../components/Dialog';
import { Button } from '../../../shared/ui';

export default function MovePhotoDialog({ photo, posts, onMove, onClose }) {
  const source = posts.find((post) => post.photoIds.includes(photo.id));
  const currentPosition = source ? source.photoIds.indexOf(photo.id) + 1 : null;
  const [postId, setPostId] = useState(source?.id || posts[0].id);
  const [position, setPosition] = useState(String(currentPosition || 1));
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const target = posts.find((post) => post.id === postId);
  const maxPosition = target.photoIds.filter((id) => id !== photo.id).length + 1;
  const valid = /^\d+$/.test(position) && Number(position) >= 1 && Number(position) <= maxPosition;

  return (
    <Dialog
      open
      titleId="move-photo-title"
      descriptionId="move-photo-description"
      initialFocusRef={inputRef}
      onEscape={onClose}
      onBackdropClick={onClose}
      className="card-padding curator-move-dialog"
    >
      <form
        className="section-gap"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (!valid || !onMove(photo.id, postId, Number(position))) {
            setError(`請輸入 1–${maxPosition} 的整數。`);
            return;
          }
          onClose();
        }}
      >
        <h3 id="move-photo-title">移動到指定序號</h3>
        <p id="move-photo-description">
          {photo.name} ·{' '}
          {source ? `${source.title} 目前第 ${currentPosition} / ${source.photoIds.length} 張` : '目前在待分配池'}
        </p>
        <div className="form-group">
          <label className="form-label" htmlFor="move-photo-post">
            目標貼文
          </label>
          <select
            className="form-select"
            id="move-photo-post"
            value={postId}
            onChange={(event) => {
              setPostId(event.target.value);
              setPosition('1');
              setError('');
            }}
          >
            {posts.map((post) => (
              <option key={post.id} value={post.id}>
                {post.title}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="move-photo-position">
            目標序號（1–{maxPosition}）
          </label>
          <input
            ref={inputRef}
            className="form-input"
            id="move-photo-position"
            type="number"
            inputMode="numeric"
            min="1"
            max={maxPosition}
            step="1"
            value={position}
            aria-invalid={!valid}
            aria-describedby={error ? 'move-photo-error' : undefined}
            onChange={(event) => {
              setPosition(event.target.value);
              setError('');
            }}
          />
          {error && (
            <p id="move-photo-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <p className="text-muted">照片會插入指定位置，其餘照片依序移動；第 1 張會成為封面。</p>
        <div className="page-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button type="submit" disabled={!valid}>
            確認移動
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
