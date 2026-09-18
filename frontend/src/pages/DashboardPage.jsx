import React from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  Settings,
  Sparkles,
} from 'lucide-react';
import { SourceLinkButton } from '../components/SourceLinkInput';
import { youtubePreferredUiSlot } from '../utils/youtubeRouting';
import { PATHS } from '../routes/paths';
import { getDashboardFeatureCards, getAllTools } from '../tools/catalog';

export default function DashboardPage({ authUser, sysSettings = {} }) {
  const activeSlot = youtubePreferredUiSlot(authUser?.youtube);
  const activeYoutube = authUser?.youtube?.slots?.[activeSlot] || {};
  const featureCards = getDashboardFeatureCards();
  const allTools = getAllTools();
  const sheetsConnected = Boolean(
    authUser?.authorizations?.sheets?.connected || authUser?.google_scopes?.sheets_readonly
  );

  return (
    <div className="section-gap">
      <header className="glass-panel dashboard-hero page-header">
        <div className="badge badge-info dashboard-eyebrow"><Sparkles size={14} /> Toolbox 工具箱平台</div>
        <h1>Toolbox 控制台</h1>
        <p className="section-desc dashboard-hero-description">
          Toolbox 多功能模組化平台。整合影音創作、試算表資料服務、日常生產力、API 配額分流控管與系統安全維運。
        </p>
      </header>

      <div className="status-grid">
        <div className="glass-panel dashboard-status-card">
          <div className="dashboard-status-head">
            <span>控制台登入</span>
            {authUser ? <span className="badge badge-connected"><CheckCircle2 size={12} /> 已登入</span> : <span className="badge badge-disconnected"><AlertTriangle size={12} /> 未登入</span>}
          </div>
          <h3>{authUser ? authUser.email : '尚未登入控制台'}</h3>
          <p>{allTools.length} 個工具模組已就緒</p>
        </div>

        <div className="glass-panel dashboard-status-card">
          <div className="dashboard-status-head">
            <span>YouTube 頻道授權</span>
            {activeYoutube.authenticated ? <span className="badge badge-connected"><CheckCircle2 size={12} /> 已授權</span> : <span className="badge badge-disconnected"><AlertTriangle size={12} /> 未連結</span>}
          </div>
          <h3>{activeYoutube.user?.email || '請在設定中連結品牌帳號'}</h3>
          <p>支援主要與次要 Slot 配額防護</p>
        </div>

        <div className="glass-panel dashboard-status-card">
          <div className="dashboard-status-head">
            <span>Google 試算表授權</span>
            {sheetsConnected ? <span className="badge badge-connected"><CheckCircle2 size={12} /> 已授權</span> : <span className="badge badge-disconnected"><AlertTriangle size={12} /> 未授權</span>}
          </div>
          <h3>{sysSettings.default_spreadsheet_id ? '已設定預設試算表' : '未設定'}</h3>
          <SourceLinkButton value={sysSettings.default_spreadsheet_id} sourceType="spreadsheet" label="開啟主要設定試算表" />
        </div>

        <div className="glass-panel dashboard-status-card">
          <div className="dashboard-status-head">
            <span>預設 To-Post 播放清單</span>
            <SourceLinkButton value={sysSettings.default_playlist_id} sourceType="youtube-playlist" label="開啟預設 To-Post 播放清單" />
          </div>
          <h3>{sysSettings.default_playlist_id || '未設定'}</h3>
          <p>影片自動加入待發布清單</p>
        </div>
      </div>

      {allTools.map((tool) => {
        const cards = tool.featureCards || [];
        if (!cards.length) return null;
        return (
          <section key={tool.id} className="dashboard-module-group" style={{ marginBottom: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <h2 className="section-title" style={{ margin: 0, fontSize: '1.25rem' }}>{tool.title || tool.name}</h2>
                <span className="badge badge-info">{tool.category}</span>
              </div>
              <p className="section-desc" style={{ margin: 0, fontSize: '0.85rem' }}>{tool.description}</p>
            </div>
            <div className="feature-grid">
              {cards.map((card) => {
                const Icon = card.icon;
                return (
                  <div key={card.id} className="glass-panel glass-panel-interactive feature-card">
                    <div className={`icon-box icon-box-${card.colorTheme || 'primary'}`}><Icon size={20} aria-hidden="true" /></div>
                    <div className="feature-card-copy">
                      <h3>{card.title}</h3>
                      <p>{card.description}</p>
                    </div>
                    <Link className={`btn btn-${card.colorTheme === 'primary' ? 'primary' : 'secondary'} feature-card-action`} to={card.to}>
                      {card.actionLabel} <ArrowRight size={16} />
                    </Link>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
