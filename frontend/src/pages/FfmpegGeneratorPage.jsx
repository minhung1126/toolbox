import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Clapperboard,
  Clock,
  Copy,
  HelpCircle,
  Scissors,
  Sliders,
  Terminal,
  X,
  Zap,
} from 'lucide-react';
import { useToast } from '../components/Toast';
import { copyToClipboard } from '../utils/clipboard';

import {
  PRESET_LIST,
  buildFfmpegCommand,
  buildTrimSummary,
} from '../utils/ffmpegCommand';

export default function FfmpegGeneratorPage() {
  const toast = useToast();

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
    return buildTrimSummary({
      enableStartCut,
      startTime,
      enableEndCut,
      cutMode,
      endTime,
      durationCut,
      duration: 0,
    });
  }, [
    enableStartCut,
    startTime,
    enableEndCut,
    cutMode,
    endTime,
    durationCut,
  ]);

  // Generated FFmpeg command
  const generatedCommand = useMemo(() => {
    return buildFfmpegCommand({
      inputName: inputName.trim() || 'input.mp4',
      outputName: outputName.trim() || 'output_cut.mp4',
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
    });
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
              視覺化設定 Cut 起訖點與進階編碼選項，提供極速無損複製（<code>-c copy</code>）與多種平台 Shell 格式，一鍵快速生成跨平台 FFmpeg 命令行指令。
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
                <strong>跨平台終端格式</strong>：支援單行指令、Bash ( \ )、PowerShell ( ` ) 與 CMD ( ^ ) 換行語法，複製即可直接在終端執行。
              </li>
            </ul>
          </div>
        )}
      </header>

      {/* Section 1: Presets, Cut Range, and Encoding Settings */}
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

      {/* Section 2: Command Output & Copy Section */}
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
