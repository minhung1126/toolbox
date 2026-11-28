import { describe, expect, it } from 'vitest';
import {
  buildFfmpegCommand,
  buildTrimSummary,
  formatFileSize,
  parseHmsToSeconds,
  quoteFilename,
  secondsToHms,
} from './ffmpegCommand';
import { PRESET_LIST } from './presets';
import type { CommandOptions } from './types';

const options: CommandOptions = {
  inputName: 'clip.mp4',
  outputName: 'output.mp4',
  enableStartCut: true,
  startTime: '00:00:05.000',
  enableEndCut: true,
  cutMode: 'duration',
  endTime: '00:00:20.000',
  durationCut: '00:00:15.000',
  seekMode: 'accurate',
  transcodeMode: 'copy',
  videoCodec: 'copy',
  audioCodec: 'copy',
  crf: 23,
  encoderPreset: 'medium',
  resolution: 'original',
  fps: 'original',
  audioVolume: '100%',
};

describe('FFmpeg feature command model', () => {
  it('places accurate seek after input and uses duration cuts', () => {
    expect(buildFfmpegCommand(options).singleLine).toBe(
      `ffmpeg -i 'clip.mp4' -ss 00:00:05.000 -t 00:00:15.000 -c copy 'output.mp4'`
    );
    expect(buildTrimSummary({ ...options, duration: 100 }).endSec).toBe(20);
  });

  it.each([
    ['00:00:02.000', '00:00:04.000', '00:00:02.000', 2],
    ['00:00:05.000', '00:00:20.000', '00:00:15.000', 15],
  ] as const)(
    'keeps the selected source end time when fast seeking from %s to %s',
    (startTime, endTime, clipTime, seconds) => {
      const endCutOptions = {
        ...options,
        seekMode: 'fast' as const,
        cutMode: 'to' as const,
        shellFormat: 'bash' as const,
        startTime,
        endTime,
      };
      const summary = buildTrimSummary({ ...endCutOptions, duration: 30 });
      const command = buildFfmpegCommand(endCutOptions);

      expect(summary.clipDurationSec).toBe(seconds);
      expect(command.singleLine).toBe(`ffmpeg -ss ${startTime} -i 'clip.mp4' -t ${clipTime} -c copy 'output.mp4'`);
      expect(command.breakdown).toContainEqual({
        flag: `-t ${clipTime}`,
        label: `從起點裁切 ${clipTime}，至原影片時間點 ${endTime}`,
      });
    }
  );

  it('uses the original end timestamp for accurate seeking and for disabled start cuts', () => {
    const endCutOptions = { ...options, cutMode: 'to' as const };
    expect(buildFfmpegCommand(endCutOptions).singleLine).toBe(
      `ffmpeg -i 'clip.mp4' -ss 00:00:05.000 -to 00:00:20.000 -c copy 'output.mp4'`
    );
    expect(buildFfmpegCommand({ ...endCutOptions, seekMode: 'fast', enableStartCut: false }).singleLine).toBe(
      `ffmpeg -i 'clip.mp4' -to 00:00:20.000 -c copy 'output.mp4'`
    );
  });

  it.each([
    ['bash', ' \\\n  '],
    ['powershell', ' `\n  '],
    ['cmd', ' ^\n  '],
  ] as const)('uses the %s continuation syntax without changing argument order', (shellFormat, continuation) => {
    const command = buildFfmpegCommand({ ...options, shellFormat });
    expect(command.activeCommand).toBe(command.multiLine);
    expect(command.multiLine.split(continuation).join(' ')).toBe(command.singleLine);
  });

  it('combines scale and frame filters with reencoding and removes muted audio', () => {
    const command = buildFfmpegCommand({
      ...options,
      transcodeMode: 'reencode',
      videoCodec: 'libx264',
      audioCodec: 'none',
      resolution: 'shorts_9_16',
      fps: '30',
      shellFormat: 'single',
    });
    expect(command.activeCommand).toContain('-c:v libx264 -crf 23 -preset medium');
    expect(command.activeCommand).toContain('pad=1080:1920:(ow-iw)/2:(oh-ih)/2,fps=30');
    expect(command.activeCommand).toContain('-an');
  });

  it('extracts audio without adding video encoding flags', () => {
    const command = buildFfmpegCommand({
      ...options,
      transcodeMode: 'audio',
      audioCodec: 'libmp3lame',
      audioBitrate: '192k',
      outputName: 'output.mp3',
    });
    expect(command.singleLine).toContain(`-vn -c:a libmp3lame -b:a 192k 'output.mp3'`);
    expect(command.singleLine).not.toContain('-c:v');
  });

  it('keeps GIF palette generation separate from audio options', () => {
    const command = buildFfmpegCommand({ ...options, transcodeMode: 'gif', outputName: 'output.gif' });
    expect(command.singleLine).toContain('palettegen[p];[s1][p]paletteuse');
    expect(command.singleLine).not.toContain('-c:a');
  });

  it('converts seconds to HH:MM:SS.mmm and parses HMS strings', () => {
    expect(secondsToHms(0)).toBe('00:00:00.000');
    expect(secondsToHms(65.5)).toBe('00:01:05.500');
    expect(secondsToHms(3661)).toBe('01:01:01.000');
    expect(secondsToHms(-1)).toBe('00:00:00.000');

    expect(parseHmsToSeconds('00:01:05.500')).toBe(65.5);
    expect(parseHmsToSeconds('01:00:00')).toBe(3600);
    expect(parseHmsToSeconds('02:30')).toBe(150);
    expect(parseHmsToSeconds('')).toBeNaN();
    expect(parseHmsToSeconds('invalid')).toBeNaN();
  });

  it('formats file sizes and flags invalid trim ranges', () => {
    expect(formatFileSize(500)).toBe('500.0 B');
    expect(formatFileSize(1024)).toBe('1.0 KB');
    expect(formatFileSize(1048576)).toBe('1.0 MB');
    expect(formatFileSize(0)).toBe('0 B');

    const summary = buildTrimSummary({
      enableStartCut: true,
      startTime: '00:01:00.000',
      enableEndCut: true,
      cutMode: 'to',
      endTime: '00:00:30.000',
      durationCut: '00:00:30.000',
      duration: 100,
    });
    expect(summary.isInvalid).toBe(true);
  });

  it('quotes filenames safely and retains existing quotes in buildFfmpegCommand', () => {
    expect(quoteFilename('video.mp4')).toBe("'video.mp4'");
    expect(quoteFilename('"video.mp4"')).toBe(`'"video.mp4"'`);
    expect(quoteFilename('   ')).toBe("'   '");
    expect(quoteFilename('')).toBe("''");

    const cmd = buildFfmpegCommand({
      ...options,
      inputName: 'my input video.mp4',
      outputName: `'"already_quoted.mp4"'`,
      enableStartCut: false,
      startTime: '00:00:00.000',
      seekMode: 'fast',
      enableEndCut: false,
      shellFormat: 'single',
    });
    expect(cmd.singleLine).toContain(`'my input video.mp4'`);
    expect(cmd.singleLine).toContain(`'"already_quoted.mp4"'`);
    expect(cmd.singleLine).not.toContain('""already_quoted.mp4""');
  });

  it('defines standard presets including lossless, h264, gif', () => {
    expect(PRESET_LIST.some((p) => p.id === 'lossless-trim')).toBe(true);
    expect(PRESET_LIST.some((p) => p.id === 'animated-gif')).toBe(true);
    expect(PRESET_LIST.some((p) => p.id === 'extract-audio-mp3')).toBe(true);
  });
});
