import type { ReactNode } from 'react';
import { getLocale, getTranslations } from 'next-intl/server';
import type {
  AuditChange,
  AuditFieldType,
  AuditTextValue,
} from '@/lib/audit-changes';
import { intlLocale } from '@/lib/format';

// Read-only rendering of one audit entry's stored field changes. Shared by the
// audit log page and the per-user activity page so both show exactly the same
// data with the same wording.

function isTextValue(value: unknown): value is AuditTextValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { preview?: unknown }).preview === 'string' &&
    typeof (value as { length?: unknown }).length === 'number' &&
    typeof (value as { truncated?: unknown }).truncated === 'boolean'
  );
}

/** Images read as their file name: a full Cloudinary URL is noise in a table. */
function imageShortText(url: string): string | null {
  try {
    const name = decodeURIComponent(
      new URL(url).pathname.split('/').filter(Boolean).pop() ?? ''
    );
    if (name === '') {
      return null;
    }
    return name.length > 60 ? `${name.slice(0, 59)}…` : name;
  } catch {
    return null;
  }
}

export async function AuditChangeTable({
  changes,
}: {
  changes: AuditChange[];
}) {
  const t = await getTranslations('AuditLog');
  const locale = await getLocale();

  const fieldLabel = (labelKey: string) => {
    const key = `fields.${labelKey}`;
    return t.has(key as never) ? t(key as never) : labelKey;
  };

  const renderValue = (
    type: AuditFieldType,
    value: AuditChange['from']
  ): ReactNode => {
    if (value === null || value === undefined) {
      return t('emptyValue');
    }

    switch (type) {
      case 'boolean':
        return value === true
          ? t('yes')
          : value === false
            ? t('no')
            : t('emptyValue');
      case 'number':
        return typeof value === 'number'
          ? value.toLocaleString(intlLocale(locale))
          : t('emptyValue');
      case 'date': {
        if (typeof value !== 'string') {
          return t('emptyValue');
        }
        const date = new Date(value);
        return Number.isNaN(date.getTime())
          ? t('emptyValue')
          : date.toLocaleString(intlLocale(locale));
      }
      case 'longText': {
        if (!isTextValue(value)) {
          return t('emptyValue');
        }
        return (
          <span className="whitespace-pre-wrap break-words">
            {value.preview}
            {value.truncated ? (
              <span className="mt-1 block text-xs text-stone-500">
                {t('fullLength', { length: value.length })}
              </span>
            ) : null}
          </span>
        );
      }
      case 'imageUrl': {
        if (typeof value !== 'string') {
          return t('emptyValue');
        }
        return imageShortText(value) ?? t('imageValue');
      }
      case 'list':
        return typeof value === 'number'
          ? t('itemCount', { count: value })
          : t('emptyValue');
      case 'url':
      case 'text':
      default:
        return typeof value === 'string' && value !== ''
          ? value
          : t('emptyValue');
    }
  };

  return (
    <>
      {/* Desktop table. */}
      <div className="mt-3 hidden md:block">
        <table className="w-full table-fixed border-collapse text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500">
              <th
                scope="col"
                className="w-1/4 py-2 pe-3 text-start font-medium"
              >
                {t('field')}
              </th>
              <th
                scope="col"
                className="w-[37.5%] py-2 pe-3 text-start font-medium"
              >
                {t('before')}
              </th>
              <th scope="col" className="w-[37.5%] py-2 text-start font-medium">
                {t('after')}
              </th>
            </tr>
          </thead>
          <tbody>
            {changes.map((change, index) => (
              <tr
                key={`${change.field}-${index}`}
                className="border-b border-stone-100 align-top"
              >
                <th
                  scope="row"
                  className="break-words py-2 pe-3 text-start font-medium text-stone-700"
                >
                  {fieldLabel(change.labelKey)}
                </th>
                <td className="break-words py-2 pe-3 text-stone-700">
                  {renderValue(change.type, change.from)}
                </td>
                <td className="break-words py-2 text-stone-900">
                  {renderValue(change.type, change.to)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cards on narrow screens: the same three values, stacked. */}
      <ul className="mt-3 grid gap-3 md:hidden">
        {changes.map((change, index) => (
          <li
            key={`${change.field}-${index}`}
            className="min-w-0 rounded-lg border border-stone-200 bg-stone-50 p-3"
          >
            <p className="break-words text-sm font-semibold text-stone-900">
              {fieldLabel(change.labelKey)}
            </p>
            <dl className="mt-2 grid gap-2 text-sm">
              <div className="min-w-0">
                <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">
                  {t('before')}
                </dt>
                <dd className="mt-0.5 break-words text-stone-700">
                  {renderValue(change.type, change.from)}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">
                  {t('after')}
                </dt>
                <dd className="mt-0.5 break-words text-stone-900">
                  {renderValue(change.type, change.to)}
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
