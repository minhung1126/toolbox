import { ArrowUpDown } from 'lucide-react';
import PreviewTable, { StatusDot } from '../../../components/playlist-sort/PreviewTable';
import InteractivePreviewTable from '../../../components/playlist-sort/InteractivePreviewTable';
import type { PlaylistSortPreview, PlaylistSortTrack, PlaylistSortKey } from '../api/types';
interface Props {
  previewData: PlaylistSortPreview;
  originalItems: PlaylistSortTrack[];
  sortedItems: PlaylistSortTrack[];
  activeSortKeys: PlaylistSortKey[];
  handleReorderTracks: (source: number, target: number) => void;
  isManuallyAdjusted: boolean;
  handleResetToRuleOrder: () => void;
  applying?: boolean;
}
export default function PlaylistSortPreview({
  previewData,
  originalItems,
  activeSortKeys,
  sortedItems,
  handleReorderTracks,
  isManuallyAdjusted,
  handleResetToRuleOrder,
  applying = false,
}: Props) {
  return (
    <section className="glass-panel card-padding">
      <div className="playlist-sort-section-header playlist-sort-preview-header">
        <h3 className="playlist-sort-section-title">左右比對預覽結果</h3>
        <div className="playlist-sort-preview-stats">
          <span className="playlist-sort-preview-stat">
            <StatusDot status="unchanged" /> 不變 {previewData.unchanged_count} 首
          </span>
          <span className="playlist-sort-preview-stat">
            <StatusDot status="moved" /> 移動 {previewData.moved_count} 首
          </span>
          <span className="playlist-sort-muted-summary">共 {previewData.total} 首</span>
        </div>
      </div>

      <div className="playlist-sort-preview-columns" {...(applying ? { inert: '' } : {})}>
        <PreviewTable
          icon={undefined}
          extraHeader={undefined}
          title="目前原始順序"
          items={originalItems}
          sortKeys={activeSortKeys}
        />
        <InteractivePreviewTable
          title="即時排序結果"
          items={sortedItems}
          icon={ArrowUpDown}
          sortKeys={activeSortKeys}
          onReorder={handleReorderTracks}
          isManuallyAdjusted={isManuallyAdjusted}
          onResetOrder={handleResetToRuleOrder}
        />
      </div>
    </section>
  );
}
