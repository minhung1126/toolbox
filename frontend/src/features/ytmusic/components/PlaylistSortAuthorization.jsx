import { AlertTriangle, CheckCircle2, Disc3, Globe, Key, Loader2, RefreshCw, Settings } from 'lucide-react';
import { Link } from 'react-router-dom';
import QuickTokenDrawer from '../../../components/QuickTokenDrawer';
import { PATHS } from '../../../routes/paths';
import { Button } from '../../../shared/ui';
export default function PlaylistSortAuthorization({
  hasCustomToken,
  isYtmusicConnected,
  activeYoutubeConnected,
  tokenAccountName,
  tokenChannelHandle,
  authUser,
  showTokenDrawer,
  regionDisplayLabel,
  ytmusicOAuth,
  tokenUpdatedAt,
  handleTokenSaved,
  handleTokenCleared,
  setShowTokenDrawer,
}) {
  return (
    <section className="glass-panel card-padding">
      <div className="playlist-sort-auth-row">
        <div className="playlist-sort-auth-summary">
          <div className="icon-box icon-box-primary playlist-sort-auth-icon">
            <Disc3 size={22} />
          </div>
          <div>
            <div className="playlist-sort-auth-title-row">
              <strong className="playlist-sort-auth-title">YouTube Music 目前帳號</strong>
              {hasCustomToken ? (
                <span className="badge badge-connected" data-testid="badge-ytm-zero-quota">
                  <CheckCircle2 size={12} /> ⚡ 0 配額模式（瀏覽器 Token 已啟用）
                </span>
              ) : isYtmusicConnected ? (
                <span className="badge badge-warning playlist-sort-quota-mode">
                  <AlertTriangle size={12} /> Google API 配額模式
                </span>
              ) : activeYoutubeConnected ? (
                <span className="badge badge-info">共用 YouTube 頻道授權</span>
              ) : (
                <span className="badge badge-disconnected">
                  <AlertTriangle size={12} /> 尚未授權
                </span>
              )}
            </div>
            <p className="playlist-sort-auth-description">
              {hasCustomToken
                ? `已啟用 YouTube Music 瀏覽器 Token${tokenAccountName ? `（${tokenAccountName}${tokenChannelHandle ? ` / ${tokenChannelHandle}` : ''}）` : ''}。排序作業採用內部協定，消耗 0 Google API 配額。`
                : isYtmusicConnected
                  ? `已連線，可讀取播放清單、預覽排序，再選擇改原歌單或另建歌單。每次移動的本機配額估算為 50 點。`
                  : activeYoutubeConnected
                    ? `目前沿用主要 YouTube 頻道（${authUser?.youtube?.slots?.primary?.channel_title || '品牌頻道'}）授權。若要使用個人日常音樂帳號，可在進階連線設定連結專屬帳號。`
                    : '尚未連結 YouTube 或 YouTube Music 帳號，請先完成授權以載入個人播放清單。'}
            </p>
          </div>
        </div>
        <details open={!(hasCustomToken || isYtmusicConnected || activeYoutubeConnected)}>
          <summary>進階連線與 Token 管理</summary>
          <div className="playlist-sort-auth-actions">
            {hasCustomToken ? (
              <Button
                variant="secondary"
                size="sm"
                type="button"
                className="btn btn-secondary btn-sm playlist-sort-auth-action"
                onClick={() => setShowTokenDrawer(!showTokenDrawer)}
              >
                <Key size={14} /> {showTokenDrawer ? '收合 Token 面板' : '更換 / 管理 Token'}
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                type="button"
                className="btn btn-primary btn-sm playlist-sort-auth-action"
                onClick={() => setShowTokenDrawer(!showTokenDrawer)}
              >
                <Key size={14} /> 管理瀏覽器 Token
              </Button>
            )}
            <Link
              to={PATHS.ytmusicSettings}
              className="btn btn-secondary btn-sm playlist-sort-auth-action"
              title="前往 YouTube Music 設定（可切換歌名與歌手名地區顯示）"
            >
              <Globe size={14} />
              <span>地區：{regionDisplayLabel}</span>
              <Settings size={14} className="playlist-sort-region-settings-icon" />
            </Link>
            {isYtmusicConnected ? (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={ytmusicOAuth.handleConnect}
                  disabled={ytmusicOAuth.connecting}
                >
                  <RefreshCw size={14} className={ytmusicOAuth.connecting ? 'spin' : ''} /> 重新授權
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  type="button"
                  className="btn btn-secondary btn-sm playlist-sort-disconnect"
                  onClick={() => ytmusicOAuth.setConfirmDisconnect(true)}
                >
                  解除授權
                </Button>
              </>
            ) : (
              <Button
                variant="primary"
                size="sm"
                type="button"
                className="btn btn-primary btn-sm"
                onClick={ytmusicOAuth.handleConnect}
                disabled={ytmusicOAuth.connecting}
              >
                {ytmusicOAuth.connecting ? <Loader2 size={14} className="spin" /> : <Disc3 size={14} />} 連結 YouTube
                Music 專屬帳號
              </Button>
            )}
          </div>
        </details>
      </div>

      {/* In-place Quick Token Collapsible Drawer */}
      <QuickTokenDrawer
        isOpen={showTokenDrawer}
        onClose={() => setShowTokenDrawer(false)}
        hasCustomToken={hasCustomToken}
        tokenAccountName={tokenAccountName}
        tokenChannelHandle={tokenChannelHandle}
        tokenUpdatedAt={tokenUpdatedAt}
        onTokenSaved={handleTokenSaved}
        onTokenCleared={handleTokenCleared}
      />
    </section>
  );
}
