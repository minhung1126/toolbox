import { Clapperboard, Music, Sliders, Sparkles, Video, VolumeX, Zap } from 'lucide-react';
import type { FfmpegPreset } from './types';
import data from '../../../../../backend/app/resources/ffmpeg-presets.v1.json';
const icons = [Zap, Video, Sliders, Clapperboard, Music, VolumeX, Sparkles];
export const PRESET_LIST: FfmpegPreset[] = data.presets.map((item, index) => ({
  id: item.id,
  name: item.name,
  mode: item.mode as FfmpegPreset['mode'],
  desc: item.description,
  icon: icons[index],
  videoCodec: item.video_codec,
  audioCodec: item.audio_codec,
  crf: item.crf,
  preset: item.preset,
  resolution: item.resolution,
  audioBitrate: item.audio_bitrate,
  outputExt: item.output_ext,
}));
