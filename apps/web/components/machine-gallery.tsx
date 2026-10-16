'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ImageWithFallback } from './image-with-fallback';
import { ImageLightbox } from './image-lightbox';
import { ZoomableImage } from './zoomable-image';

export type GalleryImage = { id: string; url: string };

type MachineGalleryProps = {
  /** Ordered as stored: the first entry is the cover/hero image. */
  images: GalleryImage[];
  alt: string;
};

/**
 * Machine detail gallery: one large hero image with a row of thumbnails below
 * it. Picking a thumbnail swaps the hero (and therefore the magnifier and
 * the lightbox) without leaving the page.
 *
 * Used only by the machine detail page — category cards and the home grid
 * stay simple single-image cards.
 */
export function MachineGallery({ images, alt }: MachineGalleryProps) {
  const t = useTranslations('MachinePage');
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  // Only a hero that actually loaded is worth enlarging: before real media
  // arrives the slot shows a letter tile, and there is nothing to open.
  const [heroLoaded, setHeroLoaded] = useState(false);

  if (images.length === 0) {
    return null;
  }

  const active = images[activeIndex] ?? images[0];

  return (
    <div className="mt-4 flex flex-col gap-4">
      <ZoomableImage
        src={active.url}
        alt={alt}
        onImageLoad={() => setHeroLoaded(true)}
        onOpen={heroLoaded ? () => setLightboxOpen(true) : undefined}
      />

      {/* One horizontal row of thumbnails BELOW the frame.
          It used to be a vertical strip beside the hero (`lg:flex-row-reverse`
          with a fixed `lg:w-24` column), which on a wide screen left a narrow
          column of thumbnails beside a much wider photo and a band of dead
          space between them — the frame never used the width it had. A row
          under the frame gives the photo the full column and still keeps every
          thumbnail reachable.

          `overflow-x-auto` with `flex-nowrap` means a machine with many photos
          scrolls sideways inside this row instead of widening the document, so
          nothing on the page shifts at 390px.

          Each thumbnail shows its photo WHOLE, like the main frame: the same
          neutral gradient plate, `fit="contain"` and a little padding. A
          cropped thumbnail gives no clue what the full photo shows, which is
          the one job a thumbnail has.

          A single-photo machine renders no row at all — a one-item "gallery"
          of thumbnails is just a smaller copy of the photo above it. */}
      {images.length > 1 ? (
        <ul className="flex flex-nowrap gap-3 overflow-x-auto">
          {images.map((image, index) => {
            const isActive = index === activeIndex;
            return (
              <li key={image.id} className="w-20 shrink-0 sm:w-24">
                <button
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  aria-current={isActive ? 'true' : undefined}
                  aria-label={t('showImage', { number: index + 1 })}
                  className={`block aspect-[4/3] w-full overflow-hidden rounded-lg bg-gradient-to-b from-stone-50 to-stone-100 ring-2 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${
                    isActive
                      ? 'ring-brand-600'
                      : 'ring-transparent hover:ring-stone-300'
                  }`}
                >
                  {/* Decorative: the button already names the image. Lazy: a
                      thumbnail is never the largest thing on screen. */}
                  <ImageWithFallback
                    src={image.url}
                    alt=""
                    fit="contain"
                    loading="lazy"
                    className="h-full w-full p-1"
                  />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <p className="sr-only" role="status">
        {t('imagePosition', {
          current: activeIndex + 1,
          total: images.length,
        })}
      </p>

      {heroLoaded ? (
        <ImageLightbox
          src={active.url}
          alt={alt}
          open={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
        />
      ) : null}
    </div>
  );
}
