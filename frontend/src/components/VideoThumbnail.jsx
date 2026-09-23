import React, { useEffect, useRef, useState } from 'react';
import { ImageOff } from 'lucide-react';

function normalizeHttps(url) {
  if (!url || typeof url !== 'string') return '';
  if (url.startsWith('http://')) {
    return `https://${url.slice(7)}`;
  }
  return url;
}

export default function VideoThumbnail({
  src,
  videoId,
  alt = '',
  className = 'video-thumbnail',
  buttonClassName = 'video-thumbnail-button',
  emptyClassName = 'video-thumbnail-empty',
  onPreview,
  ariaLabel,
}) {
  const initialUrl = normalizeHttps(src);
  const [currentSrc, setCurrentSrc] = useState(initialUrl);
  const [failed, setFailed] = useState(false);
  const fallbackStep = useRef(0);

  useEffect(() => {
    const normalized = normalizeHttps(src);
    setCurrentSrc(normalized);
    setFailed(!normalized && !videoId);
    fallbackStep.current = 0;
  }, [src, videoId]);

  const handleError = () => {
    if (videoId && fallbackStep.current === 0) {
      fallbackStep.current = 1;
      setCurrentSrc(`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`);
    } else if (videoId && fallbackStep.current === 1) {
      fallbackStep.current = 2;
      setCurrentSrc(`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`);
    } else {
      setFailed(true);
    }
  };

  const effectiveSrc =
    currentSrc || (videoId && fallbackStep.current === 0 ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '');

  if (failed || !effectiveSrc) {
    return (
      <div className={emptyClassName} aria-label="無縮圖">
        <ImageOff size={18} className="text-dim" aria-hidden="true" />
        <span>無縮圖</span>
      </div>
    );
  }

  const imgElement = (
    <img
      className={className}
      src={effectiveSrc}
      alt={alt}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={handleError}
    />
  );

  if (onPreview) {
    return (
      <button
        type="button"
        className={buttonClassName}
        aria-label={ariaLabel || `放大檢視${alt || '影片'}縮圖`}
        onClick={() =>
          onPreview({
            src: effectiveSrc,
            fallbackSrc: videoId ? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` : undefined,
            videoId,
            alt: alt || '影片縮圖',
          })
        }
      >
        {imgElement}
      </button>
    );
  }

  return imgElement;
}
