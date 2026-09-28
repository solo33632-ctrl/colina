import { Link } from '@/i18n/navigation';
import { Icon, type IconName } from './icons';

// One count tile on the dashboard: the translated label for a content type
// plus its current count, and the whole tile links to the section that manages
// it. `highlighted` marks the actionable tile (new leads) without introducing a
// second colour system.
export function StatCard({
  href,
  label,
  count,
  icon,
  highlighted = false,
}: {
  href: string;
  label: string;
  count: number;
  icon: IconName;
  highlighted?: boolean;
}) {
  return (
    <Link
      href={href}
      className={[
        'block rounded-xl border p-4 shadow-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
        highlighted
          ? 'border-brand-200 bg-brand-50 hover:bg-brand-100'
          : 'border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50',
      ].join(' ')}
    >
      <span
        className={[
          'flex items-start gap-2 text-sm font-medium leading-tight',
          highlighted ? 'text-brand-800' : 'text-stone-600',
        ].join(' ')}
      >
        <Icon name={icon} className="mt-0.5 h-4 w-4 shrink-0" />
        {/* Two columns on a phone leave the label narrow, so it wraps to a
            second line instead of being cut off. */}
        <span className="line-clamp-2">{label}</span>
      </span>
      <span
        className={[
          'mt-2 block text-2xl font-bold tabular-nums',
          highlighted ? 'text-brand-900' : 'text-stone-900',
        ].join(' ')}
      >
        {count}
      </span>
    </Link>
  );
}
