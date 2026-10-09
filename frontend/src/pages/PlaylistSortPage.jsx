import { usePlaylistSortController } from '../features/ytmusic/hooks/usePlaylistSortController';
import PlaylistSortApplyOptions from '../features/ytmusic/components/PlaylistSortApplyOptions';
import PlaylistSortRules from '../features/ytmusic/components/PlaylistSortRules';
import PlaylistSortAuthorization from '../features/ytmusic/components/PlaylistSortAuthorization';
import PlaylistSelector from '../features/ytmusic/components/PlaylistSelector';
import PlaylistSortPreview from '../features/ytmusic/components/PlaylistSortPreview';
import PlaylistSortResult from '../features/ytmusic/components/PlaylistSortResult';

import React from 'react';
import '../features/ytmusic/playlist-sort.css';
import { Sparkles } from 'lucide-react';

import ConfirmDialog from '../components/ConfirmDialog';
import { StatusMessage } from '../components/StatusMessage';

import { Badge, PageHeader, Button } from '../shared/ui';

import {
  SORT_FIELDS,
  SORT_PRESETS,
  buildAlbumContextMap,
  buildPreviewFromSorted,
  formatDuration,
  getEffectiveSortArtist,
  getFirstArtist,
  getLocaleCollation,
  isGenericArtist,
  isRealAlbum,
  normalizeArtistName,
  sortTracksLocally,
  splitArtists,
} from '../features/ytmusic/model/playlistSort';
import TrackSubtitle from '../components/playlist-sort/TrackSubtitle';
import SortKeyRow from '../components/playlist-sort/SortKeyRow';
import PreviewTable, { StatusDot } from '../components/playlist-sort/PreviewTable';
import InteractivePreviewTable from '../components/playlist-sort/InteractivePreviewTable';

export {
  getLocaleCollation,
  normalizeArtistName,
  sortTracksLocally,
  TrackSubtitle,
  splitArtists,
  getFirstArtist,
  isGenericArtist,
  SORT_PRESETS,
  SORT_FIELDS,
  isRealAlbum,
  buildAlbumContextMap,
  getEffectiveSortArtist,
  buildPreviewFromSorted,
  formatDuration,
  StatusDot,
  SortKeyRow,
  PreviewTable,
  InteractivePreviewTable,
};

