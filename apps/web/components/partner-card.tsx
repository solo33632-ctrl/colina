import type { Partner } from '@colina/db';
import { ImageWithFallback } from './image-with-fallback';

export type PartnerCardProps = {
  partner: Partner;
  locale: 'ar' | 'en';
};

/**
 * One partner: a logo tile plus the name as a caption.
 *
 * The logo is rendered `fit="contain"` into a fixed-size tile with padding
 * around it. That is the whole fix for the cropped wordmarks: an earlier
 * version reused the shared 16:9 `object-cover` tile that machine photos want,
 * which scales the artwork up until it fills the box and throws away whatever
 * pasts the edges — so a 2484x759 "Mondelez International" mark lost the M and
 * the tail and read as "ondele". A logo must never be cropped; the padding is
 * what keeps a small mark from sitting flush against the tile.
 *
 * The card is a fixed size rather than an intrinsic one, so a row of logos
 * lines up whatever shape each logo is: the tile is `h-28` for every partner
 * and the artwork is fitted inside it.
 *
 * At rest the mark is desaturated and colour returns on hover, so a long strip
 * of third-party logos does not shout over the site's own palette. Only
 * `filter`, `transform`, `box-shadow` and `border-color` change, all of which
 * are composited and none of which trigger layout — this card sits inside a
 * track that is already animating.
 */
export function PartnerCard({ partner, locale }: PartnerCardProps) {
  const name = locale === 'ar' ? partner.nameAr : partner.nameEn;

  return (
    <div className="group flex w-52 flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm transition-[transform,box-shadow,border-color] duration-300 ease-out hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md motion-reduce:transform-none motion-reduce:transition-none">
      <div className="flex h-28 items-center justify-center bg-white p-5">
        <ImageWithFallback
          src={partner.logo}
          alt={name}
          fit="contain"
          className="grayscale transition-[filter] duration-300 group-hover:grayscale-0 motion-reduce:transition-none"
        />
      </div>
      <p className="border-t border-stone-100 px-3 py-2.5 text-center text-xs font-medium text-stone-600">
        {name}
      </p>
    </div>
  );
}
