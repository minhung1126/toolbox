import { Folder, FolderOpen, FolderUp, Loader2 } from 'lucide-react';
import { Button } from '../../../shared/ui';
export default function UploadPackagePicker({
  pathInputMode,
  folderInputRef,
  handleFolderInputChange,
  isDragging,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  scanning,
  localPath,
  recentPaths,
  setPathInputMode,
  setLocalPath,
  handleScanPath,
}) {
  return (
    <div className="glass-panel weverse-folder-picker-panel">
      <div className="weverse-folder-picker-header">
        <h3 className="weverse-folder-picker-title">
          <FolderOpen size={20} color="var(--accent)" /> 步驟一：選擇或拖曳本機資料夾
        </h3>
        <div className="weverse-folder-picker-actions">
          <button
            type="button"
            className={`btn btn-sm ${pathInputMode === 'folder_picker' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setPathInputMode('folder_picker')}
          >
            資料夾選取 / 拖曳
          </button>
          <button
            type="button"
            className={`btn btn-sm ${pathInputMode === 'manual_path' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setPathInputMode('manual_path')}
          >
            直接輸入本機路徑
          </button>
        </div>
      </div>

      {pathInputMode === 'folder_picker' ? (
        <div>
          {/* Hidden webkitdirectory input */}
          <input
            ref={folderInputRef}
            type="file"
            webkitdirectory=""
            multiple
            className="weverse-file-input"
            onChange={handleFolderInputChange}
          />

          {/* Drag and drop zone */}
          <div
            className={`dropzone-panel weverse-dropzone ${isDragging ? 'is-dragging' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => folderInputRef.current?.click()}
          >
            <FolderUp
              size={54}
              color={isDragging ? 'var(--primary)' : 'var(--text-muted)'}
              className="weverse-dropzone-icon"
            />
            <h4 className="weverse-dropzone-title">按一下選擇資料夾，或將資料夾直接拖曳至此處</h4>
            <p className="weverse-dropzone-description">
              支援包含 <code className="weverse-dropzone-extension">.mp4</code> 影片與多國語系{' '}
              <code className="weverse-dropzone-extension">.vtt</code> 字幕檔的 Weverse 資料夾
            </p>
            <Button
              variant="primary"
              type="button"
              className="btn btn-primary"
              onClick={(e) => {
                e.stopPropagation();
                folderInputRef.current?.click();
              }}
              disabled={scanning}
            >
              {scanning ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> 正在辨識檔案結構...
                </>
              ) : (
                '選擇資料夾'
              )}
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <div className="weverse-manual-path-row">
            <input
              type="text"
              placeholder="例如：D:\Weverse\20260923_Artist_Live_3-241665049"
              value={localPath}
              onChange={(e) => setLocalPath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleScanPath();
              }}
              className="input-field weverse-manual-path-input"
            />
            <Button
              variant="primary"
              type="button"
              className="btn btn-primary"
              onClick={() => handleScanPath()}
              disabled={scanning || !localPath.trim()}
            >
              {scanning ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> 掃描中...
                </>
              ) : (
                '掃描並辨識'
              )}
            </Button>
          </div>

          {recentPaths.length > 0 && (
            <div className="weverse-recent-paths">
              <span className="weverse-recent-paths-label">最近掃描路徑：</span>
              <div className="weverse-recent-path-list">
                {recentPaths.map((p) => (
                  <Button
                    variant="secondary"
                    size="sm"
                    key={p}
                    type="button"
                    className="btn btn-sm btn-secondary weverse-recent-path"
                    onClick={() => {
                      setLocalPath(p);
                      handleScanPath(p);
                    }}
                  >
                    <Folder size={12} className="weverse-recent-path-icon" /> {p}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