export default function PlaylistSortPage({ authUser, refreshAuthUser }) {
  const {
    hasCustomToken,
    isYtmusicConnected,
    activeYoutubeConnected,
    tokenAccountName,
    tokenChannelHandle,
    showTokenDrawer,
    regionDisplayLabel,
    ytmusicOAuth,
    tokenUpdatedAt,
    handleTokenSaved,
    handleTokenCleared,
    setShowTokenDrawer,
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
    savingConfig,
    savedConfig,
    cachedOriginalTracks,
    presetMode,
    customKeys,
    handleAddCustomKey,
    handlePreview,
    previewing,
    applying,
    setPresetMode,
    handleCustomKeyChange,
    handleCustomKeyRemove,
    handleRuleDragStart,
    handleRuleDragOver,
    handleRuleDrop,
    handleRuleDragEnd,
    dragOverRuleIdx,
    previewData,
    originalItems,
    activeSortKeys,
    sortedItems,
    handleReorderTracks,
    isManuallyAdjusted,
    handleResetToRuleOrder,
    applyMode,
    applyResult,
    quotaEstimate,
    newPlaylistTitle,
    handleApplyClick,
    setApplyMode,
    setNewPlaylistTitle,
    reconciliationMessage,
    showConfirm,
    handleApplyConfirm,
    strictFallbackPrompt,
    quotaExceededRecovery,
    setReconciliationMessage,
    setShowConfirm,
    setStrictFallbackPrompt,
    setQuotaExceededRecovery,
  } = usePlaylistSortController({ authUser, refreshAuthUser });
  return (
    <div className="section-gap">
      <PageHeader
        title="YouTube Music 播放清單排序"
        eyebrow={
          <Badge tone="info">
            <Sparkles size={14} aria-hidden="true" /> YouTube Music
          </Badge>
        }
        description="讀取個人 YouTube Music 播放清單，以歌手／藝人、專輯名稱、歌曲曲目順序、歌名等多重規則自訂排序。支援拖曳順序與即時快取動態模擬比對；YouTube Music Token 模式不消耗 Google API 配額。"
      />

      {/* YouTube Music In-Place Authorization Status */}
      <PlaylistSortAuthorization
        hasCustomToken={hasCustomToken}
        isYtmusicConnected={isYtmusicConnected}
        activeYoutubeConnected={activeYoutubeConnected}
        tokenAccountName={tokenAccountName}
        tokenChannelHandle={tokenChannelHandle}
        authUser={authUser}
        showTokenDrawer={showTokenDrawer}
        regionDisplayLabel={regionDisplayLabel}
        ytmusicOAuth={ytmusicOAuth}
        tokenUpdatedAt={tokenUpdatedAt}
        handleTokenSaved={handleTokenSaved}
        handleTokenCleared={handleTokenCleared}
        setShowTokenDrawer={setShowTokenDrawer}
      />

      {/* Step 1: Select Playlist */}
      <PlaylistSelector
        playlists={playlists}
        playlistFilterQuery={playlistFilterQuery}
        filteredPlaylists={filteredPlaylists}
        setPlaylistFilterQuery={setPlaylistFilterQuery}
        loadingPlaylists={loadingPlaylists}
        pinnedPlaylists={pinnedPlaylists}
        selectedPlaylistId={selectedPlaylistId}
        setSelectedPlaylistId={setSelectedPlaylistId}
        persistConfig={persistConfig}
        togglePinPlaylist={togglePinPlaylist}
        pinnedFiltered={pinnedFiltered}
        unpinnedFiltered={unpinnedFiltered}
        isSelectedPinned={isSelectedPinned}
        fetchPlaylists={fetchPlaylists}
        selectedPlaylist={selectedPlaylist}
        disabled={applying}
      />

      {/* Step 2: Sort Rules */}
      <PlaylistSortRules
        savingConfig={savingConfig}
        savedConfig={savedConfig}
        cachedOriginalTracks={cachedOriginalTracks}
        presetMode={presetMode}
        customKeys={customKeys}
        handleAddCustomKey={handleAddCustomKey}
        handlePreview={handlePreview}
        previewing={previewing}
        selectedPlaylistId={selectedPlaylistId}
        applying={applying}
        setPresetMode={setPresetMode}
        persistConfig={persistConfig}
        handleCustomKeyChange={handleCustomKeyChange}
        handleCustomKeyRemove={handleCustomKeyRemove}
        handleRuleDragStart={handleRuleDragStart}
        handleRuleDragOver={handleRuleDragOver}
        handleRuleDrop={handleRuleDrop}
        handleRuleDragEnd={handleRuleDragEnd}
        dragOverRuleIdx={dragOverRuleIdx}
      />

      {/* Step 3: Side-by-Side Live Preview Results */}
      {previewData && (
        <PlaylistSortPreview
          previewData={previewData}
          originalItems={originalItems}
          activeSortKeys={activeSortKeys}
          sortedItems={sortedItems}
          handleReorderTracks={handleReorderTracks}
          isManuallyAdjusted={isManuallyAdjusted}
          handleResetToRuleOrder={handleResetToRuleOrder}
          applying={applying}
        />
      )}

      {/* Step 4: Apply Configuration */}
      {previewData && !applyResult && (
        <PlaylistSortApplyOptions
          quotaEstimate={quotaEstimate}
          previewData={previewData}
          hasCustomToken={hasCustomToken}
          applyMode={applyMode}
          newPlaylistTitle={newPlaylistTitle}
          handleApplyClick={handleApplyClick}
          applying={applying}
          setShowTokenDrawer={setShowTokenDrawer}
          setApplyMode={setApplyMode}
          persistConfig={persistConfig}
          setNewPlaylistTitle={setNewPlaylistTitle}
        />
      )}

      {reconciliationMessage && (
        <StatusMessage
          tone="warning"
          title="寫入結果待核對"
          action={<Button onClick={() => setReconciliationMessage('')}>已核對播放清單</Button>}
        >
          {reconciliationMessage}
        </StatusMessage>
      )}

      {/* Apply Result */}
      {applyResult && <PlaylistSortResult applyResult={applyResult} />}

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={showConfirm}
        title="確認套用排序"
        onConfirm={handleApplyConfirm}
        onCancel={() => setShowConfirm(false)}
        confirmText="確認套用"
        cancelText="取消"
        busy={applying}
      >
        <div>
          <p>
            {applyMode === 'new_playlist' ? (
              <>
                即將將播放清單「<strong>{selectedPlaylist?.title || selectedPlaylistId}</strong>」的{' '}
                <strong>{previewData?.total || 0}</strong> 首歌曲另存為新排序歌單。
              </>
            ) : (
              <>
                即將對播放清單「<strong>{selectedPlaylist?.title || selectedPlaylistId}</strong>」套用排序，將移動{' '}
                <strong>{previewData?.moved_count || 0}</strong> 首歌曲。
              </>
            )}
          </p>
          {applyMode === 'new_playlist' && (
            <p className="playlist-sort-confirm-success">
              ✓ 將保留原始播放清單，並為您建立全新的已排序播放清單「<strong>{newPlaylistTitle}</strong>」。
            </p>
          )}
          {quotaEstimate?.engine === 'ytmusic_innertube' ||
          (!quotaEstimate?.engine && quotaEstimate?.units_per_move === 0) ? (
            <p className="playlist-sort-confirm-success">
              ✓ 使用 YouTube Music Token 更新，<strong>消耗 0 API 配額點數</strong>。
            </p>
          ) : (
            quotaEstimate && (
              <p className="playlist-sort-confirm-warning">
                ⚠ 預估消耗 <strong>{quotaEstimate.total_units?.toLocaleString()}</strong> API 配額點數。
                此操作不可自動撤銷。
              </p>
            )
          )}
          <p>確定要繼續嗎？</p>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={ytmusicOAuth.confirmDisconnect}
        title="解除 YouTube Music 授權"
        message="確定要解除 YouTube Music 專屬授權嗎？解除後將無法直接讀取該帳號的個人音樂播放清單，直到重新授權為止。"
        confirmText="確認解除"
        cancelText="取消"
        variant="destructive"
        onConfirm={ytmusicOAuth.handleConfirmDisconnect}
        onCancel={() => ytmusicOAuth.setConfirmDisconnect(false)}
      />

      {/* Strict Defense Dialog against Silent Fallback */}
      <ConfirmDialog
        open={Boolean(strictFallbackPrompt)}
        title="⚠️ YouTube Music Token 認證失效（嚴格防禦保護）"
        confirmText={`以 Google API 配額繼續（消耗 ${strictFallbackPrompt?.quotaUnits || 0} 點）`}
        cancelText="立即更新 Token（維持 0 配額）"
        variant="warning"
        busy={applying}
        onConfirm={() => {
          setStrictFallbackPrompt(null);
          handleApplyConfirm({ forceAllowQuotaFallback: true });
        }}
        onCancel={() => {
          setStrictFallbackPrompt(null);
          setShowTokenDrawer(true);
        }}
      >
        <div>
          <p className="playlist-sort-dialog-danger-title">{strictFallbackPrompt?.message}</p>
          <p>
            系統已依「<strong>嚴格防禦政策</strong>」攔截自動降級，以避免在未經確認的情況下無預警消耗{' '}
            <strong>{strictFallbackPrompt?.quotaUnits}</strong> 點 Google Cloud API 配額。
          </p>
          <p className="playlist-sort-dialog-help">
            💡 <strong>推薦作法</strong>：點擊「立即更新 Token」，展開上方快速面板貼上新的 cURL / Cookie，即可繼續以 0
            配額完成排序。
          </p>
        </div>
      </ConfirmDialog>

      {/* 429 Quota Exceeded Recovery Dialog */}
      <ConfirmDialog
        open={Boolean(quotaExceededRecovery)}
        title="Google API 每日配額已用盡"
        confirmText="⚡ 展開 Token 面板啟用 0 配額救援"
        cancelText="關閉"
        onConfirm={() => {
          setQuotaExceededRecovery(null);
          setShowTokenDrawer(true);
        }}
        onCancel={() => setQuotaExceededRecovery(null)}
      >
        <div>
          <p className="playlist-sort-dialog-danger-title">{quotaExceededRecovery?.message}</p>
          <p>Google YouTube Data API 每日配額已達上限（將於每日太平洋時間午夜重置）。</p>
          <div className="playlist-sort-quota-recovery">
            💡 <strong>即刻救援方案</strong>： 只要貼上 YouTube Music 瀏覽器 Token，即可完全繞過 Google API 配額限制，
            <strong>立刻以 0 配額完成排序</strong>！
          </div>
        </div>
      </ConfirmDialog>
    </div>
  );
}
