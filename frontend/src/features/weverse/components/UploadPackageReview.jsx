import { AlertTriangle, Clock, FileText, Loader2, Video } from 'lucide-react';
import { StatusMessage } from '../../../components/StatusMessage';
import { Button } from '../../../shared/ui';
import { COMMON_BCP47_LANGS, YOUTUBE_CATEGORIES } from '../model/options';
export default function UploadPackageReview({
  handleReset,
  videoInfo,
  packageSource,
  metadata,
  enabledSubsCount,
  subtitles,
  estimatedQuota,
  uploadOutcomeUncertain,
  uploadStarting,
  isVideoAuthConnected,
  setMetadata,
  handleToggleAllSubs,
  handleToggleSub,
  handleSubChange,
  setUploadConfirmOpen,
}) {
  return (
    <div className="glass-panel weverse-review-panel">
      <div className="weverse-review-header">
        <h3 className="weverse-review-title">
          <FileText size={20} color="var(--primary)" /> 步驟二：辨識結果複查與編輯
        </h3>
        <Button
          variant="secondary"
          size="sm"
          type="button"
          className="btn btn-sm btn-secondary"
          onClick={handleReset}
          disabled={uploadStarting}
        >
          重新選擇資料夾
        </Button>
      </div>

      {/* Video summary card */}
      {videoInfo && (
        <div className="weverse-video-summary">
          <div className="weverse-video-summary-content">
            <Video size={24} color="var(--primary)" className="weverse-video-summary-icon" />
            <div>
              <div className="weverse-video-filename">{videoInfo.filename}</div>
              <div className="weverse-video-details">
                檔案大小：{videoInfo.size_formatted}
                {videoInfo.full_path ? ` · 路徑：${videoInfo.full_path}` : ''}
              </div>
            </div>
          </div>
          <span className="badge badge-connected weverse-video-ready">主要影片已就緒</span>
        </div>
      )}

      {uploadStarting && (
        <StatusMessage
          tone="info"
          title={packageSource === 'browser_files' ? '正在傳送影片與字幕' : '正在建立上傳任務'}
        >
          {packageSource === 'browser_files'
            ? '正在將檔案傳送至伺服器，完成後會加入 YouTube 上傳佇列。請保持此頁開啟，傳輸期間暫停編輯與重新選擇資料夾。'
            : '正在將影片與字幕加入 YouTube 上傳佇列。請保持此頁開啟，任務建立期間暫停編輯與重新選擇資料夾。'}
        </StatusMessage>
      )}

      {/* Video Metadata Settings */}
      <div className="weverse-metadata-grid">
        <div className="weverse-metadata-field">
          <label className="weverse-field-label" htmlFor="weverse-video-title">
            影片標題 (Title) <span className="weverse-required">*</span>
            <span className="weverse-field-counter">{metadata.title.length}/100</span>
          </label>
          <input
            type="text"
            id="weverse-video-title"
            className="ui-text-field"
            disabled={uploadStarting}
            value={metadata.title}
            maxLength={100}
            onChange={(e) => setMetadata({ ...metadata, title: e.target.value })}
            placeholder="輸入 YouTube 影片標題"
          />
        </div>

        <div className="weverse-metadata-field">
          <label className="weverse-field-label" htmlFor="weverse-video-privacy">
            公開隱私狀態 (Privacy Status)
          </label>
          <select
            id="weverse-video-privacy"
            className="ui-text-field"
            disabled={uploadStarting}
            value={metadata.privacy_status}
            onChange={(e) => setMetadata({ ...metadata, privacy_status: e.target.value })}
          >
            <option value="private">私人 (Private - 推薦)</option>
            <option value="unlisted">不公開 (Unlisted)</option>
            <option value="public">公開 (Public)</option>
          </select>
        </div>

        <div className="weverse-metadata-field">
          <label className="weverse-field-label" htmlFor="weverse-video-category">
            影片類別 (Category)
          </label>
          <select
            id="weverse-video-category"
            className="ui-text-field"
            disabled={uploadStarting}
            value={metadata.category_id}
            onChange={(e) => setMetadata({ ...metadata, category_id: e.target.value })}
          >
            {YOUTUBE_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="weverse-metadata-field">
          <label className="weverse-field-label" htmlFor="weverse-video-tags">
            標籤 (Tags, 逗號分隔)
          </label>
          <input
            type="text"
            id="weverse-video-tags"
            className="ui-text-field"
            disabled={uploadStarting}
            value={metadata.tags}
            onChange={(e) => setMetadata({ ...metadata, tags: e.target.value })}
            placeholder="例如：weverse, live, idol"
          />
        </div>
      </div>

      <div className="weverse-description-field">
        <label className="weverse-field-label" htmlFor="weverse-video-description">
          影片說明 (Description)
          <span className="weverse-field-counter">{metadata.description.length}/5000</span>
        </label>
        <textarea
          id="weverse-video-description"
          rows={3}
          maxLength={5000}
          value={metadata.description}
          onChange={(e) => setMetadata({ ...metadata, description: e.target.value })}
          placeholder="輸入影片詳細說明內容..."
          className="ui-text-field weverse-video-description-input"
          disabled={uploadStarting}
        />
      </div>

      {/* Subtitles review section */}
      <div className="weverse-subtitle-section">
        <div className="weverse-subtitle-header">
          <div>
            <h4 className="weverse-subtitle-title">
              字幕軌清單與語言對照
              <span className="weverse-subtitle-count">
                (已勾選 {enabledSubsCount} / {subtitles.length} 軌)
              </span>
            </h4>
          </div>
          <div className="weverse-subtitle-actions">
            <Button
              variant="secondary"
              size="sm"
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={() => handleToggleAllSubs(true)}
              disabled={uploadStarting}
            >
              全選
            </Button>
            <Button
              variant="secondary"
              size="sm"
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={() => handleToggleAllSubs(false)}
              disabled={uploadStarting}
            >
              全消
            </Button>
          </div>
        </div>

        {subtitles.length === 0 ? (
          <div className="weverse-subtitle-empty">此資料夾中未偵測到任何 .vtt 或 .srt 字幕檔案。</div>
        ) : (
          <div className="weverse-subtitle-table-wrap">
            <table className="weverse-subtitle-table">
              <thead>
                <tr className="weverse-subtitle-table-head">
                  <th className="weverse-subtitle-table-heading weverse-subtitle-table-heading-upload">上傳</th>
                  <th className="weverse-subtitle-table-heading">原字幕檔名 / 偵測代碼</th>
                  <th className="weverse-subtitle-table-heading">YouTube 語言代碼 (BCP-47)</th>
                  <th className="weverse-subtitle-table-heading">字幕軌顯示名稱 (Label)</th>
                  <th className="weverse-subtitle-table-heading weverse-subtitle-table-heading-size">大小</th>
                </tr>
              </thead>
              <tbody>
                {subtitles.map((sub) => (
                  <tr key={sub.id} className={`weverse-subtitle-row ${sub.enabled ? 'is-enabled' : 'is-disabled'}`}>
                    <td className="weverse-subtitle-cell weverse-subtitle-cell-upload">
                      <input
                        type="checkbox"
                        checked={sub.enabled}
                        disabled={uploadStarting}
                        onChange={() => handleToggleSub(sub.id)}
                        className="weverse-subtitle-checkbox"
                      />
                    </td>
                    <td className="weverse-subtitle-cell">
                      <div className="weverse-subtitle-filename">{sub.filename}</div>
                      <span className="weverse-subtitle-language-code">代碼：{sub.raw_lang || '未知'}</span>
                    </td>
                    <td className="weverse-subtitle-cell">
                      <input
                        type="text"
                        value={sub.bcp47}
                        disabled={uploadStarting || !sub.enabled}
                        onChange={(e) => handleSubChange(sub.id, 'bcp47', e.target.value)}
                        list="bcp47-suggestions"
                        className="ui-text-field input-sm weverse-subtitle-language-input"
                      />
                    </td>
                    <td className="weverse-subtitle-cell">
                      <input
                        type="text"
                        value={sub.label}
                        disabled={uploadStarting || !sub.enabled}
                        onChange={(e) => handleSubChange(sub.id, 'label', e.target.value)}
                        className="ui-text-field input-sm weverse-subtitle-label-input"
                      />
                    </td>
                    <td className="weverse-subtitle-cell weverse-subtitle-cell-size">{sub.size_formatted}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <datalist id="bcp47-suggestions">
          {COMMON_BCP47_LANGS.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </datalist>
      </div>

      {/* Quota preview card */}
      <div className="weverse-quota-card">
        <div>
          <div className="weverse-quota-title">
            <Clock size={16} color="var(--accent)" /> YouTube API 配額預估消耗：{estimatedQuota.toLocaleString()} 單位
          </div>
          <div className="weverse-quota-description">
            影片上傳：1,600 單位 · 字幕上傳：{enabledSubsCount} 軌 × 400 單位 ={' '}
            {(enabledSubsCount * 400).toLocaleString()} 單位
          </div>
        </div>

        {estimatedQuota >= 8000 && (
          <span className="badge badge-warning weverse-quota-warning">
            <AlertTriangle size={14} /> 接近 YouTube 每日預設上限 (10,000)
          </span>
        )}
      </div>

      {/* Actions */}
      {uploadOutcomeUncertain && (
        <StatusMessage tone="error" title="上傳結果待核對">
          無法確認任務是否已啟動。請先檢查下方上傳歷史及 YouTube Studio；核對後再重新選擇資料夾，勿直接重送。
        </StatusMessage>
      )}
      <div className="weverse-review-actions">
        <Button
          variant="secondary"
          type="button"
          className="btn btn-secondary"
          onClick={handleReset}
          disabled={uploadStarting}
        >
          取消
        </Button>
        <Button
          variant="primary"
          type="button"
          className="btn btn-primary"
          disabled={uploadStarting || uploadOutcomeUncertain || !isVideoAuthConnected || !metadata.title.trim()}
          onClick={() => setUploadConfirmOpen(true)}
        >
          {uploadStarting ? (
            <>
              <Loader2 size={16} className="animate-spin" /> 啟動中...
            </>
          ) : (
            '確認並開始上傳至 YouTube'
          )}
        </Button>
      </div>
    </div>
  );
}
