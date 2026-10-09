import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, Dispatch, SetStateAction } from 'react';
import { weverseUploadApi } from '../api/weverseUploadApi';
import type { WeverseUploadPackage, WeverseSubtitleFile, WeverseVideoFile, WeversePrivacyStatus } from '../api/types';
import { formatBytes } from '../model/options';
import { readDroppedFiles } from '../model/droppedFiles';
import type { UploadToast, UploadView } from '../model/taskState';
interface ReviewSubtitle extends WeverseSubtitleFile {
  id: string;
}
export function useUploadPackage(toast: UploadToast, setViewStep: Dispatch<SetStateAction<UploadView>>) {
  const [pathInputMode, setPathInputMode] = useState('folder_picker'); // 'folder_picker' | 'manual_path'
  const [localPath, setLocalPath] = useState('');
  const [recentPaths, setRecentPaths] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Raw file references for browser folder pick / drag
  const [selectedFolderFiles, setSelectedFolderFiles] = useState<{ videoFile: File | null; subtitleFiles: File[] }>({
    videoFile: null,
    subtitleFiles: [],
  });

  // Review package data
  const [packageSource, setPackageSource] = useState('path'); // 'path' | 'browser_files'
  const [videoInfo, setVideoInfo] = useState<WeverseVideoFile | null>(null);
  const [subtitles, setSubtitles] = useState<ReviewSubtitle[]>([]);

  // Editable video form
  const [metadata, setMetadata] = useState({
    title: '',
    description: '',
    privacy_status: 'private' as WeversePrivacyStatus,
    tags: '',
    category_id: '22',
    default_language: 'ko',
  });

  const folderInputRef = useRef<HTMLInputElement>(null);
  const loadRecentPaths = useCallback(async () => {
    try {
      const res = await weverseUploadApi.getRecentPaths();
      if (res?.paths) setRecentPaths(res.paths);
    } catch {
      // Ignore background error
    }
  }, []);

  useEffect(() => {
    loadRecentPaths();
  }, [loadRecentPaths]);
  // Handle scanned package setup
  const populatePackageForReview = (pkg: WeverseUploadPackage, source = 'path') => {
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
      privacy_status: 'private' as WeversePrivacyStatus,
      tags: 'weverse, artist',
      category_id: '22',
      default_language: 'ko',
    });

    setViewStep('review');
    toast.success(`辨識完成：找到 1 部影片與 ${parsedSubs.length} 語系字幕，請進行複查。`);
  };

  // 1. Scan from local path
  const handleScanPath = async (pathToScan?: string) => {
    const target = pathToScan || localPath;
    if (!target.trim()) {
      toast.error('請輸入有效的本機資料夾路徑。');
      return;
    }

    setScanning(true);
    try {
      const res = await weverseUploadApi.scanFolder(target.trim());
      if (res?.packages && res.packages.length > 0) {
        populatePackageForReview(res.packages[0], 'path');
        loadRecentPaths();
      } else {
        toast.error('指定路徑中未找到有效的影片檔案。');
      }
    } catch (err) {
      toast.error(`掃描失敗：${(err instanceof Error ? err.message : '讀取失敗') || '資料夾不存在或權限不足'}`);
    } finally {
      setScanning(false);
    }
  };

  // 2. Browser folder picker / Drag & Drop file processor
  const processBrowserFiles = async (fileList: FileList | File[]) => {
    if (!fileList || fileList.length === 0) return;

    let vidFile: File | null = null;
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
      const res = await weverseUploadApi.parseFiles(metaList);
      if (res?.packages && res.packages.length > 0) {
        populatePackageForReview(res.packages[0], 'browser_files');
      } else {
        toast.error('無法辨識資料夾結構。');
      }
    } catch (err) {
      toast.error(`辨識失敗：${err instanceof Error ? err.message : '讀取失敗'}`);
    } finally {
      setScanning(false);
    }
  };

  // File input change handler (click)
  const handleFolderInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processBrowserFiles(files);
    }
    // reset input so same folder can be re-selected if needed
    e.target.value = '';
  };

  // Drag and Drop handlers
  const handleDragOver = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const items = e.dataTransfer?.items;
    const files = e.dataTransfer?.files;

    try {
      const entries = await readDroppedFiles(items, files);
      if (entries.length) await processBrowserFiles(entries);
    } catch {
      toast.error('無法讀取資料夾，請檢查檔案權限或重新選取。');
    }
  };

  // Review Form changes
  const handleToggleAllSubs = (enabled: boolean) => {
    setSubtitles((prev) => prev.map((s) => ({ ...s, enabled })));
  };

  const handleToggleSub = (id: string) => {
    setSubtitles((prev) => prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)));
  };

  const handleSubChange = (id: string, field: string, value: string) => {
    setSubtitles((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  };

  const resetPackage = () => {
    setVideoInfo(null);
    setSubtitles([]);
    setSelectedFolderFiles({ videoFile: null, subtitleFiles: [] });
  };
  return {
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
    folderInputRef,
    handleScanPath,
    handleFolderInputChange,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleToggleAllSubs,
    handleToggleSub,
    handleSubChange,
    resetPackage,
  };
}
