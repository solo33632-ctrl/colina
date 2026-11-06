import { getLocale } from 'next-intl/server';
import type { SecurityTarget } from '@/lib/insights-security';
import { intlLocale } from '@/lib/format';

// The most frequently targeted forms/endpoints, as a horizontal bar list.
// `source` is a code-owned target name, so it is shown verbatim in monospace
// and remains useful when correlated with request logs.
export async function InsightsSecurityTargets({
  targets,
}: {
  targets: SecurityTarget[];
}) {
  const locale = await getLocale();
  const intl = intlLocale(locale as 'ar' | 'en');
  const number = (value: number) => value.toLocaleString(intl);
  const percent = (value: number) =>
    new Intl.NumberFormat(intl, {
      style: 'percent',
      maximumFractionDigits: 1,
    }).format(value / 100);

  return (
    <ol data-testid="insights-security-targets" className="grid gap-4">
      {targets.map((target) => (
        <li key={target.target} data-testid="insights-security-target">
          <div className="flex items-baseline justify-between gap-3">
            <span
              dir="ltr"
              className="min-w-0 break-all font-mono text-sm text-stone-900"
            >
              {target.target}
            </span>
            <span className="shrink-0 text-sm tabular-nums text-stone-900">
              <span className="font-semibold">{number(target.total)}</span>
              <span className="text-stone-500">
                {' · '}
                {percent(target.share)}
              </span>
            </span>
          </div>
          <div
            className="mt-1.5 h-2 overflow-hidden rounded-full bg-stone-100"
            aria-hidden="true"
          >
            <div
              className="h-full rounded-full bg-brand-600"
              style={{ width: `${target.share}%` }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}
