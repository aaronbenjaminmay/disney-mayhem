import type { ReactNode } from 'react';

type ScreenHeaderProps = {
  eyebrow: string;
  title: string;
  children?: ReactNode;
};

export function ScreenHeader({ eyebrow, title, children }: ScreenHeaderProps) {
  return (
    <header className="px-4 pb-7 pt-8">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0A84FF]">{eyebrow}</p>
      <h1 className="mt-3 text-4xl font-black leading-tight text-white">{title}</h1>
      {children ? <div className="mt-3 text-[16px] leading-7 text-[#A1A1A6]">{children}</div> : null}
    </header>
  );
}
