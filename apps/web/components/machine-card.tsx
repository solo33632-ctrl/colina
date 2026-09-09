import type { Machine, MachineImage } from '@colina/db';
import { Card } from '@colina/ui';
import { ImageWithFallback } from './image-with-fallback';
import { Link } from '@/i18n/navigation';

export type MachineWithImages = Machine & { images: MachineImage[] };

export type MachineCardProps = {
  machine: MachineWithImages;
  locale: 'ar' | 'en';
};

// Shared by the category detail grid and the related-machines section.
export function MachineCard({ machine, locale }: MachineCardProps) {
  const name = locale === 'ar' ? machine.nameAr : machine.nameEn;
  const shortDescription =
    locale === 'ar' ? machine.shortDescriptionAr : machine.shortDescriptionEn;
  const cover = machine.images[0]?.url ?? null;

  return (
    <Link
      href={`/machines/${machine.slug}`}
      className="block h-full rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
    >
      <Card className="h-full overflow-hidden p-0">
        <ImageWithFallback src={cover} alt={name} />
        <div className="p-6 text-start">
          <h3 className="text-lg font-semibold text-stone-900">{name}</h3>
          <p className="mt-1 text-sm text-stone-600">{shortDescription}</p>
        </div>
      </Card>
    </Link>
  );
}
