import type { ReactNode } from 'react';

export type ContainerProps = {
  className?: string;
  children: ReactNode;
};

export function Container({ className, children }: ContainerProps) {
  return (
    <div
      className={['mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8', className]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  );
}
