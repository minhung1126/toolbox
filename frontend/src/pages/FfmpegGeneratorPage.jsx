import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Clapperboard,
  Clock,
  Code2,
  Copy,
  FastForward,
  FileVideo,
  HelpCircle,
  Maximize2,
  Minimize2,
  Music,
  Pause,
  Play,
  RotateCcw,
  Scissors,
  Sliders,
  Sparkles,
  Terminal,
  Upload,
  Video,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import { useToast } from '../components/Toast';
import { copyToClipboard } from '../utils/clipboard';
import { api } from '../services/api';

function secondsToHms(sec) {
  if (!sec || isNaN(sec) || sec < 0) return '00:00:00.000';
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = sec % 60;
  const sStr = seconds.toFixed(3).padStart(6, '0');
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${sStr}`;
}

function parseHmsToSeconds(str) {
  if (!str || typeof str !== 'string') return 0;
  const s = str.trim();
  if (!s) return 0;
  if (!isNaN(s)) return Math.max(0, parseFloat(s));
  const parts = s.split(':');
  if (parts.length === 3) {
    const h = parseFloat(parts[0]) || 0;
    const m = parseFloat(parts[1]) || 0;
    const sec = parseFloat(parts[2]) || 0;
    return Math.max(0, h * 3600 + m * 60 + sec);
  }
  if (parts.length === 2) {
    const m = parseFloat(parts[0]) || 0;
    const sec = parseFloat(parts[1]) || 0;
    return Math.max(0, m * 60 + sec);
  }
  return 0;
}

function formatFileSize(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

const PRESET_LIST = [
  {
    id: 'lossless-trim',
    name: '極速無損剪切',
    mode: 'copy',
    badge: '推薦',
    icon: Zap,
    desc: '無損複製 -c copy，零轉檔時間維持 100% 原始畫質',
  },
  {
    id: 'high-quality-h264',
    name: 'H.264 高相容',
    mode: 'reencode',
    videoCodec: 'libx264',
    audioCodec: 'aac',
    crf: 23,
    preset: 'medium',
    resolution: 'original',
    icon: Video,
    desc: '適用於幾乎所有社群平台、播放器與手機',
  },
  {
    id: 'efficient-h265',
    name: 'H.265 高壓縮',
    mode: 'reencode',
    videoCodec: 'libx265',
    audioCodec: 'aac',
    crf: 26,
    preset: 'medium',
    resolution: 'original',
    icon: Sliders,
    desc: '體積大幅縮小 40%，維持細膩清晰畫質',
  },
  {
    id: 'vertical-shorts',
    name: '9:16 直式 Shorts',
    mode: 'reencode',
    videoCodec: 'libx264',
    audioCodec: 'aac',
    crf: 22,
    preset: 'fast',
    resolution: 'shorts_9_16',
    icon: Clapperboard,
    desc: '等比居中縮放並補黑邊至 1080x1920 直式畫面',
  },
  {
    id: 'extract-audio-mp3',
    name: '擷取 MP3 音訊',
    mode: 'audio',
    videoCodec: 'none',
    audioCodec: 'libmp3lame',
    audioBitrate: '192k',
    outputExt: 'mp3',
    icon: Music,
    desc: '移除視訊軌，輸出高品質 192kbps MP3 聲音檔',
  },
  {
    id: 'mute-video',
    name: '影片靜音 (移除音訊)',
    mode: 'reencode',
    videoCodec: 'copy',
    audioCodec: 'none',
    icon: VolumeX,
    desc: '完全移除聲音軌道，保留無損視訊流',
  },
  {
    id: 'animated-gif',
    name: '動態 GIF 圖片',
    mode: 'gif',
    outputExt: 'gif',
    icon: Sparkles,
    desc: '使用兩階段調色盤最佳化演算法產生高畫質 GIF',
  },
];

export default function FfmpegGeneratorPage() {
  const toast = useToast();
  const videoRef = useRef(null);
  const fileInputRef = useRef(null);

  // Video State
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoMeta, setVideoMeta] = useState({ width: 0, height: 0, size: 0, name: '' });
  const [playbackRate, setPlaybackRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

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
  const [audioVolume, setAudioVolume] = useState('100%');
  const [customFilters, setCustomFilters] = useState('');

  // Filenames & Shell format
  const [inputName, setInputName] = useState('input.mp4');
  const [outputName, setOutputName] = useState('output_cut.mp4');
  const [shellFormat, setShellFormat] = useState('single'); // 'single' | 'bash' | 'powershell' | 'cmd'
  const [copied, setCopied] = useState(false);

  // UI helpers
  const [showHelp, setShowHelp] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isPlayingTrimmed, setIsPlayingTrimmed] = useState(false);

  // Cleanup object url on change/unmount
  useEffect(() => {
    return () => {
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [videoUrl]);

  // Load video file
  const handleSelectFile = useCallback((file) => {
    if (!file || !file.type.startsWith('video/')) {
      toast.error('請選擇有效的影片檔案 (MP4, WebM, MOV, MKV 等)');
      return;
    }
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }
    const url = URL.createObjectURL(file);
    setVideoFile(file);
    setVideoUrl(url);
    setInputName(file.name);

    // Suggest output filename
    const dotIdx = file.name.lastIndexOf('.');
    const base = dotIdx > 0 ? file.name.substring(0, dotIdx) : file.name;
    const ext = dotIdx > 0 ? file.name.substring(dotIdx) : '.mp4';
    setOutputName(`${base}_cut${ext}`);

    toast.success(`已載入影片：${file.name}`);
  }, [videoUrl, toast]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleSelectFile(e.dataTransfer.files[0]);
    }
  }, [handleSelectFile]);

  // Video element event handlers
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const vid = videoRef.current;
      const dur = vid.duration || 0;
      setDuration(dur);
      setVideoMeta({
        width: vid.videoWidth || 0,
        height: vid.videoHeight || 0,
        size: videoFile?.size || 0,
        name: videoFile?.name || '',
      });

      // Default trim endpoints
      setStartTime('00:00:00.000');
      const endSec = dur > 0 ? dur : 10;
      setEndTime(secondsToHms(endSec));
      setDurationCut(secondsToHms(endSec));
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const cur = videoRef.current.currentTime;
      setCurrentTime(cur);

      // If in "play trimmed preview" mode, auto pause when reaching end cut
      if (isPlayingTrimmed && enableEndCut) {
        let stopSec = duration;
        if (cutMode === 'to') {
          stopSec = parseHmsToSeconds(endTime);
        } else {
          const startSec = enableStartCut ? parseHmsToSeconds(startTime) : 0;
          stopSec = startSec + parseHmsToSeconds(durationCut);
        }
        if (cur >= stopSec) {
          videoRef.current.pause();
          setIsPlaying(false);
          setIsPlayingTrimmed(false);
        }
      }
    }
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
      setIsPlayingTrimmed(false);
    }
  };

  const seekRelative = (offsetSec) => {
    if (!videoRef.current) return;
    const target = Math.max(0, Math.min(duration || 3600, videoRef.current.currentTime + offsetSec));
    videoRef.current.currentTime = target;
    setCurrentTime(target);
  };

  const seekTo = (sec) => {
    if (!videoRef.current) return;
    const target = Math.max(0, Math.min(duration || 3600, sec));
    videoRef.current.currentTime = target;
    setCurrentTime(target);
  };

  const setPlaybackSpeed = (rate) => {
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
    setPlaybackRate(rate);
  };

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

  const handlePlayTrimmedSegment = () => {
    if (!videoRef.current) return;
    const startSec = enableStartCut ? parseHmsToSeconds(startTime) : 0;
    videoRef.current.currentTime = startSec;
    setIsPlayingTrimmed(true);
    videoRef.current.play();
    setIsPlaying(true);
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
    const startSec = enableStartCut ? parseHmsToSeconds(startTime) : 0;
    let endSec = duration;
    if (enableEndCut) {
      if (cutMode === 'to') {
        endSec = parseHmsToSeconds(endTime);
      } else {
        endSec = startSec + parseHmsToSeconds(durationCut);
      }
    }
    const clipDur = Math.max(0, endSec - startSec);
    return {
      startSec,
      endSec,
      clipDurationSec: clipDur,
      formattedDuration: secondsToHms(clipDur),
      isInvalid: enableStartCut && enableEndCut && startSec >= endSec,
    };
  }, [enableStartCut, startTime, enableEndCut, cutMode, endTime, durationCut, duration]);

  // Command Generation
  const generatedCommand = useMemo(() => {
    const args = ['ffmpeg'];
    const breakdown = [{ flag: 'ffmpeg', label: '呼叫 FFmpeg 核心引擎' }];

    const safeIn = inputName.includes(' ') && !inputName.startsWith('"') ? `"${inputName}"` : inputName;
    const safeOut = outputName.includes(' ') && !outputName.startsWith('"') ? `"${outputName}"` : outputName;

    const startSec = enableStartCut ? parseHmsToSeconds(startTime) : 0;
    const hasStart = enableStartCut && startSec > 0;
    const startFmt = secondsToHms(startSec);

    // Fast seek (before -i)
    if (hasStart && seekMode === 'fast') {
      args.push('-ss', startFmt);
      breakdown.push({ flag: `-ss ${startFmt}`, label: `快速起點定位至 ${startFmt}（關鍵影格）` });
    }

    // Input file
    args.push('-i', safeIn);
    breakdown.push({ flag: `-i ${safeIn}`, label: `指定輸入來源：${safeIn}` });

    // Accurate seek (after -i)
    if (hasStart && seekMode === 'accurate') {
      args.push('-ss', startFmt);
      breakdown.push({ flag: `-ss ${startFmt}`, label: `精確起點解碼至 ${startFmt}（逐影格）` });
    }

    // End cut
    if (enableEndCut) {
      if (cutMode === 'to') {
        const endSec = parseHmsToSeconds(endTime);
        const endFmt = secondsToHms(endSec);
        args.push('-to', endFmt);
        breakdown.push({ flag: `-to ${endFmt}`, label: `裁切至時間點 ${endFmt}` });
      } else {
        const durSec = parseHmsToSeconds(durationCut);
        const durFmt = secondsToHms(durSec);
        args.push('-t', durFmt);
        breakdown.push({ flag: `-t ${durFmt}`, label: `裁切持續時間長度 ${durFmt}` });
      }
    }

    // Mode handling
    if (transcodeMode === 'gif') {
      const gifVf = 'fps=15,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse';
      args.push('-vf', `"${gifVf}"`);
      breakdown.push({ flag: '-vf "..."', label: '兩階段調色盤優化濾鏡，產生極致流暢清晰 GIF' });
    } else if (transcodeMode === 'audio' || videoCodec === 'none') {
      args.push('-vn');
      breakdown.push({ flag: '-vn', label: '移除視訊軌（僅輸出音訊）' });

      if (audioCodec && audioCodec !== 'copy' && audioCodec !== 'none') {
        args.push('-c:a', audioCodec);
        breakdown.push({ flag: `-c:a ${audioCodec}`, label: `音訊編碼器指定為 ${audioCodec}` });
        if (audioBitrate) {
          args.push('-b:a', audioBitrate);
          breakdown.push({ flag: `-b:a ${audioBitrate}`, label: `音訊碼率：${audioBitrate}` });
        }
      }
    } else if (transcodeMode === 'copy') {
      args.push('-c', 'copy');
      breakdown.push({ flag: '-c copy', label: '無損直接複製視訊與音訊流（不耗費 CPU/GPU 轉檔，瞬間完成）' });
    } else {
      // Re-encode
      if (videoCodec === 'copy') {
        args.push('-c:v', 'copy');
        breakdown.push({ flag: '-c:v copy', label: '無損複製視訊流' });
      } else if (videoCodec && videoCodec !== 'none') {
        args.push('-c:v', videoCodec);
        breakdown.push({ flag: `-c:v ${videoCodec}`, label: `視訊編碼器：${videoCodec}` });

        args.push('-crf', String(crf));
        breakdown.push({ flag: `-crf ${crf}`, label: `畫質平衡係數 CRF=${crf}` });

        args.push('-preset', encoderPreset);
        breakdown.push({ flag: `-preset ${encoderPreset}`, label: `編碼速度與壓縮預設：${encoderPreset}` });
      }

      // Video filters
      const vFilters = [];
      if (resolution === '1080p') {
        vFilters.push('scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2');
      } else if (resolution === '720p') {
        vFilters.push('scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2');
      } else if (resolution === '4k') {
        vFilters.push('scale=3840:2160:force_original_aspect_ratio=decrease,pad=3840:2160:(ow-iw)/2:(oh-ih)/2');
      } else if (resolution === 'shorts_9_16') {
        vFilters.push('scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2');
      }

      if (fps !== 'original') {
        vFilters.push(`fps=${fps}`);
      }
      if (customFilters.trim()) {
        vFilters.push(customFilters.trim());
      }

      if (vFilters.length > 0) {
        const joinedVf = vFilters.join(',');
        args.push('-vf', `"${joinedVf}"`);
        breakdown.push({ flag: `-vf "${joinedVf}"`, label: '視訊縮放／畫面填色／影格率濾鏡' });
      }

      // Audio options
      if (audioCodec === 'none') {
        args.push('-an');
        breakdown.push({ flag: '-an', label: '移除音軌（完全靜音）' });
      } else if (audioCodec === 'copy') {
        args.push('-c:a', 'copy');
        breakdown.push({ flag: '-c:a copy', label: '無損複製音訊流' });
      } else if (audioCodec) {
        args.push('-c:a', audioCodec);
        breakdown.push({ flag: `-c:a ${audioCodec}`, label: `音訊編碼器：${audioCodec}` });
        if (audioBitrate) {
          args.push('-b:a', audioBitrate);
          breakdown.push({ flag: `-b:a ${audioBitrate}`, label: `音訊碼率：${audioBitrate}` });
        }
      }

      if (audioVolume !== '100%') {
        args.push('-af', `"volume=${audioVolume}"`);
        breakdown.push({ flag: `-af "volume=${audioVolume}"`, label: `音量調整為 ${audioVolume}` });
      }
    }

    // Output file
    args.push(safeOut);
    breakdown.push({ flag: safeOut, label: `目標輸出檔案：${safeOut}` });

    // Format for shell
    const singleLine = args.join(' ');
    let multiLine = '';
    const lineJoiner = shellFormat === 'powershell' ? ' `\n  ' : shellFormat === 'cmd' ? ' ^\n  ' : ' \\\n  ';

    // Grouping for neat multi-line
    const groups = ['ffmpeg'];
    let idx = 1;
    while (idx < args.length) {
      const curr = args[idx];
      if (curr.startsWith('-') && idx + 1 < args.length && !args[idx + 1].startsWith('-')) {
        groups.push(`${curr} ${args[idx + 1]}`);
        idx += 2;
      } else {
        groups.push(curr);
        idx += 1;
      }
    }
    multiLine = groups.join(lineJoiner);

    return {
      singleLine,
      multiLine,
      activeCommand: shellFormat === 'single' ? singleLine : multiLine,
      breakdown,
    };
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

  return (
    <div className="section-gap ffmpeg-generator-page">
      {/* Header */}
      <header className="glass-panel page-header card-padding">
        <div className="badge badge-info dashboard-eyebrow">
          <Clapperboard size={14} aria-hidden="true" /> 影音創作工具
        </div>
        <div className="ffmpeg-header-row">
          <div>
            <h1>FFmpeg 命令行生成器</h1>
            <p className="section-desc">
              本地即時影片預覽，視覺化定位 Cut 起訖點與微調影格，提供極速無損複製（<code>-c copy</code>）與進階編碼選項，一鍵複製跨平台 FFmpeg 指令。
            </p>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-icon"
            onClick={() => setShowHelp(!showHelp)}
            title="查看 FFmpeg 說明與常見技巧"
            aria-label="說明"
          >
            <HelpCircle size={18} aria-hidden="true" />
          </button>
        </div>

        {showHelp && (
          <div className="ffmpeg-help-panel glass-panel card-padding">
            <div className="help-panel-header">
              <strong>💡 FFmpeg 剪輯與轉檔實用技巧</strong>
              <button type="button" className="btn btn-icon" onClick={() => setShowHelp(false)}>
                <X size={14} />
              </button>
            </div>
            <ul className="ffmpeg-help-list">
              <li>
                <strong>無損流複製 (-c copy)</strong>：剪輯時最推薦的模式！不經過重編碼，以硬碟讀寫極速瞬間產生影片，保留 100% 原始解析度與音質。
              </li>
              <li>
                <strong>Cut 前快速 vs 精確</strong>：置於 <code>-i</code> 前利用關鍵影格（Keyframe）快速尋找，剪輯大檔秒級跳轉；置於 <code>-i</code> 後逐幀解碼，定位最精確。
              </li>
              <li>
                <strong>隱私安全</strong>：本地播放器直接透過瀏覽器解碼，影片<strong>絕對不會</strong>上傳到伺服器，安全零流量。
              </li>
            </ul>
          </div>
        )}
      </header>

      {/* Main Grid: Video Player + Cut Workspace */}
      <div className="ffmpeg-workbench-layout">
        {/* Left / Top: Video Player & Local Loader */}
        <section className="glass-panel card-padding ffmpeg-player-panel" aria-label="影片預覽播放器">
          <div className="panel-title-row">
            <div className="title-with-icon">
              <Video size={18} className="text-primary" />
              <h2>影片預覽與時間軸</h2>
            </div>
            {videoFile && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  if (videoUrl) URL.revokeObjectURL(videoUrl);
                  setVideoFile(null);
                  setVideoUrl('');
                }}
              >
                更換影片
              </button>
            )}
          </div>

          {!videoUrl ? (
            /* Dropzone */
            <div
              className={`ffmpeg-dropzone ${isDragging ? 'drag-over' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                type="file"
                ref={fileInputRef}
                accept="video/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleSelectFile(e.target.files[0]);
                  }
                }}
              />
              <div className="dropzone-inner">
                <Upload size={40} className="dropzone-icon" />
                <h3>點擊或拖曳本機影片至此處</h3>
                <p className="text-muted">支援 MP4, WebM, MOV, MKV 等瀏覽器可播放格式</p>
                <div className="dropzone-note">
                  <span>🔒 本機極速即時預覽，影片資料不耗費流量上傳至伺服器</span>
                </div>
              </div>
            </div>
          ) : (
            /* Video Player */
            <div className="ffmpeg-player-wrapper">
              <div className="video-container">
                <video
                  ref={videoRef}
                  src={videoUrl}
                  onLoadedMetadata={handleLoadedMetadata}
                  onTimeUpdate={handleTimeUpdate}
                  onEnded={() => {
                    setIsPlaying(false);
                    setIsPlayingTrimmed(false);
                  }}
                  playsInline
                  onClick={togglePlay}
                />
              </div>

              {/* Video Info Bar */}
              <div className="video-meta-bar">
                <span className="meta-item">
                  <FileVideo size={14} /> {videoMeta.name}
                </span>
                {videoMeta.width > 0 && (
                  <span className="meta-item">
                    {videoMeta.width} × {videoMeta.height}
                  </span>
                )}
                {videoMeta.size > 0 && (
                  <span className="meta-item">{formatFileSize(videoMeta.size)}</span>
                )}
                <span className="meta-item">
                  <Clock size={14} /> 總長度: {secondsToHms(duration)}
                </span>
              </div>

              {/* Player Controls */}
              <div className="player-controls-container">
                {/* Timeline Slider with Cut Indicator */}
                <div className="timeline-slider-wrapper">
                  <input
                    type="range"
                    className="timeline-slider"
                    min={0}
                    max={duration || 100}
                    step={0.01}
                    value={currentTime}
                    onChange={(e) => seekTo(parseFloat(e.target.value))}
                    aria-label="影片時間軸滑桿"
                  />
                  <div className="timeline-time-display">
                    <span className="current-time">{secondsToHms(currentTime)}</span>
                    <span className="total-duration">/ {secondsToHms(duration)}</span>
                  </div>
                </div>

                {/* Primary Button Bar */}
                <div className="player-btn-bar">
                  <div className="playback-group">
                    <button
                      type="button"
                      className="btn btn-primary btn-icon"
                      onClick={togglePlay}
                      aria-label={isPlaying ? '暫停' : '播放'}
                    >
                      {isPlaying ? <Pause size={18} /> : <Play size={18} />}
                    </button>

                    {/* Step buttons */}
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => seekRelative(-1)}
                      title="後退 1 秒"
                    >
                      -1s
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => seekRelative(-0.1)}
                      title="後退 0.1 秒（逐影格微調）"
                    >
                      -0.1s
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => seekRelative(0.1)}
                      title="前進 0.1 秒（逐影格微調）"
                    >
                      +0.1s
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => seekRelative(1)}
                      title="前進 1 秒"
                    >
                      +1s
                    </button>
                  </div>

                  {/* Playback speed */}
                  <div className="speed-group">
                    <span className="speed-label">倍速:</span>
                    {[0.5, 1, 1.5, 2].map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        className={`btn btn-xs ${playbackRate === rate ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setPlaybackSpeed(rate)}
                      >
                        {rate}x
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Right / Bottom: Cut & Preset Workbench */}
        <section className="glass-panel card-padding ffmpeg-controls-panel" aria-label="剪輯起訖與編碼設定">
          {/* Presets Bar */}
          <div className="section-block">
            <label className="field-label">常用預設範本</label>
            <div className="preset-pill-grid">
              {PRESET_LIST.map((preset) => {
                const Icon = preset.icon;
                const isSelected = activePreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    className={`preset-pill ${isSelected ? 'active' : ''}`}
                    onClick={() => applyPreset(preset)}
                    title={preset.desc}
                  >
                    <Icon size={14} className="preset-pill-icon" />
                    <span>{preset.name}</span>
                    {preset.badge && <span className="preset-pill-badge">{preset.badge}</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cut Start / End Section */}
          <div className="section-block cut-section-grid">
            {/* Cut 前 (Start Time) */}
            <div className="cut-card glass-panel">
              <div className="cut-card-header">
                <div className="checkbox-row">
                  <input
                    type="checkbox"
                    id="enableStartCut"
                    checked={enableStartCut}
                    onChange={(e) => setEnableStartCut(e.target.checked)}
                  />
                  <label htmlFor="enableStartCut" className="cut-card-title">
                    <Scissors size={15} className="rotate-180" /> Cut 前（起始時間 -ss）
                  </label>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={handleSetStartTimeToCurrent}
                  disabled={!enableStartCut || !videoUrl}
                  title="將目前播放進度設為起點"
                >
                  設為目前進度
                </button>
              </div>

              <div className="cut-card-body">
                <div className="input-with-action">
                  <input
                    type="text"
                    className="input-field"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    disabled={!enableStartCut}
                    placeholder="00:00:00.000"
                    aria-label="剪輯起始時間"
                  />
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => seekTo(parseHmsToSeconds(startTime))}
                    disabled={!enableStartCut || !videoUrl}
                    title="跳至起點影格預覽"
                  >
                    跳至起點
                  </button>
                </div>

                {/* Seeking Mode */}
                <div className="seek-mode-row">
                  <span className="text-muted text-xs">定位策略：</span>
                  <label className="radio-label">
                    <input
                      type="radio"
                      name="seekMode"
                      value="fast"
                      checked={seekMode === 'fast'}
                      onChange={() => setSeekMode('fast')}
                    />
                    快速跳轉 (前置 -ss)
                  </label>
                  <label className="radio-label">
                    <input
                      type="radio"
                      name="seekMode"
                      value="accurate"
                      checked={seekMode === 'accurate'}
                      onChange={() => setSeekMode('accurate')}
                    />
                    精準逐幀 (後置 -ss)
                  </label>
                </div>
              </div>
            </div>

            {/* Cut 後 (End Time) */}
            <div className="cut-card glass-panel">
              <div className="cut-card-header">
                <div className="checkbox-row">
                  <input
                    type="checkbox"
                    id="enableEndCut"
                    checked={enableEndCut}
                    onChange={(e) => setEnableEndCut(e.target.checked)}
                  />
                  <label htmlFor="enableEndCut" className="cut-card-title">
                    <Scissors size={15} /> Cut 後（結束或長度）
                  </label>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={handleSetEndTimeToCurrent}
                  disabled={!enableEndCut || !videoUrl}
                  title="將目前播放進度設為結束點"
                >
                  設為目前進度
                </button>
              </div>

              <div className="cut-card-body">
                <div className="cut-mode-toggle">
                  <button
                    type="button"
                    className={`btn btn-xs ${cutMode === 'to' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setCutMode('to')}
                  >
                    結束時間 (-to)
                  </button>
                  <button
                    type="button"
                    className={`btn btn-xs ${cutMode === 'duration' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setCutMode('duration')}
                  >
                    剪輯長度 (-t)
                  </button>
                </div>

                <div className="input-with-action">
                  <input
                    type="text"
                    className="input-field"
                    value={cutMode === 'to' ? endTime : durationCut}
                    onChange={(e) => {
                      if (cutMode === 'to') setEndTime(e.target.value);
                      else setDurationCut(e.target.value);
                    }}
                    disabled={!enableEndCut}
                    placeholder="00:00:10.000"
                    aria-label="剪輯結束時間或長度"
                  />
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      if (cutMode === 'to') seekTo(parseHmsToSeconds(endTime));
                      else {
                        const start = enableStartCut ? parseHmsToSeconds(startTime) : 0;
                        seekTo(start + parseHmsToSeconds(durationCut));
                      }
                    }}
                    disabled={!enableEndCut || !videoUrl}
                    title="跳至終點影格預覽"
                  >
                    跳至終點
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Trim Status Summary Bar */}
          <div className="trim-summary-bar">
            <div className="summary-left">
              <span className="summary-tag">
                <Clock size={13} /> 剪輯後長度: <strong>{trimSummary.formattedDuration}</strong> ({trimSummary.clipDurationSec.toFixed(2)} 秒)
              </span>
              {trimSummary.isInvalid && (
                <span className="summary-error">
                  <AlertCircle size={14} /> 起始時間不能大於結束時間！
                </span>
              )}
            </div>
            {videoUrl && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handlePlayTrimmedSegment}
                disabled={trimSummary.isInvalid}
              >
                <Play size={14} /> 預覽選取片段
              </button>
            )}
          </div>

          {/* Codec & Stream Copy Options */}
          <div className="section-block">
            <div className="mode-tab-row">
              <button
                type="button"
                className={`mode-tab ${transcodeMode === 'copy' ? 'active' : ''}`}
                onClick={() => {
                  setTranscodeMode('copy');
                  setVideoCodec('copy');
                  setAudioCodec('copy');
                }}
              >
                <Zap size={14} /> 快速無損流複製 (-c copy)
              </button>
              <button
                type="button"
                className={`mode-tab ${transcodeMode === 'reencode' ? 'active' : ''}`}
                onClick={() => {
                  setTranscodeMode('reencode');
                  setVideoCodec('libx264');
                  setAudioCodec('aac');
                }}
              >
                <Sliders size={14} /> 重新編碼／自訂格式
              </button>
            </div>

            {transcodeMode === 'copy' ? (
              <div className="info-banner glass-panel">
                <p className="text-muted text-sm">
                  ⚡ <strong>無損複製模式已啟用</strong>：跳過耗時的 CPU/GPU 轉檔，直接將封裝流剪輯輸出，100% 維持原始畫質與聲音，耗時極短（通常數秒內完成）。
                </p>
              </div>
            ) : (
              /* Re-encode detailed options */
              <div className="reencode-options-grid glass-panel card-padding">
                <div className="field-group">
                  <label className="field-label">視訊編碼器 (-c:v)</label>
                  <select
                    className="select-field"
                    value={videoCodec}
                    onChange={(e) => setVideoCodec(e.target.value)}
                  >
                    <option value="libx264">H.264 (libx264 - 最相容推薦)</option>
                    <option value="libx265">H.265 / HEVC (libx265 - 高壓縮率)</option>
                    <option value="libvpx-vp9">VP9 (libvpx-vp9 - WebM 推薦)</option>
                    <option value="libsvtav1">AV1 (libsvtav1 - 新世代高效)</option>
                    <option value="copy">Stream Copy (保留視訊流複製)</option>
                    <option value="none">無 (移除視訊 / 僅音訊)</option>
                  </select>
                </div>

                <div className="field-group">
                  <label className="field-label">
                    畫質係數 CRF (目前: {crf})
                    <span className="text-dim text-xs ml-2">
                      {crf <= 19 ? '超高畫質' : crf <= 24 ? '畫質平衡' : '高壓縮小檔'}
                    </span>
                  </label>
                  <input
                    type="range"
                    min={16}
                    max={32}
                    value={crf}
                    onChange={(e) => setCrf(parseInt(e.target.value, 10))}
                    className="range-field"
                  />
                </div>

                <div className="field-group">
                  <label className="field-label">解析度縮放</label>
                  <select
                    className="select-field"
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                  >
                    <option value="original">維持原始解析度</option>
                    <option value="1080p">1080p FHD (1920x1080)</option>
                    <option value="720p">720p HD (1280x720)</option>
                    <option value="4k">4K UHD (3840x2160)</option>
                    <option value="shorts_9_16">直式 9:16 Shorts/Reels (1080x1920 居中補黑邊)</option>
                  </select>
                </div>

                <div className="field-group">
                  <label className="field-label">影格率 (FPS)</label>
                  <select className="select-field" value={fps} onChange={(e) => setFps(e.target.value)}>
                    <option value="original">維持原始幀率</option>
                    <option value="24">24 fps (電影感)</option>
                    <option value="30">30 fps (標準影片)</option>
                    <option value="60">60 fps (流暢遊戲/動作)</option>
                  </select>
                </div>

                <div className="field-group">
                  <label className="field-label">音訊編碼器 (-c:a)</label>
                  <select
                    className="select-field"
                    value={audioCodec}
                    onChange={(e) => setAudioCodec(e.target.value)}
                  >
                    <option value="aac">AAC (最通用推薦)</option>
                    <option value="libmp3lame">MP3 (libmp3lame)</option>
                    <option value="libopus">Opus (libopus - 高品質壓縮)</option>
                    <option value="copy">Stream Copy (保留音訊原樣)</option>
                    <option value="none">無 (完全靜音 / 移除音軌)</option>
                  </select>
                </div>

                <div className="field-group">
                  <label className="field-label">音訊碼率 (-b:a)</label>
                  <select
                    className="select-field"
                    value={audioBitrate}
                    onChange={(e) => setAudioBitrate(e.target.value)}
                    disabled={audioCodec === 'none' || audioCodec === 'copy'}
                  >
                    <option value="128k">128 kbps (標準)</option>
                    <option value="192k">192 kbps (高品質推薦)</option>
                    <option value="256k">256 kbps (發燒音質)</option>
                    <option value="320k">320 kbps (無損感知)</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Command Output & Copy Section */}
      <section className="glass-panel card-padding ffmpeg-output-section" aria-label="FFmpeg 命令行與複製">
        <div className="output-header-row">
          <div className="title-with-icon">
            <Terminal size={18} className="text-primary" />
            <h2>生成的 FFmpeg 命令行</h2>
          </div>

          {/* Shell dialect toggles */}
          <div className="shell-toggle-group">
            <button
              type="button"
              className={`btn btn-xs ${shellFormat === 'single' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setShellFormat('single')}
            >
              單行指令
            </button>
            <button
              type="button"
              className={`btn btn-xs ${shellFormat === 'bash' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setShellFormat('bash')}
            >
              Bash ( \ )
            </button>
            <button
              type="button"
              className={`btn btn-xs ${shellFormat === 'powershell' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setShellFormat('powershell')}
            >
              PowerShell ( ` )
            </button>
            <button
              type="button"
              className={`btn btn-xs ${shellFormat === 'cmd' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setShellFormat('cmd')}
            >
              CMD ( ^ )
            </button>
          </div>
        </div>

        {/* Filename Inputs */}
        <div className="filename-inputs-grid">
          <div className="field-group">
            <label className="field-label">輸入檔名 (Input File)</label>
            <input
              type="text"
              className="input-field"
              value={inputName}
              onChange={(e) => setInputName(e.target.value)}
              placeholder="input.mp4"
            />
          </div>
          <div className="field-group">
            <label className="field-label">輸出檔名 (Output File)</label>
            <input
              type="text"
              className="input-field"
              value={outputName}
              onChange={(e) => setOutputName(e.target.value)}
              placeholder="output.mp4"
            />
          </div>
        </div>

        {/* Code Terminal Box */}
        <div className="command-terminal-box">
          <pre className="command-code">
            <code>{generatedCommand.activeCommand}</code>
          </pre>
          <button
            type="button"
            className={`btn btn-copy-command ${copied ? 'btn-success' : 'btn-primary'}`}
            onClick={handleCopyCommand}
            aria-label="一鍵複製命令行"
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            <span>{copied ? '已複製指令！' : '一鍵複製命令行'}</span>
          </button>
        </div>

        {/* Collapsible Parameter Breakdown Table */}
        <div className="breakdown-collapsible">
          <button
            type="button"
            className="btn-collapse-toggle"
            onClick={() => setShowAdvanced(!showAdvanced)}
            aria-expanded={showAdvanced}
          >
            <span>參數白話解析 ({generatedCommand.breakdown.length} 項參數)</span>
            {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {showAdvanced && (
            <div className="breakdown-table-wrapper">
              <table className="breakdown-table">
                <thead>
                  <tr>
                    <th>指令參數</th>
                    <th>作用說明</th>
                  </tr>
                </thead>
                <tbody>
                  {generatedCommand.breakdown.map((item, idx) => (
                    <tr key={idx}>
                      <td className="param-code">
                        <code>{item.flag}</code>
                      </td>
                      <td className="param-desc">{item.label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
