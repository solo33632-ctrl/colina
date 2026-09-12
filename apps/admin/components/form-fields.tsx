import type { ReactNode } from 'react';

// Admin-local copy of the web form primitives
// (`apps/web/components/form-fields.tsx`). Duplicated rather than shared
// on purpose: the two apps must never import each other's code (separate
// deploys, separate cookie/session domains).

export const inputClasses =
  'w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600';

const errorClasses = 'mt-1 text-sm text-red-700';

export type FieldProps = {
  id: string;
  label: ReactNode;
  error?: string;
  children: ReactNode;
};

// Shared label + control + error block. Presentational only — validation
// lives in each form's Zod schema.
export function Field({ id, label, error, children }: FieldProps) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1 block text-sm font-medium text-stone-700"
      >
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className={errorClasses}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
