import { describe, expect, it } from 'vitest';
import { buildFfmpegCommand, buildTrimSummary } from './ffmpegCommand';
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
      'ffmpeg -i "clip.mp4" -ss 00:00:05.000 -t 00:00:15.000 -c copy "output.mp4"'
    );
    expect(buildTrimSummary({ ...options, duration: 100 }).endSec).toBe(20);
  });

  it('keeps the selected source end time when fast seeking moves the output timeline', () => {
    const endCutOptions = {
      ...options,
      seekMode: 'fast' as const,
      cutMode: 'to' as const,
      startTime: '00:00:02.000',
      endTime: '00:00:04.000',
    };
    const summary = buildTrimSummary({ ...endCutOptions, duration: 8 });
    const command = buildFfmpegCommand(endCutOptions);

    expect(summary.clipDurationSec).toBe(2);
    expect(command.singleLine).toBe('ffmpeg -ss 00:00:02.000 -i "clip.mp4" -t 00:00:02.000 -c copy "output.mp4"');
    expect(command.breakdown).toContainEqual({
      flag: '-t 00:00:02.000',
      label: '從起點裁切 00:00:02.000，至原影片時間點 00:00:04.000',
    });
  });

  it('uses the original end timestamp for accurate seeking and for disabled start cuts', () => {
    const endCutOptions = { ...options, cutMode: 'to' as const };
    expect(buildFfmpegCommand(endCutOptions).singleLine).toBe(
      'ffmpeg -i "clip.mp4" -ss 00:00:05.000 -to 00:00:20.000 -c copy "output.mp4"'
    );
    expect(buildFfmpegCommand({ ...endCutOptions, seekMode: 'fast', enableStartCut: false }).singleLine).toBe(
      'ffmpeg -i "clip.mp4" -to 00:00:20.000 -c copy "output.mp4"'
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
    expect(command.singleLine).toContain('-vn -c:a libmp3lame -b:a 192k "output.mp3"');
    expect(command.singleLine).not.toContain('-c:v');
  });

  it('keeps GIF palette generation separate from audio options', () => {
    const command = buildFfmpegCommand({ ...options, transcodeMode: 'gif', outputName: 'output.gif' });
    expect(command.singleLine).toContain('palettegen[p];[s1][p]paletteuse');
    expect(command.singleLine).not.toContain('-c:a');
  });
});
