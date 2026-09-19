import React, { useEffect, useState } from 'react';
import { Eye, Image as ImageIcon } from 'lucide-react';

export default function CuratorThumbnail({ photo, onZoom }) {
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    setLoadError(false);
  }, [photo?.previewUrl]);

  return (
    <div className="photo-card-thumb-wrap">
      {loadError ? (
        <div className="photo-card-thumb-fallback" title="無法載入縮圖">
          <ImageIcon size={18} className="text-dim" aria-hidden="true" />
          <span>無法顯示</span>
        </div>
      ) : (
        <img
          src={photo.previewUrl}
          alt={photo.name}
          className="photo-card-thumb"
          draggable={false}
          referrerPolicy="no-referrer"
          onError={() => setLoadError(true)}
        />
      )}
      {!loadError && onZoom && (
        <button
          type="button"
          className="photo-zoom-btn"
          onClick={() => onZoom(photo)}
          title="查看大圖"
          aria-label={`查看 ${photo.name} 大圖`}
        >
          <Eye size={13} />
        </button>
      )}
    </div>
  );
}
