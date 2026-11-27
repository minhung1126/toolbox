import { execFile, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import cases from '../../../../../backend/app/resources/ffmpeg-command-cases.v1.json';
import { buildFfmpegCommand, parseHmsToSeconds } from './ffmpegCommand';
import { PRESET_LIST } from './presets';
import { useFfmpegGeneratorWorkflow } from '../hooks/useFfmpegGeneratorWorkflow';

function resolveBashExecutable(): string | null {
  if (process.platform !== 'win32') {
    return 'bash';
  }

  const candidates: string[] = [];
  const systemBashCandidates: string[] = [];
  try {
    const whereOutput = execFileSync('where.exe', ['bash'], { encoding: 'utf8', timeout: 5000 });
    for (const line of whereOutput.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      if (trimmed.toLowerCase().endsWith('\\system32\\bash.exe')) {
        systemBashCandidates.push(trimmed);
      } else {
        candidates.push(trimmed);
      }
    }
  } catch {
    // bash is not on PATH
  }

  const envCandidates: Array<[string | undefined, string]> = [
    [process.env.PROGRAMFILES, path.join('Git', 'bin', 'bash.exe')],
    [process.env.PROGRAMFILES, path.join('Git', 'usr', 'bin', 'bash.exe')],
    [process.env['PROGRAMFILES(X86)'], path.join('Git', 'bin', 'bash.exe')],
    [process.env.LOCALAPPDATA, path.join('Programs', 'Git', 'bin', 'bash.exe')],
  ];
  for (const [base, suffix] of envCandidates) {
    if (base) {
      candidates.push(path.join(base, suffix));
    }
  }

  try {
    const gitWhere = execFileSync('where.exe', ['git'], { encoding: 'utf8', timeout: 5000 });
    const gitPath = gitWhere
      .split(/\r?\n/)
      .find((line) => line.trim())
      ?.trim();
    if (gitPath) {
      const gitRoot = path.resolve(path.dirname(gitPath), '..');
      candidates.push(path.join(gitRoot, 'bin', 'bash.exe'), path.join(gitRoot, 'usr', 'bin', 'bash.exe'));
    }
  } catch {
    // git is not on PATH
  }

  candidates.push(...systemBashCandidates);

  const seen = new Set<string>();
  for (const candidate of candidates) {
    const normalized = candidate.toLowerCase();
    if (seen.has(normalized) || !existsSync(candidate)) {
      continue;
    }
    seen.add(normalized);
    try {
      const output = execFileSync(candidate, ['-c', "printf '%s' ok"], { encoding: 'utf8', timeout: 5000 });
      if (output === 'ok') {
        return candidate;
      }
    } catch {
      continue;
    }
  }
  return null;
}

const bashExecutable = resolveBashExecutable();

const base = {
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
} as const;
describe('FFmpeg executable command contract', () => {
  it.skipIf(!bashExecutable).each(cases.filenames)(
    'Bash receives literal filename %s in both layouts',
    async (inputName) => {
      if (!bashExecutable) {
        throw new Error('bash unavailable');
      }
      for (const lineLayout of ['single', 'multiline'] as const) {
        const command = buildFfmpegCommand({ ...base, inputName, shellDialect: 'bash', lineLayout });
        expect(command.errors).toEqual({});
        const { stdout: output } = await promisify(execFile)(
          bashExecutable,
          ['-c', `ffmpeg() { printf '%s\\0' "$@"; }; ${command.activeCommand}`],
          { encoding: 'utf8' }
        );
        const argv = output.toString().split('\0').slice(0, -1);
        expect(argv[argv.indexOf('-i') + 1]).toBe(inputName);
        expect(argv.at(-1)).toBe(base.outputName);
      }
    }
  );
  it.each(cases.invalid_times)('rejects invalid time %s', (startTime) => {
    expect(parseHmsToSeconds(startTime)).toBeNaN();
    const result = buildFfmpegCommand({ ...base, enableStartCut: true, startTime });
    expect(result.errors.startTime).toBeTruthy();
    expect(result.activeCommand).toBe('');
  });
  it('blocks unsafe CMD names, identical paths, reverse times and known out of bounds ranges', () => {
    for (const patch of [
      { inputName: '50%.mp4', shellDialect: 'cmd' },
      { outputName: './input.mp4' },
      { enableEndCut: true, endTime: '0' },
      { enableEndCut: true, endTime: '30', sourceDuration: 20 },
    ]) {
      const result = buildFfmpegCommand({ ...base, ...patch } as Parameters<typeof buildFfmpegCommand>[0]);
      expect(Object.keys(result.errors).length).toBeGreaterThan(0);
      expect(result.activeCommand).toBe('');
    }
  });
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
