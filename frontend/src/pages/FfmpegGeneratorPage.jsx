import FfmpegCommandOutput from '../features/ffmpeg/components/FfmpegCommandOutput';
import FfmpegEncodingControls from '../features/ffmpeg/components/FfmpegEncodingControls';
import FfmpegPlayer from '../features/ffmpeg/components/FfmpegPlayer';
import { Button } from '../shared/ui';
import React from 'react';
import { Clapperboard, HelpCircle, X } from 'lucide-react';
import { useToast } from '../components/Toast';
import { useFfmpegGeneratorWorkflow } from '../features/ffmpeg/hooks/useFfmpegGeneratorWorkflow';
import '../features/ffmpeg/ffmpeg-generator.css';

export { isVideoFile } from '../hooks/useFfmpegVideo';

export default function FfmpegGeneratorPage() {
  const toast = useToast();

  const workflow = useFfmpegGeneratorWorkflow({ toast });
  const { showHelp, setShowHelp } = workflow;

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
              本地即時影片預覽，視覺化定位 Cut 起訖點與微調影格，提供極速無損複製（<code>-c copy</code>
              ）與進階編碼選項，產生指令後需自行在電腦執行。
            </p>
          </div>
          <Button
            variant="secondary"
            type="button"
            className="btn btn-secondary btn-icon"
            onClick={() => setShowHelp(!showHelp)}
            title="查看 FFmpeg 說明與常見技巧"
            aria-label="說明"
          >
            <HelpCircle size={18} aria-hidden="true" />
          </Button>
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
                <strong>無損流複製 (-c copy)</strong>
                ：不重編碼，裁切受關鍵影格限制；需要逐幀精準時請選擇重新編碼。
              </li>
              <li>
                <strong>Cut 前快速 vs 精確</strong>：置於 <code>-i</code>{' '}
                前利用關鍵影格（Keyframe）快速尋找，剪輯大檔秒級跳轉；置於 <code>-i</code> 後逐幀解碼，定位最精確。
              </li>
              <li>
                <strong>依環境引用參數</strong>：請選擇實際使用的 Shell。CMD
                無法可靠處理的字元會阻止複製，請改用其他環境。
              </li>
              <li>
                <strong>隱私安全</strong>：本地播放器直接透過瀏覽器解碼，影片<strong>絕對不會</strong>
                上傳到伺服器，安全零流量。
              </li>
            </ul>
          </div>
        )}
      </header>

      {/* Main Grid: Video Player + Cut Workspace */}
      <div className="ffmpeg-workbench-layout">
        {/* Left / Top: Video Player & Local Loader */}
        <FfmpegPlayer workflow={workflow} />

        {/* Right / Bottom: Cut & Preset Workbench */}
        <FfmpegEncodingControls workflow={workflow} />
      </div>

      {/* Command Output & Copy Section */}
      <FfmpegCommandOutput workflow={workflow} />
    </div>
  );
}
