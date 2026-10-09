import { Button } from '../../../shared/ui';
import { AlertCircle, Clock, Pause, Play, Scissors, Sliders, Zap } from 'lucide-react';
import { parseHmsToSeconds } from '../model/ffmpegCommand';
import { PRESET_LIST } from '../model/presets';
export default function FfmpegEncodingControls({ workflow }) {
  const {
    enableStartCut,
    handleSetStartTimeToCurrent,
    videoUrl,
    startTime,
    seekMode,
    enableEndCut,
    handleSetEndTimeToCurrent,
    cutMode,
    endTime,
    durationCut,
    trimSummary,
    isPlayingTrimmed,
    playTrimmedSegment,
    transcodeMode,
    videoCodec,
    crf,
    resolution,
    fps,
    audioCodec,
    audioBitrate,
    activePreset,
    applyPreset,
    setEnableStartCut,
    setStartTime,
    seekTo,
    setSeekMode,
    setEnableEndCut,
    setCutMode,
    setEndTime,
    setDurationCut,
    videoRef,
    setIsPlaying,
    setIsPlayingTrimmed,
    setTranscodeMode,
    setVideoCodec,
    setAudioCodec,
    setCrf,
    setResolution,
    setFps,
    setAudioBitrate,
  } = workflow;
  return (
    <section className="glass-panel card-padding ffmpeg-controls-panel" aria-label="剪輯起訖與編碼設定">
      {/* Presets Bar */}
      <div className="section-block">
        <label className="ui-field-label">常用預設範本</label>
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
            <Button
              variant="secondary"
              type="button"
              className="btn btn-secondary btn-xs"
              onClick={handleSetStartTimeToCurrent}
              disabled={!enableStartCut || !videoUrl}
              title="將目前播放進度設為起點"
            >
              設為目前進度
            </Button>
          </div>

          <div className="cut-card-body">
            <div className="input-with-action">
              <input
                type="text"
                className="ui-text-field"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                disabled={!enableStartCut}
                placeholder="00:00:00.000"
                aria-label="剪輯起始時間"
              />
              <Button
                variant="secondary"
                size="sm"
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => seekTo(parseHmsToSeconds(startTime))}
                disabled={!enableStartCut || !videoUrl}
                title="跳至起點影格預覽"
              >
                跳至起點
              </Button>
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
            <Button
              variant="secondary"
              type="button"
              className="btn btn-secondary btn-xs"
              onClick={handleSetEndTimeToCurrent}
              disabled={!enableEndCut || !videoUrl}
              title="將目前播放進度設為結束點"
            >
              設為目前進度
            </Button>
          </div>

          <div className="cut-card-body">
            <div className="cut-mode-toggle">
              <button
                type="button"
                className={`btn btn-xs ${cutMode === 'to' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setCutMode('to')}
              >
                結束時間
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
                className="ui-text-field"
                value={cutMode === 'to' ? endTime : durationCut}
                onChange={(e) => {
                  if (cutMode === 'to') setEndTime(e.target.value);
                  else setDurationCut(e.target.value);
                }}
                disabled={!enableEndCut}
                placeholder="00:00:10.000"
                aria-label="剪輯結束時間或長度"
              />
              <Button
                variant="secondary"
                size="sm"
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  if (cutMode === 'to') seekTo(parseHmsToSeconds(endTime));
                  else {
                    const start = enableStartCut ? parseHmsToSeconds(startTime) : 0;
                    seekTo(start + parseHmsToSeconds(durationCut));
                  }
                }}
                disabled={!enableEndCut || !videoUrl}
                title="跳至終點影格預覽"
              >
                跳至終點
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Trim Status Summary Bar */}
      <div className="trim-summary-bar">
        <div className="summary-left">
          <span className="summary-tag">
            <Clock size={13} /> 剪輯後長度: <strong>{trimSummary.formattedDuration}</strong> (
            {trimSummary.clipDurationSec.toFixed(2)} 秒)
          </span>
          {trimSummary.isInvalid && (
            <span className="summary-error">
              <AlertCircle size={14} /> 起始時間不能大於結束時間！
            </span>
          )}
        </div>
        {videoUrl && (
          <button
            type="button"
            className={`btn ${isPlayingTrimmed ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={
              isPlayingTrimmed
                ? () => {
                    if (videoRef.current) videoRef.current.pause();
                    setIsPlaying(false);
                    setIsPlayingTrimmed(false);
                  }
                : playTrimmedSegment
            }
            disabled={trimSummary.isInvalid}
            aria-label={isPlayingTrimmed ? '停止預覽片段' : '預覽選取片段'}
          >
            {isPlayingTrimmed ? <Pause size={14} /> : <Play size={14} />}
            <span>{isPlayingTrimmed ? '停止片段預覽' : '預覽選取片段'}</span>
          </button>
        )}
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
              ⚡ <strong>無損複製模式已啟用</strong>：跳過耗時的 CPU/GPU 轉檔，直接將封裝流剪輯輸出，100%
              維持原始畫質與聲音，耗時極短（通常數秒內完成）。
            </p>
          </div>
        ) : (
          /* Re-encode detailed options */
          <div className="reencode-options-grid glass-panel card-padding">
            <div className="ui-field">
              <label className="ui-field-label" htmlFor="ffmpeg-video-codec">
                視訊編碼器 (-c:v)
              </label>
              <select
                id="ffmpeg-video-codec"
                className="ui-text-field"
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

            <div className="ui-field">
              <label className="ui-field-label" htmlFor="ffmpeg-crf">
                畫質係數 CRF (目前: {crf})
                <span className="text-dim text-xs ml-2">
                  {crf <= 19 ? '超高畫質' : crf <= 24 ? '畫質平衡' : '高壓縮小檔'}
                </span>
              </label>
              <input
                id="ffmpeg-crf"
                type="range"
                min={16}
                max={32}
                value={crf}
                onChange={(e) => setCrf(parseInt(e.target.value, 10))}
                className="range-field"
              />
            </div>

            <div className="ui-field">
              <label className="ui-field-label" htmlFor="ffmpeg-resolution">
                解析度縮放
              </label>
              <select
                id="ffmpeg-resolution"
                className="ui-text-field"
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

            <div className="ui-field">
              <label className="ui-field-label" htmlFor="ffmpeg-fps">
                影格率 (FPS)
              </label>
              <select id="ffmpeg-fps" className="ui-text-field" value={fps} onChange={(e) => setFps(e.target.value)}>
                <option value="original">維持原始幀率</option>
                <option value="24">24 fps (電影感)</option>
                <option value="30">30 fps (標準影片)</option>
                <option value="60">60 fps (流暢遊戲/動作)</option>
              </select>
            </div>

            <div className="ui-field">
              <label className="ui-field-label" htmlFor="ffmpeg-audio-codec">
                音訊編碼器 (-c:a)
              </label>
              <select
                id="ffmpeg-audio-codec"
                className="ui-text-field"
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

            <div className="ui-field">
              <label className="ui-field-label" htmlFor="ffmpeg-audio-bitrate">
                音訊碼率 (-b:a)
              </label>
              <select
                id="ffmpeg-audio-bitrate"
                className="ui-text-field"
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
  );
}
