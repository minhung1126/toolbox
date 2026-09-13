import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  Clock,
  Copy,
  Download,
  Eye,
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
import JSZip from 'jszip';
import { useToast } from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import Dialog from '../components/Dialog';
import { api } from '../services/api';
import { copyToClipboard } from '../utils/clipboard';

const DEFAULT_PRESET = {
  id: 'theme-perspective',
  name: '主題視角型',
  buckets: [
    { id: 'post-1', title: '空間大景 (Space & Vibe)', default_theme: '空間大景' },
    { id: 'post-2', title: '人物穿搭 (Portrait & Outfit)', default_theme: '人物穿搭' },
    { id: 'post-3', title: '細節美食 (Details & Taste)', default_theme: '細節美食' },
  ],
};

const CHRONOLOGICAL_PRESET = {
  id: 'chronological',
  name: '時序敘事型',
  buckets: [
    { id: 'post-1', title: '啟程破題 (Start & First Look)', default_theme: '啟程破題' },
    { id: 'post-2', title: '核心體驗 (Peak & Highlight)', default_theme: '核心體驗' },
    { id: 'post-3', title: '尾聲收尾 (Night & Wrap-up)', default_theme: '尾聲收尾' },
  ],
};

const THREE_DAYS_PRESET = {
  id: 'three-days',
  name: '三日行程型',
  buckets: [
    { id: 'post-1', title: 'Day 1', default_theme: 'Day 1' },
    { id: 'post-2', title: 'Day 2', default_theme: 'Day 2' },
    { id: 'post-3', title: 'Day 3', default_theme: 'Day 3' },
  ],
};

const FALLBACK_PRESETS = [DEFAULT_PRESET, CHRONOLOGICAL_PRESET, THREE_DAYS_PRESET];

