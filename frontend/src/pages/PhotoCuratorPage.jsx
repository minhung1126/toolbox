import { Button } from '../shared/ui';
import React, { useState } from 'react';
import {
  GripVertical,
  Undo2,
  Check,
  Clock,
  Copy,
  Download,
  Grid3X3,
  HelpCircle,
  Image as ImageIcon,
  LayoutGrid,
  MoveDown,
  MoveUp,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Star,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { useToast } from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import Dialog from '../components/Dialog';
import CuratorThumbnail from '../components/curator/CuratorThumbnail';
import IgSlotImage from '../components/curator/IgSlotImage';
import { usePhotoCuratorWorkflow } from '../features/photo-curator/hooks/usePhotoCuratorWorkflow';
import '../features/photo-curator/photo-curator.css';

const THUMBNAIL_SIZES = [
  { key: 'compact', label: '最小', pixels: 40 },
  { key: 'small', label: '小', pixels: 64 },
  { key: 'medium', label: '中', pixels: 96 },
  { key: 'large', label: '大', pixels: 144 },
  { key: 'xlarge', label: '最大', pixels: 192 },
];

export default function PhotoCuratorPage() {
  const toast = useToast();
  const [thumbnailSizeIndex, setThumbnailSizeIndex] = useState(1);
  const thumbnailSize = THUMBNAIL_SIZES[thumbnailSizeIndex];
  const {
    fileInputRef,
    photos,
    unassignedIds,
    posts,
    setPosts,
    draggedPhotoId,
    dragOverZone,
    dropPosition,
    previousArrangement,
    undoArrangement,
    autoConfirmOpen,
    setAutoConfirmOpen,
    exporting,
    resetConfirmOpen,
    setResetConfirmOpen,
    previewPhoto,
    setPreviewPhoto,
    showHelp,
    setShowHelp,
    photoMap,
    handleFilesSelected,
    handleDropzoneDrop,
    assignPhotoToPost,
    returnPhotoToUnassigned,
    deletePhoto,
    setAsCover,
    movePhotoInPost,
    handleAutoDistribute,
    handleResetConfirm,
    handleCopyChecklist,
    handleExportZip,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragOverPhoto,
    handleDragLeave,
    handleDropOnZone,
    coverPhotos,
  } = usePhotoCuratorWorkflow({ toast });

  const assignedCount = photos.length - unassignedIds.length;

  return (
    <div className="section-gap photo-curator-page">
      {/* Header */}
      <header className="glass-panel page-header card-padding">
        <div className="badge badge-info dashboard-eyebrow">
          <Sparkles size={14} aria-hidden="true" /> Instagram 創作工具
        </div>
        <div className="photo-curator-header-row">
          <div>
            <h1>貼文三部曲排版工作台</h1>
            <p className="section-desc">匯入照片、分成三篇，再拖曳調整每篇順序。第一張就是封面，排好後即可下載。</p>
          </div>
          <Button
            variant="secondary"
            type="button"
            className="btn btn-secondary btn-icon"
            onClick={() => setShowHelp(!showHelp)}
            title="貼文排版與使用說明"
            aria-label="說明"
            aria-expanded={showHelp}
          >
            <HelpCircle size={18} aria-hidden="true" />
          </Button>
        </div>

        {showHelp && (
          <div className="photo-curator-help-panel">
            <div className="help-panel-header">
              <strong>💡 貼文三部曲排版建議</strong>
              <button type="button" className="btn btn-icon" onClick={() => setShowHelp(false)}>
                <X size={14} />
              </button>
            </div>
            <p>
              將一次出遊或活動的照片拆成 3 篇 IG 貼文時，建議每篇各放數張照片並依序排列。
              確保三篇貼文的首圖風格相互呼應，在個人首頁並列時呈現具整體感的三聯排視覺效果！
            </p>
          </div>
        )}
      </header>

      <ol className="curator-workflow-steps" aria-label="排版流程">
        <li className={photos.length ? 'is-complete' : 'is-current'}>1 匯入照片</li>
        <li className={photos.length && !unassignedIds.length ? 'is-complete' : photos.length ? 'is-current' : ''}>
          2 分組與排序
        </li>
        <li className={assignedCount && !unassignedIds.length ? 'is-current' : ''}>3 檢查封面與下載</li>
      </ol>

      {/* Upload Dropzone */}
      <div
        className={`glass-panel photo-dropzone ${dragOverZone === 'dropzone' ? 'is-drag-over' : ''}`}
        onDragOver={(e) => handleDragOver(e, 'dropzone')}
        onDragLeave={(e) => handleDragLeave(e, 'dropzone')}
        onDrop={handleDropzoneDrop}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
      >
        <input
          type="file"
          ref={fileInputRef}
          multiple
          accept="image/*"
          hidden
          onChange={(e) => handleFilesSelected(e.target.files)}
        />
        <div className="dropzone-content">
          <div className="dropzone-icon">
            <UploadCloud size={32} />
          </div>
          <div>
            <h4>點擊或拖放照片至此處匯入</h4>
            <p className="text-muted">
              支援多選 JPG、PNG、WebP 照片。照片會先進入「待分配防漏池」。本頁照片暫存於目前頁面，重新整理後會清空。
            </p>
          </div>
        </div>
        <div className="dropzone-stats">
          <span className="badge badge-info">已匯入：{photos.length} 張</span>
          <span className={`badge ${unassignedIds.length > 0 ? 'badge-warning' : 'badge-success'}`}>
            待分配：{unassignedIds.length} 張
          </span>
        </div>
      </div>

      {/* Toolbar & Action Bar */}
      <div className="photo-curator-toolbar glass-panel">
        <div className="toolbar-left">
          <Button variant="secondary" size="sm" onClick={undoArrangement} disabled={!previousArrangement}>
            <Undo2 size={14} aria-hidden="true" /> 復原上一步
          </Button>
          <Button
            variant="secondary"
            size="sm"
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => (assignedCount ? setAutoConfirmOpen(true) : handleAutoDistribute())}
            disabled={photos.length === 0}
            title="依檔案修改時間均分為三篇（不是照片拍攝時間）"
          >
            <Clock size={14} aria-hidden="true" />
            <span>按時間均分</span>
          </Button>

          <Button
            variant="secondary"
            size="sm"
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleCopyChecklist}
            disabled={photos.length === 0}
            title="複製發布對照文字表"
          >
            <Copy size={14} aria-hidden="true" />
            <span>複製對照表</span>
          </Button>
        </div>

        <div className="toolbar-right">
          <Button
            variant="primary"
            size="sm"
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleExportZip}
            disabled={exporting || assignedCount === 0}
            title="下載自動建立資料夾與編號命名的 ZIP"
          >
            {exporting ? (
              <RefreshCw size={14} className="spin" aria-hidden="true" />
            ) : (
              <Download size={14} aria-hidden="true" />
            )}
            <span>下載分組照片 (ZIP)</span>
          </Button>

          {photos.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              type="button"
              className="btn btn-secondary btn-sm text-danger"
              onClick={() => setResetConfirmOpen(true)}
              title="清空所有照片與分組"
            >
              <RotateCcw size={14} aria-hidden="true" />
              <span>清空重置</span>
            </Button>
          )}
        </div>

        <div className="curator-thumbnail-size-control">
          <div className="curator-thumbnail-size-summary">
            <label htmlFor="curator-thumbnail-size">縮圖大小</label>
            <span className="badge badge-info" aria-hidden="true">
              {thumbnailSize.label} · {thumbnailSize.pixels}px
            </span>
            <p id="curator-thumbnail-size-hint">縮小方便排序，放大查看照片細節。</p>
          </div>
          <div className="curator-thumbnail-size-slider">
            <input
              id="curator-thumbnail-size"
              type="range"
              min="0"
              max={THUMBNAIL_SIZES.length - 1}
              step="1"
              value={thumbnailSizeIndex}
              onChange={(e) => setThumbnailSizeIndex(Number(e.target.value))}
              aria-valuetext={`${thumbnailSize.label}縮圖，${thumbnailSize.pixels} 像素`}
              aria-describedby="curator-thumbnail-size-hint"
            />
            <div className="curator-thumbnail-size-steps" role="group" aria-label="縮圖大小分段">
              {THUMBNAIL_SIZES.map((size, index) => (
                <button
                  key={size.key}
                  type="button"
                  aria-label={`${size.label}縮圖`}
                  aria-pressed={thumbnailSizeIndex === index}
                  onClick={() => setThumbnailSizeIndex(index)}
                >
                  {size.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <p className="curator-arrangement-status" role="status">
        已分配 {assignedCount} / {photos.length}{' '}
        張。拖曳照片到卡片上半部或下半部，可插入指定位置；也可使用前後移動按鈕。
        {unassignedIds.length > 0 && ' 尚未分配的照片不會包含在 ZIP 中。'}
      </p>

      {/* Main Workbench Layout: Left Unassigned Pool, Right 3 Post Columns */}
      <div
        className={`curator-workbench-grid${thumbnailSizeIndex >= 2 ? ' curator-workbench-visual' : ''}`}
        data-thumbnail-size={thumbnailSize.key}
      >
        {/* Left: Unassigned Pool */}
        <div
          className={`glass-panel unassigned-pool-panel ${unassignedIds.length === 0 ? 'is-empty' : ''} ${dragOverZone === 'unassigned' ? 'is-drag-over' : ''}`}
          onDragOver={(e) => handleDragOver(e, 'unassigned')}
          onDragLeave={(e) => handleDragLeave(e, 'unassigned')}
          onDrop={(e) => handleDropOnZone(e, 'unassigned')}
        >
          <div className="pool-header">
            <div className="pool-header-title">
              <LayoutGrid size={16} className="text-accent" />
              <h4>待分配防漏池</h4>
            </div>
            <span className={`badge ${photos.length && unassignedIds.length === 0 ? 'badge-success' : 'badge-info'}`}>
              {photos.length > 0 && unassignedIds.length === 0 ? (
                <>
                  <Check size={12} /> 已全部分配
                </>
              ) : (
                `剩餘 ${unassignedIds.length} 張`
              )}
            </span>
          </div>

          <p className="pool-desc">拖到任一貼文，或用 + P1／P2／P3 分組。已分組的照片也可以拖回這裡。</p>

          <div className="pool-photo-list">
            {unassignedIds.length === 0 ? (
              <div className="pool-empty-state">
                {photos.length === 0 ? (
                  <>
                    <ImageIcon size={32} className="text-dim" />
                    <p>尚無照片，請先匯入照片。</p>
                  </>
                ) : (
                  <>
                    <Check size={32} className="text-success" />
                    <p>太棒了！所有照片都已妥善分配至三篇貼文中。</p>
                  </>
                )}
              </div>
            ) : (
              unassignedIds.map((photoId) => {
                const photo = photoMap.get(photoId);
                if (!photo) return null;
                return (
                  <div
                    key={photo.id}
                    className={`curator-photo-card ${draggedPhotoId === photo.id ? 'is-dragging' : ''}`}
                    draggable
                    onDragStart={(e) => handleDragStart(e, photo.id)}
                    onDragEnd={handleDragEnd}
                  >
                    <CuratorThumbnail photo={photo} onZoom={setPreviewPhoto} />
                    <div className="photo-card-info">
                      <div className="photo-card-name" title={photo.name}>
                        {photo.name}
                      </div>
                      <div className="photo-card-quick-actions">
                        <button
                          type="button"
                          className="btn-quick-assign"
                          onClick={() => assignPhotoToPost(photo.id, 'post-1')}
                          title="加入 Post 1"
                        >
                          + P1
                        </button>
                        <button
                          type="button"
                          className="btn-quick-assign"
                          onClick={() => assignPhotoToPost(photo.id, 'post-2')}
                          title="加入 Post 2"
                        >
                          + P2
                        </button>
                        <button
                          type="button"
                          className="btn-quick-assign"
                          onClick={() => assignPhotoToPost(photo.id, 'post-3')}
                          title="加入 Post 3"
                        >
                          + P3
                        </button>
                        <button
                          type="button"
                          className="btn-order-action btn-delete-photo"
                          onClick={() => deletePhoto(photo.id)}
                          title="從工作台移除此照片"
                          aria-label={`移除 ${photo.name}`}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Three Post Columns */}
        <div className="posts-columns-grid">
          {posts.map((post, pIdx) => {
            const postPhotos = post.photoIds.map((id) => photoMap.get(id)).filter(Boolean);
            const isOverLimit = postPhotos.length > 10;
            const isDragTarget = dragOverZone === post.id;

            return (
              <div
                key={post.id}
                data-post-id={post.id}
                className={`glass-panel post-column-card ${isDragTarget ? 'is-drag-over' : ''}`}
                onDragOver={(e) => handleDragOver(e, post.id)}
                onDragLeave={(e) => handleDragLeave(e, post.id)}
                onDrop={(e) => handleDropOnZone(e, post.id)}
              >
                {/* Column Header */}
                <div className="post-column-header">
                  <div className="post-column-tag">
                    <span className="post-index-pill">Post {pIdx + 1}</span>
                    <input
                      type="text"
                      className="post-title-input"
                      value={post.title}
                      onChange={(e) => {
                        const val = e.target.value;
                        setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, title: val } : p)));
                      }}
                      title="點擊自訂貼文主題名稱"
                      aria-label={`Post ${pIdx + 1} 主題名稱`}
                    />
                  </div>
                  <div className="post-capacity-row">
                    <span className={`badge ${isOverLimit ? 'badge-danger' : 'badge-info'}`}>
                      {postPhotos.length} / 10 張
                    </span>
                  </div>
                </div>

                {isOverLimit && (
                  <div className="post-limit-warning">⚠️ 超過 IG 單篇 10 張輪播上限，建議篩選或移至其他篇</div>
                )}

                {/* Photos List inside this Post */}
                <div className="post-photo-list">
                  {postPhotos.length === 0 ? (
                    <div className="post-empty-drop-target">
                      <Plus size={24} className="text-dim" />
                      <span>拖曳照片至此處</span>
                      <small>第一張將自動設為封面</small>
                    </div>
                  ) : (
                    postPhotos.map((photo, index) => {
                      const isCover = index === 0;
                      return (
                        <div
                          key={photo.id}
                          className={`curator-photo-card post-item-card ${isCover ? 'is-cover-item' : ''} ${draggedPhotoId === photo.id ? 'is-dragging' : ''} ${dropPosition?.photoId === photo.id ? `drop-${dropPosition.edge}` : ''}`}
                          data-photo-id={photo.id}
                          onDragOver={(e) => handleDragOverPhoto(e, post.id, photo.id)}
                          onDrop={(e) => handleDropOnZone(e, post.id, photo.id)}
                          draggable
                          onDragStart={(e) => handleDragStart(e, photo.id)}
                          onDragEnd={handleDragEnd}
                        >
                          <GripVertical className="photo-drag-grip" size={16} aria-hidden="true" />
                          <CuratorThumbnail photo={photo} onZoom={setPreviewPhoto} />

                          <div className="photo-card-info">
                            <div className="photo-card-header">
                              <div className={`photo-order-badge ${isCover ? 'cover-badge' : ''}`}>
                                {isCover ? (
                                  <>
                                    <Star size={11} className="star-icon" /> #01 封面
                                  </>
                                ) : (
                                  `#${String(index + 1).padStart(2, '0')}`
                                )}
                              </div>
                              <div className="photo-card-name" title={photo.name}>
                                {photo.name}
                              </div>
                            </div>
                            <div className="photo-card-controls">
                              {!isCover && (
                                <button
                                  type="button"
                                  className="btn-order-action set-cover-btn"
                                  onClick={() => setAsCover(post.id, photo.id)}
                                  title="設為本篇首圖 (#01 封面)"
                                >
                                  <Star size={12} />
                                  <span>設為封面</span>
                                </button>
                              )}

                              <div className="reorder-btn-group">
                                <button
                                  type="button"
                                  className="btn-order-action"
                                  disabled={index === 0}
                                  onClick={() => movePhotoInPost(post.id, index, -1)}
                                  title="往前移"
                                  aria-label={`往前移 ${photo.name}`}
                                >
                                  <MoveUp size={12} />
                                </button>
                                <button
                                  type="button"
                                  className="btn-order-action"
                                  disabled={index === postPhotos.length - 1}
                                  onClick={() => movePhotoInPost(post.id, index, 1)}
                                  title="往後移"
                                  aria-label={`往後移 ${photo.name}`}
                                >
                                  <MoveDown size={12} />
                                </button>
                              </div>

                              <select
                                className="photo-move-select"
                                aria-label={`移動 ${photo.name} 至貼文`}
                                value=""
                                onChange={(e) => assignPhotoToPost(photo.id, e.target.value)}
                              >
                                <option value="" disabled>
                                  移至…
                                </option>
                                {posts
                                  .filter((item) => item.id !== post.id)
                                  .map((item) => (
                                    <option key={item.id} value={item.id}>
                                      {item.title}
                                    </option>
                                  ))}
                              </select>

                              <button
                                type="button"
                                className="btn-order-action btn-return-photo"
                                onClick={() => returnPhotoToUnassigned(photo.id)}
                                title="移回待分配池"
                                aria-label={`移回待分配池 ${photo.name}`}
                              >
                                <RotateCcw size={12} />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Instagram 3-Grid Cover Live Preview */}
      <section className="glass-panel ig-preview-section" aria-label="Instagram 主頁首圖橫排預覽">
        <div className="ig-preview-header">
          <div className="ig-preview-title">
            <Grid3X3 size={18} className="text-accent" aria-hidden="true" />
            <h3>Instagram 主頁三聯排效果預覽</h3>
          </div>
          <span className="badge badge-info">依序發布 Post 1、2、3，主頁由左至右顯示 Post 3、2、1</span>
        </div>

        <div className="ig-preview-grid">
          {[...posts].reverse().map((post) => {
            const idx = posts.findIndex((item) => item.id === post.id);
            const cover = coverPhotos[idx];
            return (
              <div key={post.id} className="ig-grid-slot">
                <div className="ig-slot-header">
                  <span className="ig-slot-badge">Post {idx + 1} 封面</span>
                  <span className="ig-slot-title">{post.title.split(' ')[0]}</span>
                </div>
                <div className="ig-slot-image-box">
                  <IgSlotImage cover={cover} onZoom={setPreviewPhoto} idx={idx} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Large Image Preview Modal */}
      <Dialog
        open={Boolean(previewPhoto)}
        className="modal-box photo-preview-modal glass-panel"
        overlayClassName="modal-overlay"
        label={previewPhoto?.name || '圖片預覽'}
        onEscape={() => setPreviewPhoto(null)}
        onBackdropClick={() => setPreviewPhoto(null)}
      >
        {previewPhoto && (
          <>
            <div className="modal-header">
              <h3>{previewPhoto.name}</h3>
              <button
                type="button"
                className="btn btn-icon"
                onClick={() => setPreviewPhoto(null)}
                aria-label="關閉預覽"
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body photo-preview-body">
              <img
                src={previewPhoto.previewUrl}
                alt={previewPhoto.name}
                className="large-preview-image"
                referrerPolicy="no-referrer"
              />
            </div>
          </>
        )}
      </Dialog>

      <ConfirmDialog
        open={autoConfirmOpen}
        title="重新按時間均分？"
        message="這會取代目前的分組、照片順序與封面，並依檔案修改時間重新均分。完成後可用「復原上一步」還原。"
        confirmText="重新均分"
        cancelText="保留目前排版"
        onConfirm={handleAutoDistribute}
        onCancel={() => setAutoConfirmOpen(false)}
      />

      {/* Confirm Reset Dialog */}
      <ConfirmDialog
        open={resetConfirmOpen}
        title="清空工作台"
        message="確定要清空所有已匯入的照片與貼文分組嗎？此操作無法復原。"
        confirmText="確認清空"
        cancelText="取消"
        variant="destructive"
        onConfirm={handleResetConfirm}
        onCancel={() => setResetConfirmOpen(false)}
      />
    </div>
  );
}
