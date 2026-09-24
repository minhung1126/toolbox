import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CheckCircle2, Sparkles } from 'lucide-react';
import { SourceLinkButton } from '../components/SourceLinkInput';
import { youtubePreferredUiSlot } from '../utils/youtubeRouting';
import { getAllTools } from '../tools/catalog';
import { Badge, Card, PageHeader } from '../shared/ui';
import '../features/system/dashboard.css';

export default function DashboardPage({ authUser, sysSettings = {} }) {
  const activeSlot = youtubePreferredUiSlot(authUser?.youtube);
  const activeYoutube = authUser?.youtube?.slots?.[activeSlot] || {};
  const allTools = getAllTools();
  const sheetsConnected = Boolean(
    authUser?.authorizations?.sheets?.connected || authUser?.google_scopes?.sheets_readonly
  );

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

      <div className="status-grid">
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
          <p>{allTools.length} 個工具模組已就緒</p>
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

      {allTools.map((tool) => {
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
                return (
                  <Card as="div" key={card.id} className="feature-card">
                    <div className={`icon-box icon-box-${card.colorTheme || 'primary'}`}>
                      <Icon size={20} aria-hidden="true" />
                    </div>
                    <div className="feature-card-copy">
                      <h3>{card.title}</h3>
                      <p>{card.description}</p>
                    </div>
                    <Link
                      className={`btn btn-${card.colorTheme === 'primary' ? 'primary' : 'secondary'} feature-card-action`}
                      to={card.to}
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
