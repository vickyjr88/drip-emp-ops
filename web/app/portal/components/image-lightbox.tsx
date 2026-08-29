"use client";

/**
 * A full-size view of one image, opened by clicking a thumbnail.
 *
 * Nothing like this existed in the portal before -- the only other overlay is
 * portal-dialog.tsx's confirm/prompt modal, built for forms, not a photo. This
 * borrows its overlay/z-index language (same backdrop darkness, same
 * above-everything z-index) rather than inventing a new visual style, but is
 * its own component since an image viewer has nothing else in common with a
 * dialog: no title, no fields, no confirm/cancel actions.
 */

import { useEffect } from 'react';

type ImageLightboxProps = {
  src: string;
  alt: string;
  onClose: () => void;
};

export function ImageLightbox({ src, alt, onClose }: ImageLightboxProps) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="portal-lightbox-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={alt}>
      <button type="button" className="portal-lightbox-close" onClick={onClose} aria-label="Close">
        ×
      </button>
      {/* stopPropagation: a click on the image itself (or the space right
          around it) must not be mistaken for a click on the backdrop. */}
      <img src={src} alt={alt} className="portal-lightbox-image" onClick={(event) => event.stopPropagation()} />
    </div>
  );
}
