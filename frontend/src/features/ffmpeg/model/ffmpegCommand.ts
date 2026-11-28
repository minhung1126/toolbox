import type { CommandOptions, GeneratedCommand, TrimOptions, TrimSummary } from './types';

export function secondsToHms(sec: number): string {
  if (!sec || isNaN(sec) || sec < 0) return '00:00:00.000';
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = sec % 60;
  const sStr = seconds.toFixed(3).padStart(6, '0');
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${sStr}`;
}

export function parseHmsToSeconds(str: unknown): number {
  if (typeof str !== 'string' || !/^(?:\d+:)?(?:[0-5]?\d:)?\d+(?:\.\d+)?$/.test(str)) return NaN;
  const parts = str.split(':').map(Number);
  if (parts.length > 1 && parts.at(-1)! >= 60) return NaN;
  if (parts.length === 3 && parts[1] >= 60) return NaN;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export function buildTrimSummary({
  enableStartCut,
  startTime,
  enableEndCut,
  cutMode,
  endTime,
  durationCut,
  duration,
}: TrimOptions): TrimSummary {
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
    isInvalid:
      !Number.isFinite(startSec) ||
      !Number.isFinite(endSec) ||
      (enableEndCut && startSec >= endSec) ||
      (duration > 0 && (startSec >= duration || endSec > duration + 0.001)),
  };
}

export function quoteFilename(name: unknown, shell: 'bash' | 'powershell' | 'cmd' = 'bash'): string {
  const value = typeof name === 'string' ? name : '';
  if (
    Array.from(value).some((ch) => {
      const code = ch.charCodeAt(0);
      return code < 32 || code === 127;
    })
  ) {
    throw new Error('不可包含換行或控制字元。');
  }
  if (shell === 'cmd') {
    if (/[%!"]/.test(value)) throw new Error('CMD 無法可靠保留 %、! 或雙引號；請改用 Bash 或 PowerShell。');
    return '"' + value.replace(/(\\+)$/, '$1$1') + '"';
  }
  if (shell === 'powershell') return "'" + value.replace(/'/g, "''") + "'";
  return "'" + value.replace(/'/g, "'\"'\"'") + "'";
}

export function validateCommand(options: CommandOptions): Record<string, string> {
  const errors: Record<string, string> = {};
  const shell = options.shellDialect ?? (options.shellFormat === 'single' ? 'bash' : options.shellFormat) ?? 'bash';
  for (const [field, value] of Object.entries(options)) {
    if (typeof value === 'string' && !(field === 'audioVolume' && value === '100%')) {
      try {
        quoteFilename(value, shell);
      } catch (err) {
        errors[field] = (err as Error).message;
      }
    }
  }
  for (const field of ['inputName', 'outputName'] as const) {
    if (!options[field].trim() || options[field].startsWith('-')) errors[field] = '請填寫檔名；開頭不可為 -。';
  }
  const normalize = (name: string) => {
    const windows = /^[a-z]:|\\/i.test(name);
    const parts: string[] = [];
    for (const part of name.replace(/\\/g, '/').split('/')) {
      if (part === '.') continue;
      if (part === '..' && parts.length && parts.at(-1) !== '..') parts.pop();
      else parts.push(part);
    }
    return windows ? parts.join('/').toLowerCase() : parts.join('/');
  };
  if (normalize(options.inputName) === normalize(options.outputName)) errors.outputName = '輸入與輸出不可為同一路徑。';
  const start = options.enableStartCut ? parseHmsToSeconds(options.startTime) : 0;
  if (!Number.isFinite(start)) errors.startTime = '請輸入有效的非負時間。';
  const end = options.enableEndCut
    ? options.cutMode === 'to'
      ? parseHmsToSeconds(options.endTime)
      : start + parseHmsToSeconds(options.durationCut)
    : options.sourceDuration;
  if (options.enableEndCut && (!Number.isFinite(end) || end! <= start))
    errors[options.cutMode === 'to' ? 'endTime' : 'durationCut'] = '終點須晚於起點，長度須大於零。';
  if (
    options.sourceDuration &&
    (start >= options.sourceDuration || (end !== undefined && end > options.sourceDuration + 0.001))
  )
    errors.endTime = '裁切範圍超過已知影片長度。';
  return errors;
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
  audioVolume = '100%',
  shellFormat = 'bash',
  shellDialect,
  lineLayout,
  sourceDuration,
}: CommandOptions): GeneratedCommand {
  const shell = shellDialect ?? (shellFormat === 'single' ? 'bash' : shellFormat);
  const errors = validateCommand({
    inputName,
    outputName,
    enableStartCut,
    startTime,
    enableEndCut,
    cutMode,
    endTime,
    durationCut,
    seekMode,
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
    shellDialect: shell,
    sourceDuration,
  });
  if (Object.keys(errors).length) return { errors, singleLine: '', multiLine: '', activeCommand: '', breakdown: [] };
  const args = ['ffmpeg'];
  const breakdown = [{ flag: 'ffmpeg', label: '呼叫 FFmpeg 核心引擎' }];

  const safeIn = inputName;
  const safeOut = outputName;

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
      if (hasStart && seekMode === 'fast') {
        // Input seeking resets the output timeline, so an absolute source end
        // time must become a duration measured from the selected start.
        const clipFmt = secondsToHms(Math.max(0, endSec - startSec));
        args.push('-t', clipFmt);
        breakdown.push({ flag: `-t ${clipFmt}`, label: `從起點裁切 ${clipFmt}，至原影片時間點 ${endFmt}` });
      } else {
        args.push('-to', endFmt);
        breakdown.push({ flag: `-to ${endFmt}`, label: `裁切至時間點 ${endFmt}` });
      }
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
    args.push('-vf', gifVf);
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
    breakdown.push({ flag: '-c copy', label: '直接複製視訊與音訊流；裁切受關鍵影格限制，不保證逐幀精準' });
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
      args.push('-vf', joinedVf);
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
      args.push('-af', `volume=${safeVolume}`);
      breakdown.push({ flag: `-af "volume=${safeVolume}"`, label: `音量調整為 ${safeVolume}` });
    }
  }

  // Output file
  args.push(safeOut);
  breakdown.push({ flag: safeOut, label: `目標輸出檔案：${safeOut}` });

  // Format for shell
  const rendered = args.map((arg, index) =>
    index === 0 || (/^[a-zA-Z0-9_.:/-]+$/.test(arg) && arg !== safeIn && index !== args.length - 1)
      ? arg
      : quoteFilename(arg, shell)
  );
  const singleLine = rendered.join(' ');
  const lineJoiner = shell === 'powershell' ? ' `\n  ' : shell === 'cmd' ? ' ^\n  ' : ' \\\n  ';

  // Grouping for neat multi-line
  const groups = ['ffmpeg'];
  let idx = 1;
  while (idx < args.length) {
    const curr = rendered[idx];
    if (curr.startsWith('-') && idx + 1 < args.length && !args[idx + 1].startsWith('-')) {
      groups.push(`${curr} ${rendered[idx + 1]}`);
      idx += 2;
    } else {
      groups.push(curr);
      idx += 1;
    }
  }
  const multiLine = groups.join(lineJoiner);

  return {
    errors,
    singleLine,
    multiLine,
    activeCommand:
      (lineLayout ?? (shellFormat === 'single' ? 'single' : 'multiline')) === 'single' ? singleLine : multiLine,
    breakdown,
  };
}
