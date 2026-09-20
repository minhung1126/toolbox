import { describe, expect, it } from 'vitest';
import {
  PRESET_LIST,
  buildFfmpegCommand,
  buildTrimSummary,
  formatFileSize,
  parseHmsToSeconds,
  quoteFilename,
  secondsToHms,
} from './ffmpegCommand';

describe('ffmpegCommand utils', () => {
  describe('time formatting and parsing', () => {
    it('converts seconds to HH:MM:SS.mmm format', () => {
      expect(secondsToHms(0)).toBe('00:00:00.000');
      expect(secondsToHms(65.5)).toBe('00:01:05.500');
      expect(secondsToHms(3661)).toBe('01:01:01.000');
      expect(secondsToHms(-1)).toBe('00:00:00.000');
    });

    it('parses HH:MM:SS.mmm string to seconds', () => {
      expect(parseHmsToSeconds('00:01:05.500')).toBe(65.5);
      expect(parseHmsToSeconds('01:00:00')).toBe(3600);
      expect(parseHmsToSeconds('02:30')).toBe(150);
      expect(parseHmsToSeconds('')).toBe(0);
      expect(parseHmsToSeconds('invalid')).toBe(0);
    });

    it('formats file sizes accurately', () => {
      expect(formatFileSize(500)).toBe('500.0 B');
      expect(formatFileSize(1024)).toBe('1.0 KB');
      expect(formatFileSize(1048576)).toBe('1.0 MB');
      expect(formatFileSize(0)).toBe('0 B');
    });
  });

  describe('buildTrimSummary', () => {
    it('computes cut endpoints and duration', () => {
      const summary = buildTrimSummary({
        enableStartCut: true,
        startTime: '00:00:10.000',
        enableEndCut: true,
        cutMode: 'to',
        endTime: '00:00:40.000',
        durationCut: '00:00:30.000',
        duration: 100,
      });

      expect(summary.startSec).toBe(10);
      expect(summary.endSec).toBe(40);
      expect(summary.clipDurationSec).toBe(30);
      expect(summary.formattedDuration).toBe('00:00:30.000');
      expect(summary.isInvalid).toBe(false);
    });

    it('flags invalid timestamps when start exceeds end', () => {
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
  });

  describe('quoteFilename', () => {
    it('wraps plain filenames in double quotes', () => {
      expect(quoteFilename('video.mp4')).toBe('"video.mp4"');
      expect(quoteFilename('my video.mp4')).toBe('"my video.mp4"');
      expect(quoteFilename('clip [1080p] (cut).mp4')).toBe('"clip [1080p] (cut).mp4"');
    });

    it('preserves double quotes if already quoted', () => {
      expect(quoteFilename('"video.mp4"')).toBe('"video.mp4"');
      expect(quoteFilename('"my video.mp4"')).toBe('"my video.mp4"');
    });

    it('escapes internal double quotes and backslashes', () => {
      expect(quoteFilename('my "special" video.mp4')).toBe('"my \\"special\\" video.mp4"');
      expect(quoteFilename('path\\to\\file.mp4')).toBe('"path\\\\to\\\\file.mp4"');
    });

    it('returns empty quotes for falsy or empty inputs', () => {
      expect(quoteFilename('')).toBe('""');
      expect(quoteFilename('   ')).toBe('""');
      expect(quoteFilename(null)).toBe('""');
    });
  });

  describe('buildFfmpegCommand', () => {
    it('generates lossless trim copy command by default with double quotes', () => {
      const cmd = buildFfmpegCommand({
        inputName: 'video.mp4',
        outputName: 'video_cut.mp4',
        enableStartCut: true,
        startTime: '00:00:05.000',
        seekMode: 'fast',
        enableEndCut: true,
        cutMode: 'to',
        endTime: '00:00:20.000',
        durationCut: '00:00:15.000',
        transcodeMode: 'copy',
        videoCodec: 'copy',
        audioCodec: 'copy',
        crf: 23,
        encoderPreset: 'medium',
        resolution: 'original',
        fps: 'original',
        shellFormat: 'bash',
      });

      expect(cmd.singleLine).toContain('ffmpeg -ss 00:00:05.000 -i "video.mp4" -to 00:00:20.000 -c copy "video_cut.mp4"');
      expect(cmd.breakdown.length).toBeGreaterThan(3);
    });

    it('quotes files with spaces and retains quotes when already present', () => {
      const cmd = buildFfmpegCommand({
        inputName: 'my input video.mp4',
        outputName: '"already_quoted.mp4"',
        enableStartCut: false,
        startTime: '00:00:00.000',
        seekMode: 'fast',
        enableEndCut: false,
        cutMode: 'to',
        endTime: '00:00:10.000',
        durationCut: '00:00:10.000',
        transcodeMode: 'copy',
        videoCodec: 'copy',
        audioCodec: 'copy',
        crf: 23,
        encoderPreset: 'medium',
        resolution: 'original',
        fps: 'original',
        shellFormat: 'single',
      });

      expect(cmd.singleLine).toContain('"my input video.mp4"');
      expect(cmd.singleLine).toContain('"already_quoted.mp4"');
      expect(cmd.singleLine).not.toContain('""already_quoted.mp4""');
    });
  });

  describe('PRESET_LIST', () => {
    it('defines standard presets including lossless, h264, gif', () => {
      expect(PRESET_LIST.some((p) => p.id === 'lossless-trim')).toBe(true);
      expect(PRESET_LIST.some((p) => p.id === 'animated-gif')).toBe(true);
      expect(PRESET_LIST.some((p) => p.id === 'extract-audio-mp3')).toBe(true);
    });
  });
});
