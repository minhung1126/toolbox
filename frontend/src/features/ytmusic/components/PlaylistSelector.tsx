import { ListMusic, Search, X, Pin, RefreshCw } from 'lucide-react';
import { Button } from '../../../shared/ui';
import type { PlaylistSummary } from '../api/types';
interface Props {
  playlists: PlaylistSummary[];
  playlistFilterQuery: string;
  filteredPlaylists: PlaylistSummary[];
  setPlaylistFilterQuery: (value: string) => void;
  loadingPlaylists: boolean;
  pinnedPlaylists: PlaylistSummary[];
  selectedPlaylistId: string;
  setSelectedPlaylistId: (value: string) => void;
  persistConfig: (patch: { selectedPlaylistId: string }) => void;
  togglePinPlaylist: (value: string) => void;
  pinnedFiltered: PlaylistSummary[];
  unpinnedFiltered: PlaylistSummary[];
  isSelectedPinned: boolean;
  fetchPlaylists: () => Promise<void>;
  selectedPlaylist: PlaylistSummary | undefined;
  disabled?: boolean;
}
export default function PlaylistSelector({
  playlists,
  playlistFilterQuery,
  filteredPlaylists,
  setPlaylistFilterQuery,
  loadingPlaylists,
  pinnedPlaylists,
  selectedPlaylistId,
  setSelectedPlaylistId,
  persistConfig,
  togglePinPlaylist,
  pinnedFiltered,
  unpinnedFiltered,
  isSelectedPinned,
  fetchPlaylists,
  selectedPlaylist,
  disabled = false,
}: Props) {
  return (
    <section className="glass-panel card-padding">
      <div className="playlist-sort-section-header">
        <h3 className="playlist-sort-section-title">
          <ListMusic size={18} /> 選擇播放清單
        </h3>
        {playlists.length > 0 && (
          <span className="playlist-sort-muted-summary">
            {playlistFilterQuery
              ? `篩選符合 ${filteredPlaylists.length} / 共 ${playlists.length} 個`
              : `共 ${playlists.length} 個播放清單`}
          </span>
        )}
      </div>

      {/* Playlist Name Filter Input */}
      <div className="playlist-sort-filter">
        <Search size={16} className="playlist-sort-filter-icon" aria-hidden="true" />
        <input
          type="text"
          className={`form-input playlist-sort-filter-input${playlistFilterQuery ? ' playlist-sort-filter-input-clearable' : ''}`}
          aria-label="依播放清單名稱或說明篩選"
          placeholder="依播放清單名稱或說明快速篩選…"
          value={playlistFilterQuery}
          onChange={(e) => setPlaylistFilterQuery(e.target.value)}
          disabled={disabled || loadingPlaylists || playlists.length === 0}
        />
        {playlistFilterQuery && (
          <button
            type="button"
            className="playlist-sort-filter-clear"
            disabled={disabled}
            onClick={() => setPlaylistFilterQuery('')}
            title="清除篩選"
            aria-label="清除篩選"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Pinned Playlists Quick Access Chips */}
      {pinnedPlaylists.length > 0 && (
        <div className="playlist-sort-pinned-list">
          <span className="playlist-sort-pinned-label">
            <Pin size={13} className="playlist-sort-pinned-icon" aria-hidden="true" /> 常用釘選：
          </span>
          {pinnedPlaylists.map((pl) => {
            const isCurrent = pl.id === selectedPlaylistId;
            return (
              <div
                key={pl.id}
                className={`badge playlist-sort-pinned-chip${isCurrent ? ' playlist-sort-pinned-chip-active' : ''}`}
              >
                <button
                  type="button"
                  className="playlist-sort-pinned-select"
                  disabled={disabled}
                  aria-label={`快速切換至「${pl.title}」`}
                  onClick={() => {
                    setSelectedPlaylistId(pl.id);
                    persistConfig({ selectedPlaylistId: pl.id });
                  }}
                >
                  <span className="playlist-sort-pinned-title">{pl.title}</span>
                  <span className="playlist-sort-pinned-count">({pl.item_count})</span>
                </button>
                <button
                  type="button"
                  className="playlist-sort-pinned-remove"
                  disabled={disabled}
                  aria-label={`取消釘選「${pl.title}」`}
                  onClick={() => togglePinPlaylist(pl.id)}
                >
                  <X size={12} aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="playlist-sort-select-row">
        <select
          className="form-select playlist-sort-select"
          aria-label="選擇播放清單"
          value={selectedPlaylistId}
          onChange={(e) => {
            setSelectedPlaylistId(e.target.value);
            persistConfig({ selectedPlaylistId: e.target.value });
          }}
          disabled={disabled || loadingPlaylists || filteredPlaylists.length === 0}
        >
          {loadingPlaylists ? (
            <option value="">載入中…</option>
          ) : filteredPlaylists.length === 0 ? (
            <option value="">{playlists.length === 0 ? '找不到播放清單' : '無符合關鍵字的播放清單'}</option>
          ) : (
            <>
              {pinnedFiltered.length > 0 && (
                <optgroup label="📌 常用釘選清單">
                  {pinnedFiltered.map((pl) => (
                    <option key={pl.id} value={pl.id}>
                      📌 {pl.title} ({pl.item_count} 首)
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label={pinnedFiltered.length > 0 ? '全部播放清單' : '播放清單'}>
                {unpinnedFiltered.map((pl) => (
                  <option key={pl.id} value={pl.id}>
                    {pl.title} ({pl.item_count} 首)
                  </option>
                ))}
              </optgroup>
            </>
          )}
        </select>
        <button
          type="button"
          className={`btn playlist-sort-pin-button ${isSelectedPinned ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => togglePinPlaylist(selectedPlaylistId)}
          disabled={disabled || !selectedPlaylistId || loadingPlaylists}
          title={isSelectedPinned ? '取消釘選此播放清單' : '釘選目前播放清單至頂端常用'}
          aria-label={isSelectedPinned ? '取消釘選此播放清單' : '釘選目前播放清單至頂端常用'}
        >
          <Pin size={14} className={isSelectedPinned ? 'playlist-sort-pin-icon-active' : undefined} />
          {isSelectedPinned ? '已釘選' : '釘選'}
        </button>
        <Button
          icon={undefined}
          variant="secondary"
          type="button"
          className="btn btn-secondary"
          aria-label="重新整理清單"
          onClick={fetchPlaylists}
          disabled={disabled || loadingPlaylists}
          title="重新整理清單"
        >
          <RefreshCw size={14} className={loadingPlaylists ? 'spin' : ''} />
        </Button>
      </div>
      {selectedPlaylist && (
        <p className="playlist-sort-selected-description">
          {selectedPlaylist.description || '無說明'} ·{' '}
          {selectedPlaylist.privacy_status === 'private'
            ? '私人'
            : selectedPlaylist.privacy_status === 'unlisted'
              ? '不公開'
              : '公開'}
        </p>
      )}
    </section>
  );
}
