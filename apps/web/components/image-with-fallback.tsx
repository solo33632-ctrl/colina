'use client';

import { useState } from 'react';

type ImageWithFallbackProps = {
  src: string | null;
  alt: string;
  className?: string;
  fallbackClassName?: string;
};

// Renders `src` when it loads, otherwise a styled initial-letter tile.
// Seed rows carry placeholder paths that 404 until real media arrives
// (Phase 0/10) — this keeps review builds presentable instead of showing
// broken-image icons.
export function ImageWithFallback({
  src,
  alt,
  className,
  fallbackClassName,
}: ImageWithFallbackProps) {
  const [failed, setFailed] = useState(!src);

  if (failed || !src) {
    const initial = alt.trim().charAt(0).toLocaleUpperCase() || '?';
    return (
      <div
        role="img"
        aria-label={alt}
        className={
          fallbackClassName ??
          `flex aspect-video items-center justify-center bg-brand-100 ${className ?? ''}`
        }
      >
        <span aria-hidden="true" className="text-4xl font-bold text-brand-800">
          {initial}
        </span>
      </div>
    );
  }

  // Plain <img> on purpose: real media + next/image optimization arrive
  // with Phase 0/14. next/image would need remotePatterns for future
  // storage URLs and gives nothing for local 404 placeholders.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`aspect-video w-full object-cover ${className ?? ''}`}
    />
  );
}
