import type { ReactNode } from 'react';

export const inputClasses =
  'w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600';

const errorClasses = 'mt-1 text-sm text-red-700';

export type FieldProps = {
  id: string;
  label: ReactNode;
  error?: string;
  children: ReactNode;
  /**
   * Extra classes on the wrapping element, for grid placement: a form laid out
   * in two columns needs its second field of each row to start in column two.
   * Optional, so every other caller renders exactly as before.
   */
  className?: string;
};

// Shared label + control + error block used by the contact and
// maintenance-request forms. Presentational only — validation lives in
// each form's Zod schema.
export function Field({ id, label, error, children, className }: FieldProps) {
  return (
    <div className={className}>
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
