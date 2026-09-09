import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

type CommonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
};

type AnchorProps = CommonProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'className'> & {
    href: string;
  };

type NativeButtonProps = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> & {
    href?: undefined;
  };

export type ButtonProps = AnchorProps | NativeButtonProps;

const baseClasses =
  'inline-flex items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:pointer-events-none disabled:opacity-50';

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800',
  secondary:
    'border border-stone-300 bg-white text-stone-800 hover:bg-stone-100',
  ghost: 'text-brand-700 hover:bg-brand-50',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
};

function classesFor(props: ButtonProps) {
  return [
    baseClasses,
    variantClasses[props.variant ?? 'primary'],
    sizeClasses[props.size ?? 'md'],
    props.className,
  ]
    .filter(Boolean)
    .join(' ');
}

export function Button(props: ButtonProps) {
  if (props.href !== undefined) {
    const { variant, size, className, children, ...anchorProps } = props;
    void variant;
    void size;
    void className;
    return (
      <a className={classesFor(props)} {...anchorProps}>
        {children}
      </a>
    );
  }

  const { variant, size, className, children, href, ...buttonProps } = props;
  void variant;
  void size;
  void className;
  void href;
  return (
    <button className={classesFor(props)} {...buttonProps}>
      {children}
    </button>
  );
}
