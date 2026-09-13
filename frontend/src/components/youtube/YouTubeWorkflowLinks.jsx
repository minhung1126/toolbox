import React from 'react';
import { ArrowRight, Clapperboard, Smartphone } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PATHS } from '../../routes/paths';

export default function YouTubeWorkflowLinks() {
  return (
    <section className="glass-panel card-padding settings-card card-stack">
      <div>
        <h2 className="settings-heading">YouTube 草稿工作流設定</h2>
        <p className="section-desc">Video 與 Shorts 的工作表、欄位與工作流資源會分別保存；Sheet 內容複製、Video、Shorts 共用團體與人物篩選。</p>
      </div>
      <div className="responsive-grid youtube-workflow-grid">
        <div className="glass-panel youtube-workflow-card card-stack">
          <h3 className="youtube-workflow-heading"><Clapperboard size={18} /> Video 草稿</h3>
          <p className="section-desc">管理 Video 專屬工作表與欄位，人物篩選會與其他流程共用。</p>
          <Link className="btn btn-secondary settings-inline-button" to={PATHS.youtubeVideoDrafts}>
            前往 Video 設定 <ArrowRight size={16} />
          </Link>
        </div>
        <div className="glass-panel youtube-workflow-card card-stack">
          <h3 className="youtube-workflow-heading"><Smartphone size={18} /> Shorts 草稿</h3>
          <p className="section-desc">管理 Shorts 專屬工作表與欄位，人物篩選會與其他流程共用。</p>
          <Link className="btn btn-secondary settings-inline-button" to={PATHS.youtubeShortsDrafts}>
            前往 Shorts 設定 <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </section>
  );
}
