import React from 'react';
import { AlertCircle, CheckCircle2, Inbox, Sparkles } from 'lucide-react';
import { Badge, Button, Card, EmptyState, LoadingState, PageHeader, TextField } from '../shared/ui';

export default function ComponentShowcasePage() {
  return (
    <main className="section-gap component-showcase-page">
      <PageHeader
        eyebrow="Toolbox Design System"
        title="共用元件展示"
        description="以深色畫布、靛紫互動色和一致的表單、卡片與狀態元件，維持工具頁面相同的視覺語言。"
        actions={
          <Badge tone="info">
            <Sparkles size={13} aria-hidden="true" /> v1
          </Badge>
        }
      />

      <div className="ui-showcase-grid">
        <Card>
          <h2>按鈕與互動狀態</h2>
          <p className="section-desc">使用清楚的主要、次要與危險操作層級；載入時停用重複送出。</p>
          <div className="ui-showcase-actions">
            <Button icon={CheckCircle2}>主要操作</Button>
            <Button variant="secondary">次要操作</Button>
            <Button variant="danger">危險操作</Button>
            <Button loading>儲存中</Button>
            <Button variant="secondary" disabled>
              不可用
            </Button>
          </div>
        </Card>

        <Card>
          <h2>表單與驗證</h2>
          <p className="section-desc">欄位標籤、提示和錯誤訊息使用可存取的關聯描述。</p>
          <div className="ui-showcase-grid">
            <TextField label="工作表名稱" placeholder="例如：Youtube Video" hint="請輸入來源工作表名稱。" />
            <TextField label="試算表網址" placeholder="https://docs.google.com/…" error="請確認網址或 ID 格式。" />
          </div>
        </Card>

        <Card>
          <h2>狀態標籤</h2>
          <p className="section-desc">狀態同時使用文字和顏色表達，避免只依賴顏色。</p>
          <div className="ui-showcase-actions">
            <Badge tone="success">
              <CheckCircle2 size={13} aria-hidden="true" /> 已完成
            </Badge>
            <Badge tone="warning">
              <AlertCircle size={13} aria-hidden="true" /> 等待確認
            </Badge>
            <Badge tone="danger">
              <AlertCircle size={13} aria-hidden="true" /> 需要處理
            </Badge>
            <Badge tone="info">資訊</Badge>
            <Badge>尚未開始</Badge>
          </div>
        </Card>

        <Card>
          <h2>載入與空狀態</h2>
          <p className="section-desc">在資料尚未載入或清單沒有內容時，提供一致的回饋。</p>
          <LoadingState>正在同步工作狀態…</LoadingState>
          <EmptyState icon={Inbox} title="目前沒有項目" description="完成來源設定後，符合條件的項目會顯示在這裡。" />
        </Card>
      </div>
    </main>
  );
}