export default function PhotoCuratorPage() {
  const toast = useToast();
  const fileInputRef = useRef(null);

  const [presets, setPresets] = useState(FALLBACK_PRESETS);
  const [selectedPresetId, setSelectedPresetId] = useState('theme-perspective');
  const [photos, setPhotos] = useState([]); // Array of { id, name, file, previewUrl, size, lastModified }
  const [unassignedIds, setUnassignedIds] = useState([]);
  const [posts, setPosts] = useState([
    { id: 'post-1', title: '空間大景 (Space & Vibe)', photoIds: [] },
    { id: 'post-2', title: '人物穿搭 (Portrait & Outfit)', photoIds: [] },
    { id: 'post-3', title: '細節美食 (Details & Taste)', photoIds: [] },
  ]);

  const [draggedPhotoId, setDraggedPhotoId] = useState(null);
  const [dragOverZone, setDragOverZone] = useState(null); // 'unassigned' | 'post-1' | 'post-2' | 'post-3'
  const [exporting, setExporting] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const [showHelp, setShowHelp] = useState(false);

  // Clean up object URLs on unmount
  const photosRef = useRef(photos);
  photosRef.current = photos;
  useEffect(() => {
    return () => {
      photosRef.current.forEach((p) => {
        if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
      });
    };
  }, []);

  // Fetch presets from backend API on mount
  useEffect(() => {
    let mounted = true;
    api.getPhotoCuratorPresets()
      .then((data) => {
        if (mounted && Array.isArray(data) && data.length > 0) {
          setPresets(data);
        }
      })
      .catch((err) => {
        console.warn('Using fallback presets:', err);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Map of photo id -> photo object for quick access
  const photoMap = useMemo(() => {
    const map = new Map();
    photos.forEach((p) => map.set(p.id, p));
    return map;
  }, [photos]);

  // Handle Preset Change
  const handlePresetChange = (presetId) => {
    setSelectedPresetId(presetId);
    const chosen = presets.find((p) => p.id === presetId);
    if (!chosen) return;

    setPosts((prevPosts) =>
      prevPosts.map((post, idx) => {
        const bucketDef = chosen.buckets[idx];
        return {
          ...post,
          title: bucketDef ? bucketDef.title : post.title,
        };
      })
    );
    toast.info(`已切換預設模式為「${chosen.name}」`);
  };

  // Upload/Import Photos
  const handleFilesSelected = (files) => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (!files || files.length === 0) return;

    const fileList = Array.from(files).filter((file) => file.type.startsWith('image/'));
    if (fileList.length === 0) {
      toast.warning('所選檔案中沒有支援的圖片格式。若為 iPhone HEIC 格式請先轉為 JPG。');
      return;
    }

    const newPhotos = fileList.map((file, idx) => {
      const id = `photo_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`;
      return {
        id,
        name: file.name,
        file,
        previewUrl: URL.createObjectURL(file),
        size: file.size,
        lastModified: file.lastModified || Date.now(),
      };
    });

    setPhotos((prev) => [...prev, ...newPhotos]);
    setUnassignedIds((prev) => [...prev, ...newPhotos.map((p) => p.id)]);
    toast.success(`成功匯入 ${newPhotos.length} 張照片至待分配池！`);
  };

  // Drag and Drop files from desktop into dropzone
  const handleDropzoneDrop = (e) => {
    e.preventDefault();
    setDragOverZone(null);
    if (e.dataTransfer?.files?.length > 0) {
      handleFilesSelected(e.dataTransfer.files);
    }
  };

  // Assign photo to a post
  const assignPhotoToPost = useCallback((photoId, targetPostId) => {
    setUnassignedIds((prev) => prev.filter((id) => id !== photoId));
    setPosts((prevPosts) =>
      prevPosts.map((post) => {
        const filtered = post.photoIds.filter((id) => id !== photoId);
        if (post.id === targetPostId) {
          return { ...post, photoIds: [...filtered, photoId] };
        }
        return { ...post, photoIds: filtered };
      })
    );
  }, []);

  // Return photo to unassigned pool
  const returnPhotoToUnassigned = useCallback((photoId) => {
    setPosts((prevPosts) =>
      prevPosts.map((post) => ({
        ...post,
        photoIds: post.photoIds.filter((id) => id !== photoId),
      }))
    );
    setUnassignedIds((prev) => (prev.includes(photoId) ? prev : [photoId, ...prev]));
  }, []);

  // Delete photo completely from workbench
  const deletePhoto = useCallback((photoId) => {
    setPhotos((prev) => {
      const target = prev.find((p) => p.id === photoId);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== photoId);
    });
    setUnassignedIds((prev) => prev.filter((id) => id !== photoId));
    setPosts((prevPosts) =>
      prevPosts.map((post) => ({
        ...post,
        photoIds: post.photoIds.filter((id) => id !== photoId),
      }))
    );
    toast.info('已自策展工作台移除該照片。');
  }, [toast]);

  // Move photo inside post (set as cover or move up/down)
  const setAsCover = useCallback((postId, photoId) => {
    setPosts((prevPosts) =>
      prevPosts.map((post) => {
        if (post.id !== postId) return post;
        const remaining = post.photoIds.filter((id) => id !== photoId);
        return { ...post, photoIds: [photoId, ...remaining] };
      })
    );
    toast.info('已將照片設為該篇首圖 (Cover)！');
  }, [toast]);

  const movePhotoInPost = useCallback((postId, index, direction) => {
    setPosts((prevPosts) =>
      prevPosts.map((post) => {
        if (post.id !== postId) return post;
        const newIds = [...post.photoIds];
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= newIds.length) return post;
        const temp = newIds[index];
        newIds[index] = newIds[targetIndex];
        newIds[targetIndex] = temp;
        return { ...post, photoIds: newIds };
      })
    );
  }, []);

  // Chronological Auto-Distribute
  const handleAutoDistribute = () => {
    if (photos.length === 0) {
      toast.warning('目前尚未匯入任何照片。');
      return;
    }

    // Sort all photos by lastModified
    const sorted = [...photos].sort((a, b) => a.lastModified - b.lastModified);
    const total = sorted.length;
    const basePerPost = Math.floor(total / 3);
    const remainder = total % 3;

    const count1 = basePerPost + (remainder > 0 ? 1 : 0);
    const count2 = basePerPost + (remainder > 1 ? 1 : 0);

    const post1Ids = sorted.slice(0, count1).map((p) => p.id);
    const post2Ids = sorted.slice(count1, count1 + count2).map((p) => p.id);
    const post3Ids = sorted.slice(count1 + count2).map((p) => p.id);

    setPosts((prevPosts) => [
      { ...prevPosts[0], photoIds: post1Ids },
      { ...prevPosts[1], photoIds: post2Ids },
      { ...prevPosts[2], photoIds: post3Ids },
    ]);
    setUnassignedIds([]);
    toast.success(`已依時間軸自動均分：${count1} 張、${count2} 張、${post3Ids.length} 張`);
  };

  // Reset all
  const handleResetConfirm = () => {
    photos.forEach((p) => {
      if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
    });
    setPhotos([]);
    setUnassignedIds([]);
    setSelectedPresetId('theme-perspective');
    const defaultTemplate = presets.find((p) => p.id === 'theme-perspective') || DEFAULT_PRESET;
    setPosts(
      defaultTemplate.buckets.map((b, idx) => ({
        id: b.id || `post-${idx + 1}`,
        title: b.title || b.default_theme,
        photoIds: [],
      }))
    );
    setResetConfirmOpen(false);
    toast.info('策展工作台已重設。');
  };

  // Generate posting checklist text
  const generateChecklistText = useCallback(() => {
    const lines = [
      '# Instagram 貼文三部曲發布對照表',
      `匯出時間：${new Date().toLocaleString()}`,
      `總照片數：${photos.length} 張`,
      '',
    ];

    posts.forEach((post, pIdx) => {
      const postPhotos = post.photoIds.map((id) => photoMap.get(id)).filter(Boolean);
      lines.push(`========================================`);
      lines.push(`【Post ${pIdx + 1}】${post.title}（共 ${postPhotos.length} 張）`);
      lines.push(`========================================`);
      postPhotos.forEach((p, idx) => {
        const coverTag = idx === 0 ? ' [★ 首圖 Cover]' : '';
        const orderNum = String(idx + 1).padStart(2, '0');
        lines.push(`  ${orderNum}. ${p.name}${coverTag}`);
      });
      lines.push(`建議 Hashtags: #Part${pIdx + 1} #Instagram #Daily #Story`);
      lines.push('');
    });

    if (unassignedIds.length > 0) {
      lines.push(`未分配備忘照片（共 ${unassignedIds.length} 張）：`);
      unassignedIds.forEach((id) => {
        const p = photoMap.get(id);
        if (p) lines.push(`  - ${p.name}`);
      });
      lines.push('');
    }

    return lines.join('\n');
  }, [photoMap, photos.length, posts, unassignedIds]);

  // Copy checklist
  const handleCopyChecklist = async () => {
    const text = generateChecklistText();
    const success = await copyToClipboard(text);
    if (success) {
      toast.success('已複製發布對照清單至剪貼簿！');
    } else {
      toast.error('複製失敗，請手動選取。');
    }
  };

  // Export structured ZIP
  const handleExportZip = async () => {
    const assignedCount = posts.reduce((sum, post) => sum + post.photoIds.length, 0);
    if (assignedCount === 0) {
      toast.warning('目前尚未分配任何照片至貼文。');
      return;
    }

    setExporting(true);
    try {
      const zip = new JSZip();

      // Add each post directory
      for (let pIdx = 0; pIdx < posts.length; pIdx += 1) {
        const post = posts[pIdx];
        const postIndex = pIdx + 1;
        const cleanTitle = post.title.replace(/[\\/:*?"<>|]/g, '_').trim();
        const folderName = `Post_${postIndex}_${cleanTitle}`;
        const folder = zip.folder(folderName);

        for (let i = 0; i < post.photoIds.length; i += 1) {
          const photo = photoMap.get(post.photoIds[i]);
          if (!photo || !photo.file) continue;

          const seq = String(i + 1).padStart(2, '0');
          const isCover = i === 0 ? '01_COVER_' : `${seq}_`;
          const fileName = `${isCover}${photo.name}`;

          folder.file(fileName, photo.file);
        }
      }

      // Add checklist text file
      const checklistContent = generateChecklistText();
      zip.file('貼文發布對照清單_Checklist.txt', checklistContent);

      const content = await zip.generateAsync({ type: 'blob' });
      const downloadUrl = URL.createObjectURL(content);
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      const timestamp = new Date().toISOString().slice(0, 10);
      anchor.download = `Instagram_三部曲貼文_${timestamp}.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);

      toast.success('已成功打包下載 ZIP，包含分組資料夾與發布對照清單！');
    } catch (err) {
      console.error('Failed to export zip:', err);
      toast.error(`打包失敗：${err.message || '未知錯誤'}`);
    } finally {
      setExporting(false);
    }
  };

  // HTML5 Drag and drop handlers for photos
  const handleDragStart = (e, photoId) => {
    setDraggedPhotoId(photoId);
    e.dataTransfer.setData('text/plain', photoId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggedPhotoId(null);
    setDragOverZone(null);
  };

  const handleDragOver = (e, zone) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverZone !== zone) setDragOverZone(zone);
  };

  const handleDragLeave = (e, zone) => {
    if (dragOverZone === zone) setDragOverZone(null);
  };

  const handleDropOnZone = (e, zone) => {
    e.preventDefault();
    setDragOverZone(null);
    const photoId = e.dataTransfer.getData('text/plain') || draggedPhotoId;
    if (!photoId) return;

    if (zone === 'unassigned') {
      returnPhotoToUnassigned(photoId);
    } else if (zone.startsWith('post-')) {
      assignPhotoToPost(photoId, zone);
    }
  };

  // Post 1, 2, 3 Covers for IG 3-Grid Preview
  const coverPhotos = useMemo(() => {
    return posts.map((post) => {
      const coverId = post.photoIds[0];
      return coverId ? photoMap.get(coverId) : null;
    });
  }, [photoMap, posts]);

  return (
    <div className="section-gap photo-curator-page">
      {/* Header */}
      <header className="glass-panel page-header">
        <div className="badge badge-info dashboard-eyebrow">
          <Sparkles size={14} aria-hidden="true" /> 創作策展工具
        </div>
        <div className="photo-curator-header-row">
          <div>
            <h1>貼文三部曲策展工作台</h1>
            <p className="section-desc">
              專為 Instagram 打造的批次分組工作台。解決「分組分到忘記」與「順序常常搞混」，支援主題視角分流、首圖橫排預覽與一鍵結構化打包。
            </p>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-icon"
            onClick={() => setShowHelp(!showHelp)}
            title="策展思維與使用說明"
            aria-label="說明"
          >
            <HelpCircle size={18} aria-hidden="true" />
          </button>
        </div>

        {showHelp && (
          <div className="photo-curator-help-panel">
            <div className="help-panel-header">
              <strong>💡 為什麼要分「主題視角三部曲」？</strong>
              <button type="button" className="btn btn-icon" onClick={() => setShowHelp(false)}>
                <X size={14} />
              </button>
            </div>
            <p>
              將一次出遊或活動的幾十張照片拆成 3 篇 IG 貼文時，若每篇都是自拍或大景容易造成視覺疲勞。
              建議採用 <strong>空間大景 (環境氛圍)</strong> ➔ <strong>人物穿搭 (視覺焦點)</strong> ➔ <strong>細節美食 (質感特寫)</strong>，
              每篇各放 6~10 張，並確保首圖風格和諧，在個人首頁並列時呈現高質感的雜誌排版感！
            </p>
          </div>
        )}
      </header>

      {/* Toolbar & Action Bar */}
      <div className="photo-curator-toolbar glass-panel">
        <div className="toolbar-left">
          <label className="toolbar-preset-label">
            <span>策展模型：</span>
            <select
              className="form-select preset-select"
              value={selectedPresetId}
              onChange={(e) => handlePresetChange(e.target.value)}
            >
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleAutoDistribute}
            disabled={photos.length === 0}
            title="根據照片拍攝/修改時間自動均分為三篇"
          >
            <Clock size={14} aria-hidden="true" />
            <span>按時間均分</span>
          </button>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleCopyChecklist}
            disabled={photos.length === 0}
            title="複製發布對照文字表"
          >
            <Copy size={14} aria-hidden="true" />
            <span>複製對照表</span>
          </button>
        </div>

        <div className="toolbar-right">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleExportZip}
            disabled={exporting || photos.length === 0}
            title="下載自動建立資料夾與編號命名的 ZIP"
          >
            {exporting ? (
              <RefreshCw size={14} className="spin" aria-hidden="true" />
            ) : (
              <Download size={14} aria-hidden="true" />
            )}
            <span>一鍵結構化打包 (ZIP)</span>
          </button>

          {photos.length > 0 && (
            <button
              type="button"
              className="btn btn-secondary btn-sm text-danger"
              onClick={() => setResetConfirmOpen(true)}
              title="清空所有照片與分組"
            >
              <RotateCcw size={14} aria-hidden="true" />
              <span>清空重置</span>
            </button>
          )}
        </div>
      </div>

      {/* Instagram 3-Grid Cover Live Preview */}
      <section className="glass-panel ig-preview-section" aria-label="Instagram 主頁首圖橫排預覽">
        <div className="ig-preview-header">
          <div className="ig-preview-title">
            <Grid3X3 size={18} className="text-accent" aria-hidden="true" />
            <h3>Instagram 主頁三聯排效果預覽</h3>
          </div>
          <span className="badge badge-info">
            模擬三篇貼文首圖在個人主頁九宮格並列的視覺效果
          </span>
        </div>

        <div className="ig-preview-grid">
          {posts.map((post, idx) => {
            const cover = coverPhotos[idx];
            return (
              <div key={post.id} className="ig-grid-slot">
                <div className="ig-slot-header">
                  <span className="ig-slot-badge">Post {idx + 1} 封面</span>
                  <span className="ig-slot-title">{post.title.split(' ')[0]}</span>
                </div>
                <div className="ig-slot-image-box">
                  {cover ? (
                    <>
                      <img src={cover.previewUrl} alt={`Post ${idx + 1} 封面`} className="ig-slot-img" />
                      <button
                        type="button"
                        className="ig-preview-zoom-btn"
                        onClick={() => setPreviewPhoto(cover)}
                        title="查看大圖"
                      >
                        <Eye size={14} />
                      </button>
                    </>
                  ) : (
                    <div className="ig-slot-empty">
                      <ImageIcon size={28} className="text-dim" />
                      <span>尚未設定首圖</span>
                      <small>從下方貼文點選「設為封面」</small>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

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
          if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
        }}
      >
        <input
          type="file"
          ref={fileInputRef}
          multiple
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => handleFilesSelected(e.target.files)}
        />
        <div className="dropzone-content">
          <div className="dropzone-icon">
            <UploadCloud size={32} />
          </div>
          <div>
            <h4>點擊或拖放照片至此處匯入</h4>
            <p className="text-muted">
              支援多選 JPG、PNG、WebP 照片。全部照片會先進入左側「待分配防漏池」。
            </p>
          </div>
        </div>
        <div className="dropzone-stats">
          <span className="badge badge-info">
            已匯入：{photos.length} 張
          </span>
          <span className={`badge ${unassignedIds.length > 0 ? 'badge-warning' : 'badge-success'}`}>
            待分配：{unassignedIds.length} 張
          </span>
        </div>
      </div>

      {/* Main Workbench Layout: Left Unassigned Pool, Right 3 Post Columns */}
      <div className="curator-workbench-grid">
        {/* Left: Unassigned Pool */}
        <div
          className={`glass-panel unassigned-pool-panel ${dragOverZone === 'unassigned' ? 'is-drag-over' : ''}`}
          onDragOver={(e) => handleDragOver(e, 'unassigned')}
          onDragLeave={(e) => handleDragLeave(e, 'unassigned')}
          onDrop={(e) => handleDropOnZone(e, 'unassigned')}
        >
          <div className="pool-header">
            <div className="pool-header-title">
              <LayoutGrid size={16} className="text-accent" />
              <h4>待分配防漏池</h4>
            </div>
            <span className={`badge ${unassignedIds.length === 0 ? 'badge-success' : 'badge-info'}`}>
              {unassignedIds.length === 0 ? (
                <>
                  <Check size={12} /> 已全部分配
                </>
              ) : (
                `剩餘 ${unassignedIds.length} 張`
              )}
            </span>
          </div>

          <p className="pool-desc">
            照片拖曳至右側貼文，或點擊卡片快速分流。此處不會遺漏任何一張照片。
          </p>

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
                    <div className="photo-card-thumb-wrap">
                      <img src={photo.previewUrl} alt={photo.name} className="photo-card-thumb" />
                      <button
                        type="button"
                        className="photo-zoom-btn"
                        onClick={() => setPreviewPhoto(photo)}
                        title="查看大圖"
                      >
                        <Eye size={13} />
                      </button>
                    </div>
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
                        setPosts((prev) =>
                          prev.map((p) => (p.id === post.id ? { ...p, title: val } : p))
                        );
                      }}
                      title="點擊自訂貼文主題名稱"
                    />
                  </div>
                  <div className="post-capacity-row">
                    <span className={`badge ${isOverLimit ? 'badge-danger' : 'badge-info'}`}>
                      {postPhotos.length} / 10 張
                    </span>
                  </div>
                </div>

                {isOverLimit && (
                  <div className="post-limit-warning">
                    ⚠️ 超過 IG 單篇 10 張輪播上限，建議篩選或移至其他篇
                  </div>
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
                          className={`curator-photo-card post-item-card ${isCover ? 'is-cover-item' : ''} ${draggedPhotoId === photo.id ? 'is-dragging' : ''}`}
                          draggable
                          onDragStart={(e) => handleDragStart(e, photo.id)}
                          onDragEnd={handleDragEnd}
                        >
                          {/* Order Badge */}
                          <div className={`photo-order-badge ${isCover ? 'cover-badge' : ''}`}>
                            {isCover ? (
                              <>
                                <Star size={11} className="star-icon" /> #01 封面
                              </>
                            ) : (
                              `#${String(index + 1).padStart(2, '0')}`
                            )}
                          </div>

                          <div className="photo-card-thumb-wrap">
                            <img src={photo.previewUrl} alt={photo.name} className="photo-card-thumb" />
                            <button
                              type="button"
                              className="photo-zoom-btn"
                              onClick={() => setPreviewPhoto(photo)}
                              title="查看大圖"
                            >
                              <Eye size={13} />
                            </button>
                          </div>

                          <div className="photo-card-info">
                            <div className="photo-card-name" title={photo.name}>
                              {photo.name}
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
                                >
                                  <MoveUp size={12} />
                                </button>
                                <button
                                  type="button"
                                  className="btn-order-action"
                                  disabled={index === postPhotos.length - 1}
                                  onClick={() => movePhotoInPost(post.id, index, 1)}
                                  title="往後移"
                                >
                                  <MoveDown size={12} />
                                </button>
                              </div>

                              {/* Move to next post quick dropdown/action */}
                              <button
                                type="button"
                                className="btn-order-action"
                                onClick={() => {
                                  const nextPostId = posts[(pIdx + 1) % posts.length].id;
                                  assignPhotoToPost(photo.id, nextPostId);
                                }}
                                title={`移至下一篇 (Post ${((pIdx + 1) % posts.length) + 1})`}
                              >
                                <ArrowRight size={12} />
                              </button>

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
              <img src={previewPhoto.previewUrl} alt={previewPhoto.name} className="large-preview-image" />
            </div>
          </>
        )}
      </Dialog>

      {/* Confirm Reset Dialog */}
      <ConfirmDialog
        open={resetConfirmOpen}
        title="清空策展工作台"
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
