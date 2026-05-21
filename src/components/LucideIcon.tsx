import type React from 'react';

export type LucideIconName = 'calendar' | 'chevron-left' | 'clapperboard' | 'castle' | 'globe' | 'leaf' | 'notebook' | 'pencil' | 'plane' | 'utensils';

type LucideIconProps = {
  name: LucideIconName;
  size?: 16 | 20 | 24;
  className?: string;
};

const paths: Record<LucideIconName, React.ReactNode> = {
  calendar: (
    <>
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M3 10h18" />
    </>
  ),
  'chevron-left': (
    <>
      <path d="m15 18-6-6 6-6" />
    </>
  ),
  castle: (
    <>
      <path d="M5 22V9" />
      <path d="M19 22V9" />
      <path d="M2 22h20" />
      <path d="M7 22v-5a5 5 0 0 1 10 0v5" />
      <path d="M5 9H2V5l3 2 3-2v4" />
      <path d="M19 9h3V5l-3 2-3-2v4" />
      <path d="M12 2l3 2-3 2-3-2 3-2Z" />
      <path d="M10 9h4" />
    </>
  ),
  clapperboard: (
    <>
      <path d="M20.2 6 3 11l-.9-3.2A2 2 0 0 1 3.5 5.4L16.2 2a2 2 0 0 1 2.4 1.4L20.2 6Z" />
      <path d="m6.2 4.7 3.1 3.1" />
      <path d="m11.2 3.4 3.1 3.1" />
      <path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8Z" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 0 20" />
      <path d="M12 2a15.3 15.3 0 0 0 0 20" />
    </>
  ),
  leaf: (
    <>
      <path d="M11 20A7 7 0 0 1 4 13c0-6 8-10 16-10 0 8-4 16-10 16Z" />
      <path d="M4 13c4 0 8-2 12-6" />
    </>
  ),
  notebook: (
    <>
      <path d="M2 6h4" />
      <path d="M2 10h4" />
      <path d="M2 14h4" />
      <path d="M2 18h4" />
      <rect width="16" height="20" x="4" y="2" rx="2" />
      <path d="M9.5 14.5 15 9l2 2-5.5 5.5H9.5v-2Z" />
    </>
  ),
  pencil: (
    <>
      <path d="M21.2 6.8 17.2 2.8a2 2 0 0 0-2.8 0L3 14.2V21h6.8L21.2 9.6a2 2 0 0 0 0-2.8Z" />
      <path d="m14 4 6 6" />
    </>
  ),
  plane: (
    <>
      <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 20.5 3s-3 .5-4.5 2L12.5 8.5 4.3 6.7c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3l5.5 3.7-2.1 2.1-3.4-.8-.8.8 4 2 2 4 .8-.8-.8-3.4 2.1-2.1 3.7 5.5c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2Z" />
    </>
  ),
  utensils: (
    <>
      <path d="M3 2v7c0 1.7 1.3 3 3 3s3-1.3 3-3V2" />
      <path d="M5 2v20" />
      <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Z" />
      <path d="M21 15v7" />
    </>
  ),
};

export function LucideIcon({ name, size = 20, className = '' }: LucideIconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.75"
      viewBox="0 0 24 24"
      width={size}
    >
      {paths[name]}
    </svg>
  );
}
