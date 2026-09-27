'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';

type ImageLightboxProps = {
  src: string;
  alt: string;
  open: boolean;
  onClose: () => void;
};

/**
 * Full-screen image overlay for pointers that cannot hover (phones,
 * tablets) — the touch equivalent of the desktop magnifier.
 *
 * Uses the native `<dialog>` in modal mode, which brings the focus trap,
 * `Escape` handling, background inertness and focus restore with it.
 *
 * The image is deliberately left untransformed and un-`touch-action`-ed so
 * the browser's own pinch-zoom keeps working on it — that is the point of
 * the overlay, and any component that takes over touch handling would
 * break it. Unlike the inline `ImageWithFallback`, this is a viewer: the
 * caller only opens it for an image that has already loaded, so there is no
 * fallback state to render here.
 */
export function ImageLightbox({ src, alt, open, onClose }: ImageLightboxProps) {
  const t = useTranslations('MachinePage');
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    // Guarded both ways: React runs effects twice in development, and
    // showModal()/close() throw if the element is already in that state.
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-label={alt}
      onClick={(event) => {
        // Clicks land on the dialog element itself when they hit the area
        // around the image, so the target check keeps clicks on the image
        // from closing the overlay.
        if (event.target === dialogRef.current) {
          onClose();
        }
      }}
      className="m-0 h-full max-h-full w-full max-w-full border-0 bg-transparent p-0 backdrop:bg-stone-900/95 open:flex open:items-center open:justify-center"
    >
      <div className="relative flex h-full w-full items-center justify-center p-4 sm:p-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className="max-h-full max-w-full object-contain"
        />
        <button
          type="button"
          onClick={onClose}
          aria-label={t('closeImageLabel')}
          className="absolute end-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-stone-900/70 text-2xl leading-none text-white transition-colors hover:bg-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
    </dialog>
  );
}
