import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { PATHS } from '../routes/paths';
import { Activity, RefreshCw } from 'lucide-react';
import { Button, PageHeader } from '../shared/ui';
import YouTubeQuotaBanner from '../components/YouTubeQuotaBanner';
import { youtubePreferredUiSlot } from '../features/youtube/model/routing';

export default function ApiHealthPage({ authUser }) {
  const [health, setHealth] = useState(null);
  const [healthError, setHealthError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const activeSlot = youtubePreferredUiSlot(authUser?.youtube);
  const availableSlots = Object.keys(authUser?.youtube?.slots || {}).length
    ? Object.keys(authUser.youtube.slots)
    : ['primary'];

  useEffect(() => {
    let active = true;
    setHealth(null);
    setHealthError('');
    Promise.resolve()
      .then(() => api.getHealth())
      .then((result) => {
        if (
          !result ||
          typeof result.ready !== 'boolean' ||
          !result.configuration ||
          !result.tools ||
          !Array.isArray(result.warnings)
        )
          throw new Error('健康資料格式不正確，無法確認就緒狀態。');
        if (active) setHealth(result);
      })
      .catch((err) => {
        if (active) setHealthError(err.message || '無法連線至後端。');
      });
    return () => {
      active = false;
    };
  }, [refreshKey]);
  useEffect(() => {
    let timer = null;
    const stopTimer = () => {
      if (timer === null) return;
      window.clearInterval(timer);
      timer = null;
    };
    const startTimer = () => {
      if (timer !== null || document.hidden) return;
      timer = window.setInterval(() => setRefreshKey((key) => key + 1), 30000);
    };
    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopTimer();
        return;
      }
      setRefreshKey((key) => key + 1);
      startTimer();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    startTimer();
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stopTimer();
    };
  }, []);

  return (
    <div className="section-gap api-health-page">
      <PageHeader
        title="API 健康度"
        description="分別查看後端可達、部署配置、工具健康、個人授權與本機配額估算。"
        actions={
          <Button variant="secondary" icon={RefreshCw} onClick={() => setRefreshKey((key) => key + 1)}>
            全部更新
          </Button>
        }
      />

      <section className="glass-panel card-padding card-stack" aria-label="服務與工具健康">
        <h2>後端服務與部署配置</h2>
        {healthError ? (
          <p role="alert">後端健康未確認：{healthError}。可使用上方更新重試讀取。</p>
        ) : health ? (
          <>
            <p role="status">
              後端可達 · 部署{health.ready ? '已就緒' : '尚未就緒'}（{health.status}）
            </p>
            <ul>
              {Object.entries(health.configuration).map(([key, ready]) => (
                <li key={key}>
                  {{ google_oauth_ready: '登入 OAuth 配置', access_allowlist_ready: '存取白名單' }[key] || key}：
                  {ready ? '已就緒' : '需處理'}
                </li>
              ))}
            </ul>
            {!!health.warnings.length && (
              <>
                <ul>
                  {health.warnings.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
                <Link to={PATHS.systemSettings}>檢查管理系統設定</Link>
              </>
            )}
            <h3>工具健康</h3>
            <ul>
              {Object.entries(health.tools).map(([id, result]) => (
                <li key={id}>
                  {id}：{result.status || '未知'}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p role="status">正在讀取服務健康…</p>
        )}
        <h3>目前帳號的服務授權</h3>
        <p>個人授權與部署配置分開判斷，連線不會自動執行變更。</p>
        <ul>
          {[
            [
              '試算表',
              authUser?.authorizations?.sheets?.connected || authUser?.google_scopes?.sheets_readonly,
              PATHS.googleSettings,
            ],
            ['YouTube', authUser?.youtube?.slots?.[activeSlot]?.authenticated, PATHS.youtubeConnections],
            [
              'YouTube Music',
              authUser?.authorizations?.ytmusic?.connected || authUser?.authorizations?.ytmusic?.has_custom_token,
              PATHS.ytmusicSettings,
            ],
          ].map(([name, connected, path]) => (
            <li key={name}>
              {name}：{connected ? '已連線' : <Link to={path}>尚未連線，前往設定</Link>}
            </li>
          ))}
        </ul>
      </section>
      <YouTubeQuotaBanner refreshKey={refreshKey} activeSlot={activeSlot} availableSlots={availableSlots} />

      <div className="info-banner">
        <Activity size={16} color="var(--primary)" />
        <span>
          YouTube 數字是 Toolbox 依官方 method cost 記錄的本地估算，不代表 Google Cloud project 的即時總用量。
        </span>
      </div>
    </div>
  );
}
