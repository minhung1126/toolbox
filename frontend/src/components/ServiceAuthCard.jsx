import React from 'react';
import { AlertCircle, CheckCircle2, Key, RefreshCw, Unlink, XCircle } from 'lucide-react';

export default function ServiceAuthCard({
  icon: Icon,
  title,
  connected,
  connectedBadgeText = '已授權',
  disconnectedBadgeText = '尚未授權',
  description,
  accountEmail,
  accountEmailPrefix = '目前授權帳號：',
  warningText,
  connecting = false,
  onConnect,
  onDisconnect,
  connectText = '連結授權',
  reconnectText = '重新授權',
  disconnectText = '解除授權',
}) {
  return (
    <div className="glass-panel card-padding settings-card card-stack">
      <div className="card-header">
        <div className="card-header-title">
          {Icon && <Icon size={20} color="var(--primary)" />}
          <h2>{title}</h2>
        </div>
        {connected ? (
          <span className="badge badge-connected">
            <CheckCircle2 size={14} /> {connectedBadgeText}
          </span>
        ) : (
          <span className="badge badge-disconnected">
            <XCircle size={14} /> {disconnectedBadgeText}
          </span>
        )}
      </div>

      {description && (
        <p className="section-desc">
          {description}
          {accountEmail && `（${accountEmailPrefix}${accountEmail}）`}
        </p>
      )}

      {connected ? (
        <div className="page-actions settings-card-actions">
          <button className="btn btn-secondary" type="button" onClick={onConnect} disabled={connecting}>
            <RefreshCw size={16} /> {reconnectText}
          </button>
          <button className="btn btn-danger" type="button" onClick={onDisconnect}>
            <Unlink size={16} /> {disconnectText}
          </button>
        </div>
      ) : (
        <div>
          {warningText && (
            <div className="info-banner warning-banner">
              <AlertCircle size={18} />
              <span>{warningText}</span>
            </div>
          )}
          <div className="page-actions settings-card-actions">
            <button className="btn btn-primary" type="button" onClick={onConnect} disabled={connecting}>
              <Key size={16} /> {connectText}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
