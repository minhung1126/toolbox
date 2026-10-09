import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, ChevronUp, Pin, Sparkles } from 'lucide-react';
import { SourceLinkButton } from '../components/SourceLinkInput';
import useAccountWorkState from '../hooks/useAccountWorkState';
import { youtubePreferredUiSlot } from '../features/youtube/model/routing';
import { useToolCatalog } from '../tools/ToolCatalogProvider';
import { getMissingToolCapabilities } from '../tools/capabilities';
import { Badge, Button, Card, EmptyState, PageHeader, TextField } from '../shared/ui';
import '../features/system/dashboard.css';

function cardIds(value) {
  return Array.isArray(value) ? [...new Set(value.filter((id) => typeof id === 'string'))] : [];
}

function ShortcutList({ entries, authUser, onOpen, onUnpin }) {
  return (
    <ul className="dashboard-shortcut-list">
      {entries.map(({ tool, card }) => {
        const Icon = card.icon;
        const missingCapabilities = getMissingToolCapabilities(tool, authUser, card.to);
        return (
          <li key={card.id} className="dashboard-shortcut-item">
            <Link className="dashboard-shortcut-link" to={card.to} onClick={() => onOpen(card.id)}>
              <Icon size={18} aria-hidden="true" />
              <span className="dashboard-shortcut-title">{card.title}</span>
              {missingCapabilities.length > 0 && <Badge tone="warning">尚缺授權</Badge>}
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
            {onUnpin && (
              <Button
                variant="secondary"
                className="dashboard-pin-button"
                aria-label={`從常用工具移除 ${card.title}`}
                onClick={() => onUnpin(card.id)}
              >
                <Pin size={16} aria-hidden="true" />
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default function DashboardPage({ authUser, sysSettings = {} }) {
  const activeSlot = youtubePreferredUiSlot(authUser?.youtube);
  const activeYoutube = authUser?.youtube?.slots?.[activeSlot] || {};
  const { status: catalogStatus, tools: allTools, error: catalogError, retry: retryCatalog } = useToolCatalog();
  const [query, setQuery] = useState('');
  const [statusExpanded, setStatusExpanded] = useState(() => window.innerWidth >= 768);
  const navigation = useAccountWorkState('navigation', {});
  const savedNavigation = navigation.value;
  const pinnedIds = cardIds(savedNavigation.dashboardPinnedCardIds);
  const recentIds = cardIds(savedNavigation.dashboardRecentCardIds);
  const availableCards = allTools.flatMap((tool) => (tool.featureCards || []).map((card) => ({ tool, card })));
  const cardsById = new Map(availableCards.map((entry) => [entry.card.id, entry]));
  const pinnedCards = pinnedIds.flatMap((id) => (cardsById.has(id) ? [cardsById.get(id)] : []));
  const recentCards = recentIds.slice(0, 4).flatMap((id) => (cardsById.has(id) ? [cardsById.get(id)] : []));
  const searchWords = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const visibleTools = allTools.flatMap((tool) => {
    const cards = (tool.featureCards || []).filter((card) => {
      const searchable = [tool.title, tool.name, tool.description, card.title, card.description]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase();
      return searchWords.every((word) => searchable.includes(word));
    });
    return cards.length ? [{ ...tool, featureCards: cards }] : [];
  });
  const visibleCardCount = visibleTools.reduce((count, tool) => count + tool.featureCards.length, 0);
  const sheetsConnected = Boolean(
    authUser?.authorizations?.sheets?.connected || authUser?.google_scopes?.sheets_readonly
  );

  const saveNavigation = (changes) => {
    if (!navigation.ready) return;
    const next = { ...savedNavigation, ...changes };
    navigation.save(next, { debounceMs: 0 });
  };
  const togglePinned = (id) => {
    saveNavigation({
      dashboardPinnedCardIds: pinnedIds.includes(id) ? pinnedIds.filter((value) => value !== id) : [...pinnedIds, id],
    });
  };
  const rememberTool = (id) => {
    saveNavigation({ dashboardRecentCardIds: [id, ...recentIds.filter((value) => value !== id)].slice(0, 4) });
  };

  return (
    <div className="section-gap">
      <PageHeader
        className="dashboard-hero"
        eyebrow={
          <>
            <Sparkles size={14} aria-hidden="true" /> Toolbox 工具箱平台
          </>
        }
        title="Toolbox 控制台"
        description="Toolbox 多功能模組化平台。整合影音創作、試算表資料服務、日常生產力、API 配額分流控管與系統安全維運。"
      />

      <Card className="dashboard-tool-finder" aria-label="尋找工具">
        <div className="dashboard-search-row" role="search">
          <TextField
            label="搜尋工具"
            type="search"
            value={query}
            placeholder="輸入名稱或功能，例如：照片、FFmpeg"
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <Button variant="secondary" onClick={() => setQuery('')}>
              清除搜尋
            </Button>
          )}
        </div>
        <p className="section-desc" role="status" aria-live="polite">
          {catalogStatus === 'ready'
            ? `顯示 ${visibleCardCount} / ${availableCards.length} 個工具入口`
            : catalogStatus === 'loading'
              ? '工具目錄載入中…'
              : '工具目錄尚未就緒'}
        </p>
        {searchWords.length === 0 && (
          <div className="dashboard-shortcuts">
            <section aria-labelledby="dashboard-pinned-title">
              <h2 id="dashboard-pinned-title">常用工具</h2>
              {!navigation.ready ? (
                <p className="section-desc">工具偏好尚未載入，請使用上方「重試」重新載入設定。</p>
              ) : pinnedCards.length ? (
                <ShortcutList entries={pinnedCards} authUser={authUser} onOpen={rememberTool} onUnpin={togglePinned} />
              ) : (
                <p className="section-desc">按工具卡右上角的圖釘，即可加入常用入口。</p>
              )}
            </section>
            {recentCards.length > 0 && (
              <section aria-labelledby="dashboard-recent-title">
                <h2 id="dashboard-recent-title">最近使用</h2>
                <p className="section-desc">從控制台開啟的最近 4 個工具。</p>
                <ShortcutList entries={recentCards} authUser={authUser} onOpen={rememberTool} />
              </section>
            )}
          </div>
        )}
        {navigation.error && (
          <div className="dashboard-preference-error" role="alert">
            <p>入口偏好同步失敗，目前設定仍保留在本次操作中。</p>
            <Button variant="secondary" onClick={navigation.retry}>
              重試同步
            </Button>
          </div>
        )}
      </Card>

      <section className="dashboard-status" aria-labelledby="dashboard-status-title">
        <div className="dashboard-status-summary">
          <div>
            <h2 id="dashboard-status-title">登入與授權</h2>
            <p className="section-desc">
              控制台{authUser ? '已登入' : '未登入'} · YouTube {activeYoutube.authenticated ? '已授權' : '未連結'} ·
              試算表{sheetsConnected ? '已授權' : '未授權'}
            </p>
          </div>
          <Button
            variant="secondary"
            aria-expanded={statusExpanded}
            aria-controls="dashboard-status-details"
            aria-label={`${statusExpanded ? '收合' : '展開'}登入與授權狀態`}
            onClick={() => setStatusExpanded((current) => !current)}
            icon={statusExpanded ? ChevronUp : ChevronDown}
          >
            {statusExpanded ? '收合' : '查看詳情'}
          </Button>
        </div>
        <div id="dashboard-status-details" className="status-grid" hidden={!statusExpanded}>
          <Card as="div" padding="sm" className="dashboard-status-card">
            <div className="dashboard-status-head">
              <span>控制台登入</span>
              {authUser ? (
                <Badge tone="success">
                  <CheckCircle2 size={12} /> 已登入
                </Badge>
              ) : (
                <Badge tone="danger">
                  <AlertTriangle size={12} /> 未登入
                </Badge>
              )}
            </div>
            <h3>{authUser ? authUser.email : '尚未登入控制台'}</h3>
            <p>{catalogStatus === 'ready' ? `${allTools.length} 個工具模組已啟用` : '工具目錄尚未就緒'}</p>
          </Card>

          <Card as="div" padding="sm" className="dashboard-status-card">
            <div className="dashboard-status-head">
              <span>YouTube 頻道授權</span>
              {activeYoutube.authenticated ? (
                <Badge tone="success">
                  <CheckCircle2 size={12} /> 已授權
                </Badge>
              ) : (
                <Badge tone="danger">
                  <AlertTriangle size={12} /> 未連結
                </Badge>
              )}
            </div>
            <h3>{activeYoutube.user?.email || '請在設定中連結品牌帳號'}</h3>
            <p>支援主要與次要 Slot 配額防護</p>
          </Card>

          <Card as="div" padding="sm" className="dashboard-status-card">
            <div className="dashboard-status-head">
              <span>Google 試算表授權</span>
              {sheetsConnected ? (
                <Badge tone="success">
                  <CheckCircle2 size={12} /> 已授權
                </Badge>
              ) : (
                <Badge tone="danger">
                  <AlertTriangle size={12} /> 未授權
                </Badge>
              )}
            </div>
            <h3>{sysSettings.default_spreadsheet_id ? '已設定預設試算表' : '未設定'}</h3>
            <SourceLinkButton
              value={sysSettings.default_spreadsheet_id}
              sourceType="spreadsheet"
              label="開啟主要設定試算表"
            />
          </Card>

          <Card as="div" padding="sm" className="dashboard-status-card">
            <div className="dashboard-status-head">
              <span>預設 To-Post 播放清單</span>
              <SourceLinkButton
                value={sysSettings.default_playlist_id}
                sourceType="youtube-playlist"
                label="開啟預設 To-Post 播放清單"
              />
            </div>
            <h3>{sysSettings.default_playlist_id || '未設定'}</h3>
            <p>影片自動加入待發布清單</p>
          </Card>
        </div>
      </section>

      {catalogStatus === 'loading' && <p role="status">工具目錄載入中…</p>}
      {catalogStatus === 'error' && (
        <div role="alert">
          <EmptyState
            title="工具目錄載入失敗"
            description={catalogError}
            action={<Button onClick={retryCatalog}>重新載入工具</Button>}
          />
        </div>
      )}
      {catalogStatus === 'ready' && visibleCardCount === 0 && (
        <EmptyState
          title={searchWords.length ? '找不到符合的工具' : '目前沒有可用工具'}
          description={searchWords.length ? '試試其他名稱或功能關鍵字。' : '工具啟用後會顯示在這裡。'}
          action={searchWords.length ? <Button onClick={() => setQuery('')}>顯示全部工具</Button> : null}
        />
      )}
      {visibleTools.map((tool) => {
        const cards = tool.featureCards || [];
        if (!cards.length) return null;
        return (
          <section key={tool.id} className="dashboard-module-group">
            <div className="dashboard-module-heading">
              <div className="dashboard-module-title">
                <h2 className="section-title">{tool.title || tool.name}</h2>
                <Badge tone="info">{tool.category}</Badge>
              </div>
              <p className="section-desc dashboard-module-description">{tool.description}</p>
            </div>
            <div className="feature-grid">
              {cards.map((card) => {
                const Icon = card.icon;
                const missingCapabilities = getMissingToolCapabilities(tool, authUser, card.to);
                return (
                  <Card as="div" key={card.id} className="feature-card">
                    <div className="dashboard-feature-head">
                      <div className={`icon-box icon-box-${card.colorTheme || 'primary'}`}>
                        <Icon size={20} aria-hidden="true" />
                      </div>
                      <Button
                        variant="secondary"
                        className="dashboard-pin-button"
                        aria-pressed={pinnedIds.includes(card.id)}
                        aria-label={`將 ${card.title} 加入常用工具`}
                        title={pinnedIds.includes(card.id) ? '已加入常用工具，按一下移除' : '加入常用工具'}
                        onClick={() => togglePinned(card.id)}
                        disabled={!navigation.ready}
                      >
                        <Pin size={16} aria-hidden="true" />
                      </Button>
                    </div>
                    <div className="feature-card-copy">
                      <h3>{card.title}</h3>
                      <p>{card.description}</p>
                    </div>
                    {missingCapabilities.length > 0 && (
                      <div className="dashboard-card-capabilities">
                        <Badge tone="warning">尚缺授權</Badge>
                        {missingCapabilities.map((capability) => (
                          <Link key={capability.key} to={capability.settingsPath}>
                            連線 {capability.label}
                          </Link>
                        ))}
                      </div>
                    )}
                    <Link
                      className={`btn btn-${card.colorTheme === 'primary' ? 'primary' : 'secondary'} feature-card-action`}
                      to={card.to}
                      onClick={() => rememberTool(card.id)}
                    >
                      {card.actionLabel} <ArrowRight size={16} />
                    </Link>
                  </Card>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
