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
 * Machine detail gallery: one large hero image with a clickable thumbnail
 * strip. Picking a thumbnail swaps the hero (and therefore the magnifier and
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
    <div className="mt-4 flex flex-col gap-4 lg:flex-row-reverse lg:items-start">
      <ZoomableImage
        src={active.url}
        alt={alt}
        onImageLoad={() => setHeroLoaded(true)}
        onOpen={heroLoaded ? () => setLightboxOpen(true) : undefined}
      />

      <ul className="flex flex-wrap gap-3 lg:w-24 lg:max-h-[30rem] lg:shrink-0 lg:flex-col lg:flex-nowrap lg:overflow-y-auto">
        {images.map((image, index) => {
          const isActive = index === activeIndex;
          return (
            <li key={image.id} className="w-24 lg:w-full">
              <button
                type="button"
                onClick={() => setActiveIndex(index)}
                aria-current={isActive ? 'true' : undefined}
                aria-label={t('showImage', { number: index + 1 })}
                className={`block w-full overflow-hidden rounded-lg border-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${
                  isActive
                    ? 'border-brand-600'
                    : 'border-transparent hover:border-stone-300'
                }`}
              >
                {/* Decorative: the button already names the image. */}
                <ImageWithFallback src={image.url} alt="" />
              </button>
            </li>
          );
        })}
      </ul>

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
