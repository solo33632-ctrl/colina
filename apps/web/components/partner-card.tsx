import type { Partner } from '@colina/db';
import { ImageWithFallback } from './image-with-fallback';

export type PartnerCardProps = {
  partner: Partner;
  locale: 'ar' | 'en';
};

// Shared by the home partners strip and the partners listing page:
// logo tile (with initial-letter fallback) + visible name caption.
export function PartnerCard({ partner, locale }: PartnerCardProps) {
  const name = locale === 'ar' ? partner.nameAr : partner.nameEn;

  return (
    <div className="w-36 overflow-hidden rounded-xl border border-stone-200 bg-white">
      <ImageWithFallback
        src={partner.logo}
        alt={name}
        fallbackClassName="flex aspect-video items-center justify-center bg-stone-100"
      />
      <p className="truncate px-2 py-2 text-center text-xs text-stone-600">
        {name}
      </p>
    </div>
  );
}
