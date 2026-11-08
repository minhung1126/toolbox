import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const TARGET_SELECTOR = '[data-curator-preview]';
const HOVER_DELAY = 280;
const CURSOR_GAP = 64;
const VIEWPORT_MARGIN = 16;

function previewPosition(x, y) {
  const availableWidth = window.innerWidth - VIEWPORT_MARGIN * 2;
  const availableHeight = window.innerHeight - VIEWPORT_MARGIN * 2;
  const width = Math.min(360, availableWidth);
  const height = Math.min(400, availableHeight);
  // Prefer a full-size preview beside the cursor; use the space above/below on narrow screens.
  const candidates = [
    { side: 'right', scale: (window.innerWidth - VIEWPORT_MARGIN - x - CURSOR_GAP) / width },
    { side: 'left', scale: (x - CURSOR_GAP - VIEWPORT_MARGIN) / width },
    { side: 'below', scale: (window.innerHeight - VIEWPORT_MARGIN - y - CURSOR_GAP) / height },
    { side: 'above', scale: (y - CURSOR_GAP - VIEWPORT_MARGIN) / height },
  ];
  const best =
    candidates.find((candidate) => candidate.scale >= 1) ||
    candidates.reduce((largest, candidate) => (candidate.scale > largest.scale ? candidate : largest));
  const scale = Math.max(0, Math.min(1, best.scale));
  const previewWidth = width * scale;
  const previewHeight = height * scale;
  const clamp = (value, max) => Math.max(VIEWPORT_MARGIN, Math.min(value, max - VIEWPORT_MARGIN));

  return {
    width: previewWidth,
    height: previewHeight,
    left:
      best.side === 'right'
        ? x + CURSOR_GAP
        : best.side === 'left'
          ? x - CURSOR_GAP - previewWidth
          : clamp(x - previewWidth / 2, window.innerWidth - previewWidth),
    top:
      best.side === 'below'
        ? y + CURSOR_GAP
        : best.side === 'above'
          ? y - CURSOR_GAP - previewHeight
          : clamp(y - previewHeight / 2, window.innerHeight - previewHeight),
  };
}

export default function CuratorHoverPreview({ containerRef, photoMap, disabled }) {
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || disabled) return undefined;

    let target = null;
    let pointer = null;
    let timeoutId = null;
    let frameId = null;

    const hide = () => {
      window.clearTimeout(timeoutId);
      window.cancelAnimationFrame(frameId);
      timeoutId = null;
      frameId = null;
      target = null;
      pointer = null;
      setPreview(null);
    };

    const update = () => {
      frameId = null;
      const image = target?.matches('img') ? target : target?.querySelector('img');
      const photo = photoMap.get(target?.dataset.curatorPreview);
      if (!target?.isConnected || !photo || !image?.complete || !image.naturalWidth) {
        hide();
        return;
      }
      setPreview({ photo, position: previewPosition(pointer.x, pointer.y) });
    };

    const onPointerOver = (event) => {
      if (event.pointerType === 'touch' || event.buttons !== 0) return;
      const nextTarget = event.target.closest(TARGET_SELECTOR);
      if (!nextTarget || nextTarget === target || !photoMap.has(nextTarget.dataset.curatorPreview)) return;
      hide();
      target = nextTarget;
      pointer = { x: event.clientX, y: event.clientY };
      timeoutId = window.setTimeout(() => {
        timeoutId = null;
        update();
      }, HOVER_DELAY);
    };

    const onPointerMove = (event) => {
      if (!target) {
        onPointerOver(event);
        return;
      }
      if (event.buttons !== 0) {
        hide();
        return;
      }
      pointer = { x: event.clientX, y: event.clientY };
      if (timeoutId === null && frameId === null) frameId = window.requestAnimationFrame(update);
    };

    const onPointerOut = (event) => {
      if (target?.contains(event.target) && !target.contains(event.relatedTarget)) hide();
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') hide();
    };

    container.addEventListener('pointerover', onPointerOver);
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerout', onPointerOut);
    container.addEventListener('pointerleave', hide);
    container.addEventListener('error', hide, true);
    window.addEventListener('pointerdown', hide, true);
    window.addEventListener('dragstart', hide, true);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    window.addEventListener('blur', hide);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      hide();
      container.removeEventListener('pointerover', onPointerOver);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerout', onPointerOut);
      container.removeEventListener('pointerleave', hide);
      container.removeEventListener('error', hide, true);
      window.removeEventListener('pointerdown', hide, true);
      window.removeEventListener('dragstart', hide, true);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
      window.removeEventListener('blur', hide);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [containerRef, photoMap, disabled]);

  if (!preview || disabled) return null;

  return createPortal(
    <figure className="curator-hover-preview" style={preview.position} aria-hidden="true">
      <div className="curator-hover-preview-image">
        <img src={preview.photo.previewUrl} alt="" draggable={false} referrerPolicy="no-referrer" />
      </div>
      <figcaption>{preview.photo.name}</figcaption>
    </figure>,
    document.body
  );
}
