import { Button } from '../../../shared/ui';
import { AlertCircle, Clock, FileVideo, Pause, Play, Sparkles, Upload, Video } from 'lucide-react';
import { formatFileSize, secondsToHms } from '../model/ffmpegCommand';
export default function FfmpegPlayer({ workflow }) {
  const {
    videoFile,
    videoUrl,
    isDragging,
    handleDrop,
    fileInputRef,
    videoRef,
    handleLoadedMetadata,
    handleTimeUpdate,
    togglePlay,
    isPlayingTrimmed,
    videoMeta,
    duration,
    videoError,
    startPercent,
    endPercent,
    cutStartSec,
    cutEndSec,
    enableStartCut,
    enableEndCut,
    currentTime,
    startTime,
    cutMode,
    endTime,
    isPlaying,
    setVideoFile,
    setVideoUrl,
    setVideoError,
    setIsDragging,
    handleSelectFile,
    setIsPlaying,
    setIsPlayingTrimmed,
    seekTo,
    seekRelative,
    playbackRate,
    setPlaybackSpeed,
  } = workflow;
  return (
    <section className="glass-panel card-padding ffmpeg-player-panel" aria-label="影片預覽播放器">
      <div className="panel-title-row">
        <div className="title-with-icon">
          <Video size={18} className="text-primary" />
          <h2>影片預覽與時間軸</h2>
        </div>
        {videoFile && (
          <div className="player-top-actions">
            <Button
              variant="secondary"
              type="button"
              className="btn btn-secondary btn-xs"
              onClick={() => {
                setVideoFile(null);
                setVideoUrl('');
                setVideoError(null);
              }}
            >
              更換影片
            </Button>
          </div>
        )}
      </div>

      {!videoUrl ? (
        /* Dropzone */
        <div
          className={`ffmpeg-dropzone ${isDragging ? 'drag-over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <input
            type="file"
            ref={fileInputRef}
            accept="video/*,.mp4,.webm,.mov,.mkv,.avi,.ts,.flv,.wmv,.m4v,.m2ts"
            hidden
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleSelectFile(e.target.files[0]);
              }
            }}
          />
          <div className="dropzone-inner">
            <Upload size={40} className="dropzone-icon" />
            <h3>選擇或拖曳本機影片至此處</h3>
            <p className="text-muted">支援 MP4, WebM, MOV, MKV, AVI 等常見影片格式</p>
            <Button variant="primary" type="button" onClick={() => fileInputRef.current?.click()}>
              選擇影片
            </Button>
            <div className="dropzone-note">
              <span>🔒 本機極速即時預覽，影片資料不耗費流量上傳至伺服器</span>
            </div>
          </div>
        </div>
      ) : (
        /* Video Player */
        <div className="ffmpeg-player-wrapper">
          <div className="video-container">
            <video
              ref={videoRef}
              src={videoUrl}
              preload="auto"
              onLoadedMetadata={handleLoadedMetadata}
              onTimeUpdate={handleTimeUpdate}
              onError={() => {
                setVideoError(
                  '瀏覽器無法直接解碼此影片格式（如特定 MKV/AVI/HEVC 編碼）。您仍可手動設定起訖時間，FFmpeg 命令行依舊完全可用。'
                );
              }}
              onEnded={() => {
                setIsPlaying(false);
                setIsPlayingTrimmed(false);
              }}
              playsInline
              onClick={togglePlay}
            />
            {isPlayingTrimmed && (
              <div className="trimmed-preview-badge">
                <Sparkles size={13} /> 正在預覽 Cut 選取片段
              </div>
            )}
          </div>

          {/* Video Info Bar */}
          <div className="video-meta-bar">
            <span className="meta-item">
              <FileVideo size={14} /> {videoMeta.name}
            </span>
            {videoMeta.width > 0 && (
              <span className="meta-item">
                {videoMeta.width} × {videoMeta.height}
              </span>
            )}
            {videoMeta.size > 0 && <span className="meta-item">{formatFileSize(videoMeta.size)}</span>}
            <span className="meta-item">
              <Clock size={14} /> 總長度: {secondsToHms(duration)}
            </span>
          </div>

          {videoError && (
            <div className="video-error-banner glass-panel">
              <AlertCircle size={16} className="text-warning" />
              <div className="error-text">
                <strong>影片預覽提示：</strong>
                <span>{videoError}</span>
              </div>
            </div>
          )}

          {/* Player Controls */}
          <div className="player-controls-container">
            {/* Timeline Slider with Cut Indicator */}
            <div className="timeline-slider-wrapper">
              <div className="timeline-track-container">
                {duration > 0 && (
                  <div
                    className="timeline-cut-range-highlight"
                    style={{
                      left: `${startPercent}%`,
                      width: `${Math.max(0, endPercent - startPercent)}%`,
                    }}
                    title={`Cut 範圍: ${secondsToHms(cutStartSec)} ~ ${secondsToHms(cutEndSec)}`}
                  />
                )}
                {duration > 0 && enableStartCut && (
                  <div
                    className="timeline-pin timeline-pin-start"
                    style={{ left: `${startPercent}%` }}
                    title={`起點: ${secondsToHms(cutStartSec)}`}
                  />
                )}
                {duration > 0 && enableEndCut && (
                  <div
                    className="timeline-pin timeline-pin-end"
                    style={{ left: `${endPercent}%` }}
                    title={`終點: ${secondsToHms(cutEndSec)}`}
                  />
                )}
                <input
                  type="range"
                  className="timeline-slider"
                  min={0}
                  max={duration || 100}
                  step={0.01}
                  value={currentTime}
                  onChange={(e) => seekTo(parseFloat(e.target.value))}
                  aria-label="影片時間軸滑桿"
                />
              </div>
              <div className="timeline-time-display">
                <span className="current-time">{secondsToHms(currentTime)}</span>
                <div className="cut-indicator-badges">
                  {enableStartCut && (
                    <span className="badge-cut-start" title="起始點">
                      始: {startTime}
                    </span>
                  )}
                  {enableEndCut && (
                    <span className="badge-cut-end" title="結束點">
                      止: {cutMode === 'to' ? endTime : secondsToHms(cutEndSec)}
                    </span>
                  )}
                </div>
                <span className="total-duration">/ {secondsToHms(duration)}</span>
              </div>
            </div>

            {/* Primary Button Bar */}
            <div className="player-btn-bar">
              <div className="playback-group">
                <Button
                  variant="primary"
                  type="button"
                  className="btn btn-primary btn-icon"
                  onClick={togglePlay}
                  aria-label={isPlaying ? '暫停' : '播放'}
                >
                  {isPlaying ? <Pause size={18} /> : <Play size={18} />}
                </Button>

                {/* Step buttons */}
                <Button
                  variant="secondary"
                  size="sm"
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => seekRelative(-1)}
                  title="後退 1 秒"
                >
                  -1s
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => seekRelative(-0.1)}
                  title="後退 0.1 秒（逐影格微調）"
                >
                  -0.1s
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => seekRelative(0.1)}
                  title="前進 0.1 秒（逐影格微調）"
                >
                  +0.1s
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => seekRelative(1)}
                  title="前進 1 秒"
                >
                  +1s
                </Button>
              </div>

              {/* Playback speed */}
              <div className="speed-group">
                <span className="speed-label">倍速:</span>
                {[0.5, 1, 1.5, 2].map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    className={`btn btn-xs ${playbackRate === rate ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setPlaybackSpeed(rate)}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
