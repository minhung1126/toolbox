import React, { useEffect, useState } from 'react';
import { Eye, Image as ImageIcon } from 'lucide-react';

export default function IgSlotImage({ cover, onZoom, idx }) {
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    setLoadError(false);
  }, [cover?.previewUrl]);

  if (!cover) {
    return (
      <div className="ig-slot-empty">
        <ImageIcon size={28} className="text-dim" aria-hidden="true" />
        <span>尚未設定首圖</span>
        <small>從下方貼文點選「設為封面」</small>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="ig-slot-empty ig-slot-error">
        <ImageIcon size={28} className="text-danger" aria-hidden="true" />
        <span>縮圖載入失敗</span>
      </div>
    );
  }

  return (
    <>
      <img
        src={cover.previewUrl}
        alt={`Post ${idx + 1} 封面`}
        className="ig-slot-img"
        draggable={false}
        referrerPolicy="no-referrer"
        onError={() => setLoadError(true)}
      />
      <button
        type="button"
        className="ig-preview-zoom-btn"
        onClick={() => onZoom(cover)}
        title="查看大圖"
        aria-label={`查看 Post ${idx + 1} 封面大圖`}
      >
        <Eye size={14} />
      </button>
    </>
  );
}
