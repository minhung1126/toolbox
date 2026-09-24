import React from 'react';
import { ExternalLink, Globe } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, PageHeader, TextField } from '../shared/ui';
import { PATHS } from '../routes/paths';

const DEPLOYMENT_DOCS = 'https://github.com/minhung1126/toolbox/blob/main/docs/DEPLOYMENT.md';

export default function SystemInfoPage({ sysSettings = {} }) {
  return (
    <div className="section-gap settings-page">
      <PageHeader title="系統／部署資訊" description="目前部署環境提供的公開網址、監聽位址與前端網址（唯讀）。" />
      <Card className="settings-card card-stack">
        <h2 className="settings-heading">
          <Globe size={20} /> 系統／部署資訊（唯讀）
        </h2>
        <div className="settings-grid">
          <TextField label="對外公開網址（PUBLIC_BASE_URL）" value={sysSettings.public_base_url || ''} readOnly />
          <TextField label="伺服器監聽位址（BIND_HOST）" value={sysSettings.bind_host || ''} readOnly />
          <TextField label="Frontend URL" value={sysSettings.frontend_url || ''} readOnly />
        </div>
        <p className="section-desc">
          這些值由部署環境的 `.env` 管理；PUBLIC_BASE_URL 也是 Google OAuth callback 的來源。
        </p>
        <a className="btn btn-secondary settings-inline-button" href={DEPLOYMENT_DOCS} target="_blank" rel="noreferrer">
          開啟部署文件 <ExternalLink size={14} />
        </a>
        <Link className="btn btn-secondary settings-inline-button" to={PATHS.componentShowcase}>
          查看共用元件展示
        </Link>
      </Card>
    </div>
  );
}
