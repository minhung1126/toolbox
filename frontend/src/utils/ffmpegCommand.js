import { Clapperboard, Music, Sliders, Sparkles, Video, VolumeX, Zap } from 'lucide-react';

export function secondsToHms(sec) {
  if (!sec || isNaN(sec) || sec < 0) return '00:00:00.000';
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = sec % 60;
  const sStr = seconds.toFixed(3).padStart(6, '0');
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${sStr}`;
}

export function parseHmsToSeconds(str) {
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

export function formatFileSize(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export const PRESET_LIST = [
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

export function buildTrimSummary({ enableStartCut, startTime, enableEndCut, cutMode, endTime, durationCut, duration }) {
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
}

export function quoteFilename(name) {
  if (!name || typeof name !== 'string') return '""';
  let trimmed = name.trim();
  if (!trimmed) return '""';
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    trimmed = trimmed.slice(1, -1);
  }
  const escaped = trimmed.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
}

export function buildFfmpegCommand({
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
  customFilters = '',
  audioBitrate,
  audioVolume,
  shellFormat = 'bash',
}) {
  const args = ['ffmpeg'];
  const breakdown = [{ flag: 'ffmpeg', label: '呼叫 FFmpeg 核心引擎' }];

  const safeIn = quoteFilename(inputName);
  const safeOut = quoteFilename(outputName);

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
      vFilters.push(customFilters.trim().replace(/"/g, '\\"'));
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
      const safeVolume = String(audioVolume).replace(/["']/g, '');
      args.push('-af', `"volume=${safeVolume}"`);
      breakdown.push({ flag: `-af "volume=${safeVolume}"`, label: `音量調整為 ${safeVolume}` });
    }
  }

  // Output file
  args.push(safeOut);
  breakdown.push({ flag: safeOut, label: `目標輸出檔案：${safeOut}` });

  // Format for shell
  const singleLine = args.join(' ');
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
  const multiLine = groups.join(lineJoiner);

  return {
    singleLine,
    multiLine,
    activeCommand: shellFormat === 'single' ? singleLine : multiLine,
    breakdown,
  };
}
