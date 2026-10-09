import { Check, CheckCircle2, Key, Loader2 } from 'lucide-react';
import { StatusMessage } from '../../../components/StatusMessage';
import { Button } from '../../../shared/ui';
export default function PlaylistSortApplyOptions({
  quotaEstimate,
  previewData,
  hasCustomToken,
  applyMode,
  newPlaylistTitle,
  handleApplyClick,
  applying,
  setShowTokenDrawer,
  setApplyMode,
  persistConfig,
  setNewPlaylistTitle,
}) {
  return (
    <section className="glass-panel card-padding">
      <h3 className="playlist-sort-apply-heading">套用模式與配額資訊</h3>

      {quotaEstimate && (
        <div className="playlist-sort-quota-estimate">
          {quotaEstimate.engine === 'ytmusic_innertube' ||
          (!quotaEstimate.engine && quotaEstimate.units_per_move === 0) ? (
            <div className="playlist-sort-zero-quota">
              <CheckCircle2 size={18} />
              <span>
                <strong>YouTube Music Token 協定運作中（0 配額）</strong>：本次操作預計移動 {previewData.moved_count}{' '}
                首歌曲，
                <strong>消耗 0 Google API 配額點數</strong>。
              </span>
            </div>
          ) : (
            <StatusMessage tone="warning" title="API 配額消耗預估">
              <div className="playlist-sort-quota-warning-row">
                <span>
                  {applyMode === 'new_playlist' ? (
                    <>
                      本次將建立新歌單並加入 <strong>{previewData.total}</strong> 首歌曲，
                    </>
                  ) : (
                    <>
                      本次排序將移動 <strong>{previewData.moved_count}</strong> 首歌曲，
                    </>
                  )}{' '}
                  預估消耗 <strong>{quotaEstimate.total_units?.toLocaleString()}</strong> API 配額點數 （
                  {applyMode === 'new_playlist' ? '建立歌單與每首加入各' : '每次移動'} {quotaEstimate.units_per_move}{' '}
                  點）。
                </span>
                {!hasCustomToken && (
                  <Button
                    variant="secondary"
                    size="sm"
                    type="button"
                    className="btn btn-secondary btn-sm playlist-sort-quota-token-button"
                    onClick={() => setShowTokenDrawer(true)}
                  >
                    <Key size={13} /> 展開面板配置 Token 免消耗配額
                  </Button>
                )}
              </div>
            </StatusMessage>
          )}
        </div>
      )}

      {/* Sort Mode Selection */}
      <div className="playlist-sort-apply-options">
        <label className="playlist-sort-apply-option">
          <input
            type="radio"
            name="apply_mode"
            value="in_place"
            checked={applyMode === 'in_place'}
            disabled={applying}
            onChange={() => {
              setApplyMode('in_place');
              persistConfig({ applyMode: 'in_place' });
            }}
          />
          <span>就地重新排序原播放清單</span>
        </label>
        <label className="playlist-sort-apply-option">
          <input
            type="radio"
            name="apply_mode"
            value="new_playlist"
            checked={applyMode === 'new_playlist'}
            disabled={applying}
            onChange={() => {
              setApplyMode('new_playlist');
              persistConfig({ applyMode: 'new_playlist' });
            }}
          />
          <span>另存為新排序歌單（保留原歌單備份）</span>
        </label>
      </div>

      {applyMode === 'new_playlist' && (
        <div className="playlist-sort-new-title-field">
          <label className="form-label" htmlFor="new-playlist-title">
            新播放清單名稱
          </label>
          <input
            id="new-playlist-title"
            type="text"
            className="form-input"
            value={newPlaylistTitle}
            disabled={applying}
            onChange={(e) => setNewPlaylistTitle(e.target.value)}
            placeholder="輸入新播放清單名稱…"
          />
        </div>
      )}

      <div>
        <Button
          variant="primary"
          type="button"
          className="btn btn-primary playlist-sort-action"
          onClick={handleApplyClick}
          disabled={applying || (applyMode === 'in_place' && previewData.moved_count === 0)}
        >
          {applying ? <Loader2 size={15} className="spin" /> : <Check size={15} />}
          {applying ? '套用中…' : applyMode === 'new_playlist' ? '建立新排序歌單' : '套用排序'}
        </Button>
      </div>
    </section>
  );
}
