import { ArrowUpDown, CheckCircle2, Loader2, Plus, RefreshCw } from 'lucide-react';
import { Button } from '../../../shared/ui';
import { SORT_PRESETS } from '../model/playlistSort';
import SortKeyRow from '../../../components/playlist-sort/SortKeyRow';
export default function PlaylistSortRules({
  savingConfig,
  savedConfig,
  cachedOriginalTracks,
  presetMode,
  customKeys,
  handleAddCustomKey,
  handlePreview,
  previewing,
  selectedPlaylistId,
  applying,
  setPresetMode,
  persistConfig,
  handleCustomKeyChange,
  handleCustomKeyRemove,
  handleRuleDragStart,
  handleRuleDragOver,
  handleRuleDrop,
  handleRuleDragEnd,
  dragOverRuleIdx,
}) {
  return (
    <section className="glass-panel card-padding">
      <div className="playlist-sort-section-header">
        <h3 className="playlist-sort-section-title">
          <ArrowUpDown size={18} /> 排序規則
        </h3>
        <div className="playlist-sort-config-statuses">
          {savingConfig ? (
            <span className="badge badge-warning playlist-sort-compact-badge">
              <Loader2 size={12} className="spin" /> 儲存設定中…
            </span>
          ) : savedConfig ? (
            <span className="badge badge-connected playlist-sort-compact-badge">
              <CheckCircle2 size={12} /> 排序設定已自動儲存
            </span>
          ) : (
            <span className="badge badge-info playlist-sort-compact-badge">
              <CheckCircle2 size={12} /> 自動記憶設定
            </span>
          )}
          {cachedOriginalTracks && (
            <span className="badge badge-connected playlist-sort-compact-badge">⚡ 即時快取動態模擬中</span>
          )}
        </div>
      </div>

      <div className="playlist-sort-preset-row">
        <select
          className="form-select playlist-sort-preset-select"
          aria-label="排序預設模式"
          value={presetMode}
          onChange={(e) => {
            const next = e.target.value;
            setPresetMode(next);
            persistConfig({ presetMode: next });
          }}
        >
          {SORT_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {presetMode === 'custom' && (
        <div className="playlist-sort-custom-rules">
          <p className="playlist-sort-help">可按住左側圖示拖曳以調整順位優先層級（靠上層者優先排序）：</p>
          {customKeys.map((k, i) => (
            <SortKeyRow
              key={i}
              sortKey={k}
              index={i}
              onChange={handleCustomKeyChange}
              onRemove={handleCustomKeyRemove}
              canRemove={customKeys.length > 1}
              onDragStart={handleRuleDragStart}
              onDragOver={handleRuleDragOver}
              onDrop={handleRuleDrop}
              onDragEnd={handleRuleDragEnd}
              isDragTarget={dragOverRuleIdx === i}
            />
          ))}
          {customKeys.length < 5 && (
            <Button
              variant="secondary"
              type="button"
              className="btn btn-secondary playlist-sort-add-rule"
              onClick={handleAddCustomKey}
            >
              <Plus size={14} /> 新增排序順位
            </Button>
          )}
        </div>
      )}

      <div className="playlist-sort-actions">
        <Button
          variant="primary"
          type="button"
          className="btn btn-primary playlist-sort-action"
          onClick={handlePreview}
          disabled={previewing || !selectedPlaylistId || applying}
        >
          {previewing ? <Loader2 size={15} className="spin" /> : <ArrowUpDown size={15} />}
          {previewing ? '預覽中…' : '模擬預覽'}
        </Button>
        {cachedOriginalTracks && (
          <Button
            variant="secondary"
            type="button"
            className="btn btn-secondary playlist-sort-action playlist-sort-refresh-cache"
            onClick={handlePreview}
            disabled={previewing}
            title="重新向伺服器拉取最新歌曲資料並更新快取"
          >
            <RefreshCw size={14} className={previewing ? 'spin' : ''} /> 重新讀取歌曲快取
          </Button>
        )}
      </div>
    </section>
  );
}
