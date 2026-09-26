import React, { useEffect, useState } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import { Button, PageHeader } from '../shared/ui';
import YouTubeQuotaBanner from '../components/YouTubeQuotaBanner';
import { youtubePreferredUiSlot } from '../features/youtube/model/routing';

export default function ApiHealthPage({ authUser }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const activeSlot = youtubePreferredUiSlot(authUser?.youtube);
  const availableSlots = Object.keys(authUser?.youtube?.slots || {}).length
    ? Object.keys(authUser.youtube.slots)
    : ['primary'];

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
        description="查看 YouTube API 配額估算與目前的安全上限狀態。"
        actions={
          <Button variant="secondary" icon={RefreshCw} onClick={() => setRefreshKey((key) => key + 1)}>
            全部更新
          </Button>
        }
      />

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
