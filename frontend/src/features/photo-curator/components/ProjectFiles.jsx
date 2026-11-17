import { useState } from 'react';
import { usePhotoCuratorSession } from '../PhotoCuratorSession';
import { exportProject, matchProjectFiles, parseProject } from '../model/project';
import { downloadJson } from '../../../utils/download';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { useToast } from '../../../components/Toast';

export default function ProjectFiles() {
  const session = usePhotoCuratorSession();
  const toast = useToast();
  const [pending, setPending] = useState(null);
  const importFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error('專案超過 2 MB。');
      setPending(parseProject(await file.text()));
    } catch (err) {
      toast.error(`無法匯入專案：${err.message}`);
    }
  };
  const apply = () => {
    session.setPhotos(pending.photos.map((photo) => ({ ...photo, file: null, previewUrl: '', missing: true })));
    session.setPosts(pending.posts);
    session.setUnassignedIds(pending.unassignedIds);
    session.setPreviousArrangement(null);
    session.setExportedSignature(null);
    setPending(null);
    toast.info('編排已載入，請重新選擇本機照片；缺圖時不可輸出 ZIP。');
  };
  const missing = session.photos.filter((photo) => !photo.file);
  return (
    <section className="glass-panel card-padding card-stack project-files" aria-label="排版專案">
      <h2>排版專案與恢復</h2>
      <p>
        照片只在本機。切換工具會保留本次檔案，重新整理後需匯入專案並重新選檔；不會自動發布
        IG。專案包含檔名、大小、修改時間、貼文順序與封面（每篇第一張）。
      </p>
      <div className="page-actions">
        <button
          className="btn btn-secondary"
          onClick={() => downloadJson('photo-curator.project.json', exportProject(session))}
        >
          匯出排版專案
        </button>
        <label>
          匯入專案 JSON <input type="file" accept=".json,application/json" onChange={importFile} />
        </label>
        {!!missing.length && (
          <label>
            重新選擇本機照片{' '}
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={(event) => {
                const files = Array.from(event.target.files || []);
                session.setPhotos((photos) => matchProjectFiles(photos, files));
                event.target.value = '';
              }}
            />
          </label>
        )}
      </div>
      <p role="status">
        {missing.length}{' '}
        張待補。自動對應須檔名、大小、修改時間皆相同且唯一；重名不猜配。匯入、移除照片或重置會清除復原歷史。
      </p>
      {missing.map((photo) => (
        <label key={photo.id}>
          {photo.name}（{photo.size} bytes）待補，手動指定檔案{' '}
          <input
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file)
                session.setPhotos((photos) =>
                  photos.map((item) =>
                    item.id === photo.id
                      ? {
                          ...item,
                          name: file.name,
                          size: file.size,
                          lastModified: file.lastModified,
                          file,
                          previewUrl: URL.createObjectURL(file),
                          missing: false,
                        }
                      : item
                  )
                );
            }}
          />
        </label>
      ))}
      <ConfirmDialog
        open={Boolean(pending)}
        title="載入排版專案"
        content="將取代目前排版並清除復原歷史；原始照片不受影響。請先匯出目前專案。"
        confirmText="載入專案"
        onConfirm={apply}
        onCancel={() => setPending(null)}
      />
    </section>
  );
}
