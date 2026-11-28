import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import cases from '../../../../../backend/app/resources/ffmpeg-command-cases.v1.json';
import { buildFfmpegCommand, parseHmsToSeconds } from './ffmpegCommand';
import { PRESET_LIST } from './presets';
import type { CommandOptions } from './types';
import { useFfmpegGeneratorWorkflow } from '../hooks/useFfmpegGeneratorWorkflow';

const base: CommandOptions = {
  inputName: 'input.mp4',
  outputName: 'out.mp4',
  enableStartCut: false,
  startTime: '0',
  enableEndCut: false,
  endTime: '10',
  cutMode: 'to',
  durationCut: '10',
  seekMode: 'fast',
  transcodeMode: 'copy',
  videoCodec: 'copy',
  audioCodec: 'copy',
  crf: 23,
  encoderPreset: 'medium',
  resolution: 'original',
  fps: 'original',
};

const bash = process.env.TOOLBOX_TEST_BASH || (process.platform === 'win32' ? '' : 'bash');
const runFile = promisify(execFile);

describe.skipIf(!bash)('FFmpeg Bash argv', () => {
  describe.each(['single', 'multiline'] as const)('%s layout', (lineLayout) => {
    it.each(cases.filenames)('passes filename %s as one argument', async (inputName) => {
      const command = buildFfmpegCommand({ ...base, inputName, shellDialect: 'bash', lineLayout });
      expect(command.errors).toEqual({});
      const fakeFfmpeg = 'ffmpeg() { printf \'%s\\0\' "$@"; }';
      const { stdout } = await runFile(
        bash,
        ['--noprofile', '--norc', '-c', fakeFfmpeg + '\n' + command.activeCommand],
        {
          env: { ...process.env, BASH_ENV: '' },
          encoding: 'utf8',
          timeout: 3000,
        }
      );
      expect(stdout.split('\0')).toEqual(['-i', inputName, '-c', 'copy', base.outputName, '']);
    });
  });
});

describe('FFmpeg command validation', () => {
  it.each(cases.invalid_times)('rejects invalid time %s', (startTime) => {
    expect(parseHmsToSeconds(startTime)).toBeNaN();
    const result = buildFfmpegCommand({ ...base, enableStartCut: true, startTime });
    expect(result.errors.startTime).toBeTruthy();
    expect(result.activeCommand).toBe('');
  });
  it.each([
    { name: 'a CMD percent sign', patch: { inputName: '50%.mp4', shellDialect: 'cmd' }, field: 'inputName' },
    { name: 'a CMD exclamation mark', patch: { inputName: 'clip!.mp4', shellDialect: 'cmd' }, field: 'inputName' },
    { name: 'a CMD double quote', patch: { inputName: 'clip".mp4', shellDialect: 'cmd' }, field: 'inputName' },
    { name: 'the same input and output path', patch: { outputName: './input.mp4' }, field: 'outputName' },
    { name: 'an end time at the start', patch: { enableEndCut: true, endTime: '0' }, field: 'endTime' },
    {
      name: 'an end time beyond the video',
      patch: { enableEndCut: true, endTime: '30', sourceDuration: 20 },
      field: 'endTime',
    },
  ] as const)('rejects $name and disables command copying', ({ patch, field }) => {
    const result = buildFfmpegCommand({ ...base, ...patch });
    expect(result.errors).toEqual({ [field]: expect.any(String) });
    expect(result.activeCommand).toBe('');
  });
});

describe('FFmpeg preset transitions', () => {
  it('resets container and codec defaults after MP3/GIF, preserving custom filename stems', () => {
    const { result } = renderHook(() => useFfmpegGeneratorWorkflow({ toast: { success: () => {} } }));
    act(() => result.current.setOutputName('我的成品.mov'));
    act(() => result.current.applyPreset(PRESET_LIST.find((item) => item.id === 'extract-audio-mp3')));
    expect(result.current.outputName).toBe('我的成品.mp3');
    act(() => result.current.applyPreset(PRESET_LIST.find((item) => item.id === 'high-quality-h264')));
    expect(result.current.outputName).toBe('我的成品.mp4');
    expect(result.current.videoCodec).toBe('libx264');
    act(() => result.current.applyPreset(PRESET_LIST.find((item) => item.id === 'animated-gif')));
    act(() => result.current.applyPreset(PRESET_LIST[0]));
    expect(result.current.outputName).toBe('我的成品.mp4');
    expect(result.current.videoCodec).toBe('copy');
  });
});
