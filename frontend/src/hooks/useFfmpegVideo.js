import { useCallback, useEffect, useRef, useState } from 'react';
import { parseHmsToSeconds } from '../features/ffmpeg/model/ffmpegCommand';

export function isVideoFile(file) {
  if (!file) return false;
  if (file.type?.startsWith('video/')) return true;
  return /\.(mp4|webm|mov|mkv|avi|ts|flv|wmv|m4v|3gp|ogv|m2ts|mts)$/i.test(file.name || '');
}

export function useFfmpegVideo({
  toast,
  onFileSelected,
  onMetadataLoaded,
  setIsDragging,
  enableStartCut,
  enableEndCut,
  cutMode,
  startTime,
  endTime,
  durationCut,
}) {
  const videoRef = useRef(null);
  const fileInputRef = useRef(null);
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPlayingTrimmed, setIsPlayingTrimmed] = useState(false);
  const [videoMeta, setVideoMeta] = useState({ width: 0, height: 0, size: 0, name: '' });
  const [playbackRate, setPlaybackRate] = useState(1);
  const [videoError, setVideoError] = useState(null);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  const handleSelectFile = useCallback(
    (file) => {
      if (!isVideoFile(file)) {
        toast.error('請選擇有效的影片檔案 (MP4, WebM, MOV, MKV, AVI 等)');
        return;
      }

      setVideoError(null);
      setVideoFile(file);
      setVideoUrl(URL.createObjectURL(file));
      onFileSelected?.(file);
      toast.success(`已載入影片：${file.name}`);
    },
    [onFileSelected, toast]
  );

  const handleDrop = useCallback(
    (event) => {
      event.preventDefault();
      setIsDragging(false);
      const file = event.dataTransfer?.files?.[0];
      if (file) handleSelectFile(file);
    },
    [handleSelectFile, setIsDragging]
  );

  const handleLoadedMetadata = useCallback(() => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const nextDuration = video.duration || 0;
    setDuration(nextDuration);
    setVideoMeta({
      width: video.videoWidth || 0,
      height: video.videoHeight || 0,
      size: videoFile?.size || 0,
      name: videoFile?.name || '',
    });
    onMetadataLoaded?.(nextDuration);
  }, [onMetadataLoaded, videoFile]);

  const handleTimeUpdate = useCallback(() => {
    if (!videoRef.current) return;
    const time = videoRef.current.currentTime;
    setCurrentTime(time);

    if (isPlayingTrimmed && enableEndCut) {
      const startSeconds = enableStartCut ? parseHmsToSeconds(startTime) : 0;
      const stopSeconds = cutMode === 'to' ? parseHmsToSeconds(endTime) : startSeconds + parseHmsToSeconds(durationCut);
      if (time >= stopSeconds) {
        videoRef.current.pause();
        setIsPlaying(false);
        setIsPlayingTrimmed(false);
      }
    }
  }, [cutMode, durationCut, enableEndCut, enableStartCut, endTime, isPlayingTrimmed, startTime]);

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
      setIsPlayingTrimmed(false);
    }
  }, []);

  const seekTo = useCallback(
    (seconds) => {
      if (!videoRef.current) return;
      const target = Math.max(0, Math.min(duration || 3600, seconds));
      videoRef.current.currentTime = target;
      setCurrentTime(target);
    },
    [duration]
  );

  const seekRelative = useCallback(
    (offsetSeconds) => {
      if (!videoRef.current) return;
      seekTo(videoRef.current.currentTime + offsetSeconds);
    },
    [seekTo]
  );

  const setPlaybackSpeed = useCallback((rate) => {
    if (videoRef.current) videoRef.current.playbackRate = rate;
    setPlaybackRate(rate);
  }, []);

  const playTrimmedSegment = useCallback(() => {
    if (!videoRef.current) return;
    const startSeconds = enableStartCut ? parseHmsToSeconds(startTime) : 0;
    videoRef.current.currentTime = startSeconds;
    setIsPlayingTrimmed(true);
    videoRef.current.play();
    setIsPlaying(true);
  }, [enableStartCut, startTime]);

  return {
    videoRef,
    fileInputRef,
    videoFile,
    setVideoFile,
    videoUrl,
    setVideoUrl,
    duration,
    currentTime,
    setCurrentTime,
    isPlaying,
    setIsPlaying,
    isPlayingTrimmed,
    setIsPlayingTrimmed,
    videoMeta,
    playbackRate,
    videoError,
    setVideoError,
    handleSelectFile,
    handleDrop,
    handleLoadedMetadata,
    handleTimeUpdate,
    togglePlay,
    seekTo,
    seekRelative,
    setPlaybackSpeed,
    playTrimmedSegment,
  };
}
