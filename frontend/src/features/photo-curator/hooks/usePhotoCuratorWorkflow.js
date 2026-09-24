import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { copyToClipboard } from '../../../utils/clipboard';
import { exportCuratedZip, generateChecklistText } from '../../../utils/curatorZip';

const INITIAL_POSTS = [
  { id: 'post-1', title: 'Post 1', photoIds: [] },
  { id: 'post-2', title: 'Post 2', photoIds: [] },
  { id: 'post-3', title: 'Post 3', photoIds: [] },
];

export function usePhotoCuratorWorkflow({ toast }) {
  const fileInputRef = useRef(null);

  const [photos, setPhotos] = useState([]); // Array of { id, name, file, previewUrl, size, lastModified }
  const [unassignedIds, setUnassignedIds] = useState([]);
  const [posts, setPosts] = useState(INITIAL_POSTS);

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

  // Map of photo id -> photo object for quick access
  const photoMap = useMemo(() => {
    const map = new Map();
    photos.forEach((p) => map.set(p.id, p));
    return map;
  }, [photos]);

  // Upload/Import Photos
  const handleFilesSelected = (files) => {
    const selectedFiles = Array.from(files || []);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (selectedFiles.length === 0) return;

    const isImageFile = (file) => {
      if (file.type && file.type.startsWith('image/')) return true;
      return /\.(jpe?g|png|webp|gif|svg|avif|bmp|ico|heic|heif)$/i.test(file.name || '');
    };
    const fileList = selectedFiles.filter(isImageFile);
    if (fileList.length === 0) {
      toast.warning('所選檔案中沒有支援的圖片格式。若為 iPhone HEIC 格式請先轉為 JPG。');
      return;
    }

    const heicCount = fileList.filter(
      (file) => /\.(heic|heif)$/i.test(file.name || '') || file.type === 'image/heic' || file.type === 'image/heif'
    ).length;
    if (heicCount > 0) {
      toast.warning(
        `偵測到 ${heicCount} 張 iPhone HEIC 照片；多數瀏覽器無法直接顯示 HEIC 縮圖，建議先轉為 JPG/PNG 格式。`
      );
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
  const deletePhoto = useCallback(
    (photoId) => {
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
      toast.info('已自工作台移除該照片。');
    },
    [toast]
  );

  // Move photo inside post (set as cover or move up/down)
  const setAsCover = useCallback(
    (postId, photoId) => {
      setPosts((prevPosts) =>
        prevPosts.map((post) => {
          if (post.id !== postId) return post;
          const remaining = post.photoIds.filter((id) => id !== photoId);
          return { ...post, photoIds: [photoId, ...remaining] };
        })
      );
      toast.info('已將照片設為該篇首圖 (Cover)！');
    },
    [toast]
  );

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
    setPosts(INITIAL_POSTS);
    setResetConfirmOpen(false);
    toast.info('工作台已重設。');
  };

  // Generate posting checklist text
  const getChecklistText = useCallback(() => {
    return generateChecklistText({ photos, posts, photoMap, unassignedIds });
  }, [photoMap, photos, posts, unassignedIds]);

  // Copy checklist
  const handleCopyChecklist = async () => {
    const text = getChecklistText();
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
      const checklistContent = getChecklistText();
      await exportCuratedZip({ posts, photoMap, checklistContent });
      toast.success('已成功打包下載 ZIP，包含分組資料夾與發布對照清單！');
    } catch (err) {
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

  return {
    fileInputRef,
    photos,
    unassignedIds,
    posts,
    setPosts,
    draggedPhotoId,
    dragOverZone,
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
    handleDragLeave,
    handleDropOnZone,
    coverPhotos,
  };
}
