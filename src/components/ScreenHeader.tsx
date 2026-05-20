import type { ReactNode } from 'react';

type ScreenHeaderProps = {
  eyebrow: string;
  title: string;
  children?: ReactNode;
};

export function ScreenHeader({ eyebrow, title, children }: ScreenHeaderProps) {
  return (
    <header className="px-4 pb-4 pt-6">
      <p className="text-sm font-black uppercase tracking-wide text-fuchsia-200">{eyebrow}</p>
      <h1 className="mt-2 text-3xl font-black text-white">{title}</h1>
      {children ? <div className="mt-3 text-base leading-7 text-slate-200">{children}</div> : null}
    </header>
  );
}
