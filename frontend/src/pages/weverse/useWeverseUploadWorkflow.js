import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';

export const YOUTUBE_CATEGORIES = [
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

export const COMMON_BCP47_LANGS = [
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

export function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function useWeverseUploadWorkflow({ isVideoAuthConnected, toast }) {
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
    if (
      !currentTaskId ||
      (taskStatus?.status !== 'pending' &&
        taskStatus?.status !== 'uploading_video' &&
        taskStatus?.status !== 'uploading_captions')
    ) {
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
          tags: metadata.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
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
          tags: metadata.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
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

  return {
    viewStep,
    setViewStep,
    pathInputMode,
    setPathInputMode,
    localPath,
    setLocalPath,
    recentPaths,
    scanning,
    isDragging,
    selectedFolderFiles,
    packageSource,
    videoInfo,
    subtitles,
    setSubtitles,
    metadata,
    setMetadata,
    currentTaskId,
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
  };
}
