import type { ReactNode } from 'react';

export type CardProps = {
  title?: ReactNode;
  description?: ReactNode;
  className?: string;
  children?: ReactNode;
};

export function Card({ title, description, className, children }: CardProps) {
  return (
    <section
      className={[
        'rounded-xl border border-stone-200 bg-white p-6 shadow-sm',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {title ? (
        <h2 className="text-lg font-semibold text-stone-900">{title}</h2>
      ) : null}
      {description ? (
        <p className="mt-1 text-sm text-stone-600">{description}</p>
      ) : null}
      {children}
    </section>
  );
}
