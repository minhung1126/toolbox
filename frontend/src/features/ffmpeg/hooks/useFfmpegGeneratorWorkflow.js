import { useCallback, useMemo, useState } from 'react';
import { copyToClipboard } from '../../../utils/clipboard';
import { useFfmpegVideo } from '../../../hooks/useFfmpegVideo';
import { buildFfmpegCommand, buildTrimSummary, parseHmsToSeconds, secondsToHms } from '../model/ffmpegCommand';

export function useFfmpegGeneratorWorkflow({ toast }) {
  // Cut Options
  const [enableStartCut, setEnableStartCut] = useState(true);
  const [startTime, setStartTime] = useState('00:00:00.000');
  const [enableEndCut, setEnableEndCut] = useState(true);
  const [cutMode, setCutMode] = useState('to'); // 'to' | 'duration'
  const [endTime, setEndTime] = useState('00:00:10.000');
  const [durationCut, setDurationCut] = useState('00:00:10.000');
  const [seekMode, setSeekMode] = useState('fast'); // 'fast' | 'accurate'

  // Encoding & Presets
  const [activePreset, setActivePreset] = useState('lossless-trim');
  const [transcodeMode, setTranscodeMode] = useState('copy'); // 'copy' | 'reencode' | 'audio' | 'gif'
  const [videoCodec, setVideoCodec] = useState('copy');
  const [audioCodec, setAudioCodec] = useState('copy');
  const [crf, setCrf] = useState(23);
  const [encoderPreset, setEncoderPreset] = useState('medium');
  const [resolution, setResolution] = useState('original');
  const [fps, setFps] = useState('original');
  const [audioBitrate, setAudioBitrate] = useState('192k');
  const audioVolume = '100%';
  const customFilters = '';

  // Filenames & Shell format
  const [inputName, setInputName] = useState('input.mp4');
  const [outputName, setOutputName] = useState('output_cut.mp4');
  const [shellFormat, setShellFormat] = useState('single'); // 'single' | 'bash' | 'powershell' | 'cmd'
  const [copied, setCopied] = useState(false);

  // UI helpers
  const [showHelp, setShowHelp] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const handleFileSelected = useCallback((file) => {
    setInputName(file.name);
    const dotIndex = file.name.lastIndexOf('.');
    const base = dotIndex > 0 ? file.name.substring(0, dotIndex) : file.name;
    const extension = dotIndex > 0 ? file.name.substring(dotIndex) : '.mp4';
    setOutputName(`${base}_cut${extension}`);
  }, []);

  const handleVideoMetadataLoaded = useCallback((nextDuration) => {
    setStartTime('00:00:00.000');
    const endSeconds = nextDuration > 0 ? nextDuration : 10;
    setEndTime(secondsToHms(endSeconds));
    setDurationCut(secondsToHms(endSeconds));
  }, []);

  const {
    videoRef,
    fileInputRef,
    videoFile,
    setVideoFile,
    videoUrl,
    setVideoUrl,
    duration,
    currentTime,
    setIsPlaying,
    isPlaying,
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
  } = useFfmpegVideo({
    toast,
    onFileSelected: handleFileSelected,
    onMetadataLoaded: handleVideoMetadataLoaded,
    setIsDragging,
    enableStartCut,
    enableEndCut,
    cutMode,
    startTime,
    endTime,
    durationCut,
  });

  // Trimming Helpers
  const handleSetStartTimeToCurrent = () => {
    const formatted = secondsToHms(currentTime);
    setStartTime(formatted);
    toast.success(`已將 Cut 前起點設為 ${formatted}`);
  };

  const handleSetEndTimeToCurrent = () => {
    const formatted = secondsToHms(currentTime);
    if (cutMode === 'to') {
      setEndTime(formatted);
      toast.success(`已將 Cut 後終點設為 ${formatted}`);
    } else {
      const startSec = enableStartCut ? parseHmsToSeconds(startTime) : 0;
      const durSec = Math.max(0, currentTime - startSec);
      const durFmt = secondsToHms(durSec);
      setDurationCut(durFmt);
      toast.success(`已將剪輯長度設為 ${durFmt}`);
    }
  };

  // Preset Selection
  const applyPreset = (preset) => {
    setActivePreset(preset.id);
    setTranscodeMode(preset.mode);
    if (preset.videoCodec) setVideoCodec(preset.videoCodec);
    if (preset.audioCodec) setAudioCodec(preset.audioCodec);
    if (preset.crf !== undefined) setCrf(preset.crf);
    if (preset.preset) setEncoderPreset(preset.preset);
    if (preset.resolution) setResolution(preset.resolution);
    if (preset.audioBitrate) setAudioBitrate(preset.audioBitrate);

    // Adjust output extension if needed
    if (preset.outputExt) {
      const dotIdx = outputName.lastIndexOf('.');
      const base = dotIdx > 0 ? outputName.substring(0, dotIdx) : outputName;
      setOutputName(`${base}.${preset.outputExt}`);
    }
    toast.success(`已套用預設範本：${preset.name}`);
  };

  // Cut summary
  const trimSummary = useMemo(() => {
    return buildTrimSummary({
      enableStartCut,
      startTime,
      enableEndCut,
      cutMode,
      endTime,
      durationCut,
      duration,
    });
  }, [enableStartCut, startTime, enableEndCut, cutMode, endTime, durationCut, duration]);

  const cutStartSec = useMemo(() => {
    return enableStartCut ? Math.min(duration || 3600, parseHmsToSeconds(startTime)) : 0;
  }, [enableStartCut, startTime, duration]);

  const cutEndSec = useMemo(() => {
    if (!enableEndCut) return duration || 0;
    if (cutMode === 'to') {
      return Math.min(duration || 3600, parseHmsToSeconds(endTime));
    }
    return Math.min(duration || 3600, cutStartSec + parseHmsToSeconds(durationCut));
  }, [enableEndCut, cutMode, endTime, durationCut, cutStartSec, duration]);

  const startPercent = useMemo(() => {
    if (!duration || duration <= 0) return 0;
    return Math.min(100, Math.max(0, (cutStartSec / duration) * 100));
  }, [cutStartSec, duration]);

  const endPercent = useMemo(() => {
    if (!duration || duration <= 0) return 100;
    return Math.min(100, Math.max(0, (cutEndSec / duration) * 100));
  }, [cutEndSec, duration]);

  // Command Generation
  const generatedCommand = useMemo(() => {
    return buildFfmpegCommand({
      inputName,
      outputName,
      enableStartCut,
      startTime,
      seekMode,
      enableEndCut,
      cutMode,
      endTime,
      durationCut,
      transcodeMode,
      videoCodec,
      audioCodec,
      crf,
      encoderPreset,
      resolution,
      fps,
      customFilters,
      audioBitrate,
      audioVolume,
      shellFormat,
    });
  }, [
    inputName,
    outputName,
    enableStartCut,
    startTime,
    seekMode,
    enableEndCut,
    cutMode,
    endTime,
    durationCut,
    transcodeMode,
    videoCodec,
    crf,
    encoderPreset,
    resolution,
    fps,
    customFilters,
    audioCodec,
    audioBitrate,
    audioVolume,
    shellFormat,
  ]);

  const handleCopyCommand = async () => {
    try {
      await copyToClipboard(generatedCommand.activeCommand);
      setCopied(true);
      toast.success('FFmpeg 命令行已複製到剪貼簿！');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error(`複製失敗：${err.message || '請手動複製'}`);
    }
  };

  return {
    enableStartCut,
    setEnableStartCut,
    startTime,
    setStartTime,
    enableEndCut,
    setEnableEndCut,
    cutMode,
    setCutMode,
    endTime,
    setEndTime,
    durationCut,
    setDurationCut,
    seekMode,
    setSeekMode,
    activePreset,
    transcodeMode,
    setTranscodeMode,
    videoCodec,
    setVideoCodec,
    audioCodec,
    setAudioCodec,
    crf,
    setCrf,
    resolution,
    setResolution,
    fps,
    setFps,
    audioBitrate,
    setAudioBitrate,
    inputName,
    setInputName,
    outputName,
    setOutputName,
    shellFormat,
    setShellFormat,
    copied,
    showHelp,
    setShowHelp,
    showAdvanced,
    setShowAdvanced,
    isDragging,
    setIsDragging,
    videoRef,
    fileInputRef,
    videoFile,
    setVideoFile,
    videoUrl,
    setVideoUrl,
    duration,
    currentTime,
    setIsPlaying,
    isPlaying,
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
    handleSetStartTimeToCurrent,
    handleSetEndTimeToCurrent,
    applyPreset,
    trimSummary,
    cutStartSec,
    cutEndSec,
    startPercent,
    endPercent,
    generatedCommand,
    handleCopyCommand,
  };
}
