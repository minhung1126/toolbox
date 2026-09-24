import type { LucideIcon } from 'lucide-react';

export type CutMode = 'to' | 'duration';
export type SeekMode = 'fast' | 'accurate';
export type TranscodeMode = 'copy' | 'reencode' | 'audio' | 'gif';
export type ShellFormat = 'single' | 'bash' | 'powershell' | 'cmd';

export interface CutOptions {
  enableStartCut: boolean;
  startTime: string;
  enableEndCut: boolean;
  cutMode: CutMode;
  endTime: string;
  durationCut: string;
}

export interface TrimOptions extends CutOptions {
  duration: number;
}

export interface TrimSummary {
  startSec: number;
  endSec: number;
  clipDurationSec: number;
  formattedDuration: string;
  isInvalid: boolean;
}

export interface CommandOptions extends CutOptions {
  inputName: string;
  outputName: string;
  seekMode: SeekMode;
  transcodeMode: TranscodeMode;
  videoCodec: string;
  audioCodec: string;
  crf: number;
  encoderPreset: string;
  resolution: string;
  fps: string;
  customFilters?: string;
  audioBitrate?: string;
  audioVolume?: string;
  shellFormat?: ShellFormat;
}

export interface GeneratedCommand {
  singleLine: string;
  multiLine: string;
  activeCommand: string;
  breakdown: Array<{ flag: string; label: string }>;
}

export interface FfmpegPreset {
  id: string;
  name: string;
  mode: TranscodeMode;
  badge?: string;
  icon: LucideIcon;
  desc: string;
  videoCodec?: string;
  audioCodec?: string;
  crf?: number;
  preset?: string;
  resolution?: string;
  audioBitrate?: string;
  outputExt?: string;
}
