import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock,
  ExternalLink,
  FileText,
  Folder,
  FolderOpen,
  FolderUp,
  HelpCircle,
  Loader2,
  RefreshCw,
  Send,
  Trash2,
  Upload,
  UploadCloud,
  Video,
  XCircle,
} from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import ServiceAuthCard from '../components/ServiceAuthCard';
import { useOAuthConnect } from '../hooks/useOAuthConnect';

const YOUTUBE_CATEGORIES = [
  { id: '22', name: '人物與網誌 (People & Blogs)' },
  { id: '24', name: '娛樂 (Entertainment)' },
  { id: '10', name: '音樂 (Music)' },
  { id: '1', name: '電影與動畫 (Film & Animation)' },
  { id: '17', name: '體育 (Sports)' },
  { id: '20', name: '遊戲 (Gaming)' },
  { id: '23', name: '喜劇 (Comedy)' },
  { id: '25', name: '新聞與政治 (News & Politics)' },
  { id: '26', name: '教學與技巧 (Howto & Style)' },
];

const COMMON_BCP47_LANGS = [
  { code: 'zh-TW', label: '繁體中文 (zh-TW)' },
  { code: 'zh-CN', label: '簡體中文 (zh-CN)' },
  { code: 'ko', label: '韓文 (ko)' },
  { code: 'ja', label: '日文 (ja)' },
  { code: 'en-US', label: '英文 (en-US)' },
  { code: 'en', label: '英文 (en)' },
  { code: 'es', label: '西班牙文 (es)' },
  { code: 'fr', label: '法文 (fr)' },
  { code: 'de', label: '德文 (de)' },
  { code: 'id', label: '印尼文 (id)' },
  { code: 'th', label: '泰文 (th)' },
  { code: 'vi', label: '越南文 (vi)' },
  { code: 'ru', label: '俄文 (ru)' },
  { code: 'pt-PT', label: '葡萄牙文 (pt-PT)' },
  { code: 'it', label: '義大利文 (it)' },
  { code: 'hi', label: '印地文 (hi)' },
  { code: 'ar', label: '阿拉伯文 (ar)' },
];

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function WeverseUploaderPage({ authUser, refreshAuthUser }) {
  const toast = useToast();

  // YouTube Dedicated Authorization hook
  const {
    connecting,
    confirmDisconnect,
    setConfirmDisconnect,
    handleConnect,
    handleConfirmDisconnect,
  } = useOAuthConnect({
    serviceName: 'video_uploader',
    getAuthUrl: api.getVideoUploaderAuthUrl,
    disconnect: api.disconnectVideoUploader,
    onAfterDisconnect: refreshAuthUser,
    serviceLabel: '影片上傳 YouTube 頻道授權',
    successMessage: '已解除影片上傳專屬 YouTube 頻道授權',
  });

  const videoAuth = authUser?.authorizations?.video_uploader;
  const isVideoAuthConnected = Boolean(videoAuth?.connected);

  // Mode: 'pick' | 'review' | 'uploading' | 'completed'
  const [viewStep, setViewStep] = useState('pick');
  const [pathInputMode, setPathInputMode] = useState('folder_picker'); // 'folder_picker' | 'manual_path'
  const [localPath, setLocalPath] = useState('');
  const [recentPaths, setRecentPaths] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Raw file references for browser folder pick / drag
  const [selectedFolderFiles, setSelectedFolderFiles] = useState({
    videoFile: null,
    subtitleFiles: [],
  });

  // Review package data
  const [packageSource, setPackageSource] = useState('path'); // 'path' | 'browser_files'
  const [packageId, setPackageId] = useState('');
  const [videoInfo, setVideoInfo] = useState(null);
  const [subtitles, setSubtitles] = useState([]);

  // Editable video form
  const [metadata, setMetadata] = useState({
    title: '',
    description: '',
    privacy_status: 'private',
    tags: '',
    category_id: '22',
    default_language: 'ko',
  });

  // Upload task state
  const [currentTaskId, setCurrentTaskId] = useState(null);
  const [taskStatus, setTaskStatus] = useState(null);
  const [uploadConfirmOpen, setUploadConfirmOpen] = useState(false);
  const [uploadStarting, setUploadStarting] = useState(false);

  // History state
  const [historyList, setHistoryList] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const folderInputRef = useRef(null);

  // Load recent paths & history on mount
  const loadRecentPaths = useCallback(async () => {
    try {
      const res = await api.getWeverseRecentPaths();
      if (res?.paths) setRecentPaths(res.paths);
    } catch {
      // Ignore background error
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await api.getWeverseUploadHistory(10);
      if (res?.tasks) setHistoryList(res.tasks);
    } catch {
      // Ignore background error
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecentPaths();
    loadHistory();
  }, [loadRecentPaths, loadHistory]);

  // Task Polling during upload
  useEffect(() => {
    if (!currentTaskId || (taskStatus?.status !== 'pending' && taskStatus?.status !== 'uploading_video' && taskStatus?.status !== 'uploading_captions')) {
      return undefined;
    }

    const interval = setInterval(async () => {
      try {
        const res = await api.getWeverseUploadTask(currentTaskId);
        if (res?.task) {
          setTaskStatus(res.task);
          if (res.task.status === 'completed') {
            setViewStep('completed');
            toast.success('影片與字幕已成功上傳至 YouTube！');
            loadHistory();
          } else if (res.task.status === 'failed') {
            toast.error(`上傳失敗：${res.task.error_message || '未知錯誤'}`);
          }
        }
      } catch (err) {
        // Stop polling on 404 or terminal error
        if (err?.status === 404) {
          clearInterval(interval);
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [currentTaskId, taskStatus?.status, toast, loadHistory]);

  // Handle scanned package setup
  const populatePackageForReview = (pkg, source = 'path') => {
    if (!pkg.video) {
      toast.error('在此資料夾中找不到任何支援的影片檔 (.mp4, .mkv, .mov)');
      return;
    }

    setPackageSource(source);
    setPackageId(pkg.package_id || pkg.folder_name || 'package');
    setVideoInfo(pkg.video);

    // Initial subtitle items
    const parsedSubs = (pkg.subtitles || []).map((s, idx) => ({
      id: `sub_${idx}_${s.raw_lang || idx}`,
      filename: s.filename,
      full_path: s.full_path || '',
      size_bytes: s.size_bytes || 0,
      size_formatted: s.size_formatted || formatBytes(s.size_bytes),
      raw_lang: s.raw_lang || '',
      bcp47: s.bcp47 || 'zh-TW',
      label: s.label || s.filename,
      enabled: s.enabled !== false,
    }));
    setSubtitles(parsedSubs);

    // Initial metadata
    setMetadata({
      title: pkg.suggested_title || pkg.video.filename.replace(/\.[^/.]+$/, ''),
      description: pkg.suggested_description || '',
      privacy_status: 'private',
      tags: 'weverse, artist',
      category_id: '22',
      default_language: 'ko',
    });

    setViewStep('review');
    toast.success(`辨識完成：找到 1 部影片與 ${parsedSubs.length} 語系字幕，請進行複查。`);
  };

  // 1. Scan from local path
  const handleScanPath = async (pathToScan) => {
    const target = pathToScan || localPath;
    if (!target.trim()) {
      toast.error('請輸入有效的本機資料夾路徑。');
      return;
    }

    setScanning(true);
    try {
      const res = await api.scanWeverseFolder(target.trim());
      if (res?.packages && res.packages.length > 0) {
        populatePackageForReview(res.packages[0], 'path');
        loadRecentPaths();
      } else {
        toast.error('指定路徑中未找到有效的影片檔案。');
      }
    } catch (err) {
      toast.error(`掃描失敗：${err.message || '資料夾不存在或權限不足'}`);
    } finally {
      setScanning(false);
    }
  };

  // 2. Browser folder picker / Drag & Drop file processor
  const processBrowserFiles = async (fileList) => {
    if (!fileList || fileList.length === 0) return;

    let vidFile = null;
    const subFiles = [];
    const metaList = [];

    const videoExts = ['.mp4', '.mkv', '.mov', '.webm', '.avi', '.m4v'];
    const subExts = ['.vtt', '.srt'];

    for (let i = 0; i < fileList.length; i += 1) {
      const f = fileList[i];
      const lower = f.name.toLowerCase();
      const isVid = videoExts.some((ext) => lower.endsWith(ext));
      const isSub = subExts.some((ext) => lower.endsWith(ext));

      if (isVid && !vidFile) {
        vidFile = f;
      } else if (isSub) {
        subFiles.push(f);
      }

      metaList.push({
        name: f.name,
        size: f.size,
        relative_path: f.webkitRelativePath || f.name,
      });
    }

    if (!vidFile) {
      toast.error('選取的資料夾或檔案中找不到任何影片檔案 (.mp4, .mkv, .mov)');
      return;
    }

    setSelectedFolderFiles({
      videoFile: vidFile,
      subtitleFiles: subFiles,
    });

    setScanning(true);
    try {
      const res = await api.parseWeverseFiles(metaList);
      if (res?.packages && res.packages.length > 0) {
        populatePackageForReview(res.packages[0], 'browser_files');
      } else {
        toast.error('無法辨識資料夾結構。');
      }
    } catch (err) {
      toast.error(`辨識失敗：${err.message}`);
    } finally {
      setScanning(false);
    }
  };

  // File input change handler (click)
  const handleFolderInputChange = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processBrowserFiles(files);
    }
    // reset input so same folder can be re-selected if needed
    e.target.value = '';
  };

  // Drag and Drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const items = e.dataTransfer?.items;
    const files = e.dataTransfer?.files;

    if (items && items.length > 0) {
      // Traverse directory entries if supported
      const fileEntries = [];
      const readEntry = async (entry) => {
        if (entry.isFile) {
          return new Promise((resolve) => {
            entry.file((file) => {
              fileEntries.push(file);
              resolve();
            });
          });
        }
        if (entry.isDirectory) {
          const dirReader = entry.createReader();
          return new Promise((resolve) => {
            dirReader.readEntries(async (entries) => {
              for (const child of entries) {
                // eslint-disable-next-line no-await-in-loop
                await readEntry(child);
              }
              resolve();
            });
          });
        }
        return Promise.resolve();
      };

      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        if (typeof item.webkitGetAsEntry === 'function') {
          const entry = item.webkitGetAsEntry();
          if (entry) {
            // eslint-disable-next-line no-await-in-loop
            await readEntry(entry);
          }
        }
      }

      if (fileEntries.length > 0) {
        processBrowserFiles(fileEntries);
        return;
      }
    }

    if (files && files.length > 0) {
      processBrowserFiles(files);
    }
  };

  // Review Form changes
  const handleToggleAllSubs = (enabled) => {
    setSubtitles((prev) => prev.map((s) => ({ ...s, enabled })));
  };

  const handleToggleSub = (id) => {
    setSubtitles((prev) => prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)));
  };

  const handleSubChange = (id, field, value) => {
    setSubtitles((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  };

  // Quota calculation
  const enabledSubsCount = subtitles.filter((s) => s.enabled).length;
  const estimatedQuota = 1600 + enabledSubsCount * 400;

  // Execute Upload
  const handleStartUpload = async () => {
    setUploadConfirmOpen(false);

    if (!isVideoAuthConnected) {
      toast.error('請先完成專屬影片上傳 YouTube 頻道授權。');
      return;
    }

    if (!metadata.title.trim()) {
      toast.error('請輸入影片標題。');
      return;
    }

    setUploadStarting(true);
    try {
      let res;
      if (packageSource === 'path') {
        const payload = {
          video_path: videoInfo.full_path,
          title: metadata.title.trim(),
          description: metadata.description.trim(),
          privacy_status: metadata.privacy_status,
          tags: metadata.tags.split(',').map((t) => t.trim()).filter(Boolean),
          category_id: metadata.category_id,
          default_language: metadata.default_language,
          subtitles: subtitles.map((s) => ({
            full_path: s.full_path,
            filename: s.filename,
            raw_lang: s.raw_lang,
            bcp47: s.bcp47,
            label: s.label,
            enabled: s.enabled,
          })),
        };
        res = await api.uploadWeverseFromPath(payload);
      } else {
        // Upload from browser files
        const formData = new FormData();
        formData.append('video', selectedFolderFiles.videoFile);

        selectedFolderFiles.subtitleFiles.forEach((file) => {
          formData.append('subtitles', file);
        });

        const metaPayload = {
          title: metadata.title.trim(),
          description: metadata.description.trim(),
          privacy_status: metadata.privacy_status,
          tags: metadata.tags.split(',').map((t) => t.trim()).filter(Boolean),
          category_id: metadata.category_id,
          default_language: metadata.default_language,
          subtitles: subtitles.map((s) => ({
            filename: s.filename,
            bcp47: s.bcp47,
            label: s.label,
            enabled: s.enabled,
          })),
        };
        formData.append('metadata', JSON.stringify(metaPayload));

        res = await api.uploadWeverseFiles(formData);
      }

      if (res?.task_id) {
        setCurrentTaskId(res.task_id);
        setTaskStatus({
          task_id: res.task_id,
          title: metadata.title.trim(),
          status: 'pending',
          progress_percent: 0,
          current_step: '任務已排入背景上傳佇列...',
        });
        setViewStep('uploading');
        toast.success('上傳任務已啟動！正在背景傳輸至 YouTube。');
      }
    } catch (err) {
      toast.error(`啟動上傳失敗：${err.message || '未知錯誤'}`);
    } finally {
      setUploadStarting(false);
    }
  };

  const handleReset = () => {
    setViewStep('pick');
    setVideoInfo(null);
    setSubtitles([]);
    setSelectedFolderFiles({ videoFile: null, subtitleFiles: [] });
    setCurrentTaskId(null);
    setTaskStatus(null);
  };

  return (
    <div className="section-gap weverse-uploader-container">
      {/* Page Header */}
      <header className="page-header">
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', margin: '0 0 0.5rem 0' }}>
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
        confirmLabel="確認斷開"
        onConfirm={handleConfirmDisconnect}
        onCancel={() => setConfirmDisconnect(false)}
      />

      {/* 2. Step: Pick / Drop Folder */}
      {viewStep === 'pick' && (
        <div className="glass-panel" style={{ padding: '1.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FolderOpen size={20} color="var(--accent)" /> 步驟一：選擇或拖曳本機資料夾
            </h3>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
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
                style={{ display: 'none' }}
                onChange={handleFolderInputChange}
              />

              {/* Drag and drop zone */}
              <div
                className={`dropzone-panel ${isDragging ? 'is-dragging' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => folderInputRef.current?.click()}
                style={{
                  border: isDragging ? '2px dashed var(--primary)' : '2px dashed rgba(255, 255, 255, 0.2)',
                  borderRadius: '12px',
                  padding: '3rem 2rem',
                  textAlign: 'center',
                  background: isDragging ? 'rgba(var(--primary-rgb), 0.08)' : 'rgba(0, 0, 0, 0.2)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                <FolderUp size={54} color={isDragging ? 'var(--primary)' : 'var(--text-muted)'} style={{ margin: '0 auto 1rem' }} />
                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1.15rem' }}>
                  按一下選擇資料夾，或將資料夾直接拖曳至此處
                </h4>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: '0 0 1.25rem 0' }}>
                  支援包含 <code style={{ color: 'var(--accent)' }}>.mp4</code> 影片與多國語系 <code style={{ color: 'var(--accent)' }}>.vtt</code> 字幕檔的 Weverse 資料夾
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
                  {scanning ? <><Loader2 size={16} className="animate-spin" /> 正在辨識檔案結構...</> : '選擇資料夾'}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
                <input
                  type="text"
                  className="input-field"
                  placeholder="例如：D:\Weverse\20260923_Artist_Live_3-241665049"
                  value={localPath}
                  onChange={(e) => setLocalPath(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleScanPath(); }}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => handleScanPath()}
                  disabled={scanning || !localPath.trim()}
                >
                  {scanning ? <><Loader2 size={16} className="animate-spin" /> 掃描中...</> : '掃描並辨識'}
                </button>
              </div>

              {recentPaths.length > 0 && (
                <div style={{ marginTop: '0.75rem' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginRight: '0.5rem' }}>最近掃描路徑：</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.4rem' }}>
                    {recentPaths.map((p) => (
                      <button
                        key={p}
                        type="button"
                        className="btn btn-sm btn-secondary"
                        style={{ fontSize: '0.8rem', padding: '0.2rem 0.6rem' }}
                        onClick={() => {
                          setLocalPath(p);
                          handleScanPath(p);
                        }}
                      >
                        <Folder size={12} style={{ marginRight: '4px' }} /> {p}
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FileText size={20} color="var(--primary)" /> 步驟二：辨識結果複查與編輯
            </h3>
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={handleReset}
            >
              重新選擇資料夾
            </button>
          </div>

          {/* Video summary card */}
          {videoInfo && (
            <div style={{
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              padding: '1rem',
              marginBottom: '1.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
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
              <span className="badge badge-connected" style={{ fontSize: '0.8rem' }}>主要影片已就緒</span>
            </div>
          )}

          {/* Video Metadata Settings */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                影片標題 (Title) <span style={{ color: 'var(--danger)' }}>*</span>
                <span style={{ float: 'right', fontSize: '0.78rem', color: 'var(--text-muted)' }}>{metadata.title.length}/100</span>
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
                  <option key={c.id} value={c.id}>{c.name}</option>
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
              <span style={{ float: 'right', fontSize: '0.78rem', color: 'var(--text-muted)' }}>{metadata.description.length}/5000</span>
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <div>
                <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  字幕軌清單與語言對照
                  <span style={{ fontSize: '0.82rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>
                    (已勾選 {enabledSubsCount} / {subtitles.length} 軌)
                  </span>
                </h4>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={() => handleToggleAllSubs(true)}
                >
                  全選
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={() => handleToggleAllSubs(false)}
                >
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
                    <tr style={{ background: 'rgba(255, 255, 255, 0.05)', textAlign: 'left', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
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
                        <td style={{ padding: '0.6rem 1rem', color: 'var(--text-muted)' }}>
                          {sub.size_formatted}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <datalist id="bcp47-suggestions">
              {COMMON_BCP47_LANGS.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </datalist>
          </div>

          {/* Quota preview card */}
          <div style={{
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
          }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Clock size={16} color="var(--accent)" /> YouTube API 配額預估消耗：{estimatedQuota.toLocaleString()} 單位
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                影片上傳：1,600 單位 · 字幕上傳：{enabledSubsCount} 軌 × 400 單位 = {(enabledSubsCount * 400).toLocaleString()} 單位
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
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleReset}
            >
              取消
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={uploadStarting || !isVideoAuthConnected || !metadata.title.trim()}
              onClick={() => setUploadConfirmOpen(true)}
            >
              {uploadStarting ? <><Loader2 size={16} className="animate-spin" /> 啟動中...</> : '確認並開始上傳至 YouTube'}
            </button>
          </div>
        </div>
      )}

      {/* Confirm upload dialog */}
      <ConfirmDialog
        open={uploadConfirmOpen}
        title="確認開始發布至 YouTube？"
        message={`即將上傳影片「${metadata.title}」並掛載 ${enabledSubsCount} 語系字幕，預估消耗 ${estimatedQuota.toLocaleString()} 單位 YouTube 配額。`}
        confirmLabel="立即上傳"
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
          <div style={{
            background: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '999px',
            height: '14px',
            maxWidth: '500px',
            margin: '0 auto 1.5rem',
            overflow: 'hidden',
          }}>
            <div style={{
              background: 'linear-gradient(90deg, var(--primary), var(--accent))',
              height: '100%',
              width: `${taskStatus.progress_percent || 0}%`,
              transition: 'width 0.4s ease',
            }} />
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

          <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
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

          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleReset}
          >
            上傳另一部影片
          </button>
        </div>
      )}

      {/* 6. Recent History */}
      <div className="glass-panel" style={{ padding: '1.5rem', marginTop: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Clock size={18} color="var(--text-muted)" /> 近期上傳紀錄
          </h4>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={loadHistory}
            disabled={historyLoading}
          >
            <RefreshCw size={14} className={historyLoading ? 'animate-spin' : ''} /> 重新整理
          </button>
        </div>

        {historyList.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: 0, textAlign: 'center', padding: '1rem' }}>
            尚未有任何上傳紀錄。
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ background: 'rgba(255, 255, 255, 0.04)', textAlign: 'left', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <th style={{ padding: '0.6rem 0.8rem' }}>標題 / 影片檔名</th>
                  <th style={{ padding: '0.6rem 0.8rem' }}>隱私狀態</th>
                  <th style={{ padding: '0.6rem 0.8rem' }}>字幕數</th>
                  <th style={{ padding: '0.6rem 0.8rem' }}>狀態</th>
                  <th style={{ padding: '0.6rem 0.8rem' }}>時間</th>
                  <th style={{ padding: '0.6rem 0.8rem' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {historyList.map((item) => (
                  <tr key={item.task_id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                    <td style={{ padding: '0.6rem 0.8rem' }}>
                      <div style={{ fontWeight: 500 }}>{item.title}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{item.video_filename}</div>
                    </td>
                    <td style={{ padding: '0.6rem 0.8rem' }}>
                      <span className="badge badge-secondary" style={{ fontSize: '0.78rem' }}>{item.privacy_status || 'private'}</span>
                    </td>
                    <td style={{ padding: '0.6rem 0.8rem' }}>{item.subtitles_count || 0}</td>
                    <td style={{ padding: '0.6rem 0.8rem' }}>
                      {item.status === 'completed' && <span className="badge badge-connected" style={{ fontSize: '0.78rem' }}>已完成</span>}
                      {item.status === 'failed' && <span className="badge badge-disconnected" style={{ fontSize: '0.78rem' }}>失敗</span>}
                      {(item.status === 'uploading_video' || item.status === 'uploading_captions' || item.status === 'pending') && (
                        <span className="badge badge-warning" style={{ fontSize: '0.78rem' }}>上傳中</span>
                      )}
                    </td>
                    <td style={{ padding: '0.6rem 0.8rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                      {item.created_at ? new Date(item.created_at).toLocaleString() : '-'}
                    </td>
                    <td style={{ padding: '0.6rem 0.8rem' }}>
                      {item.video_url && (
                        <a
                          href={item.video_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-sm btn-secondary"
                          style={{ padding: '0.2rem 0.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                        >
                          YouTube <ExternalLink size={12} />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
