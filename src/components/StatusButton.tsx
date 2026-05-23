import { useEffect, useRef, useState } from 'react';
import type { ItemStatus } from '../types';
import { LucideIcon } from './LucideIcon';

type StatusButtonProps = {
  id: string;
  status?: ItemStatus;
  onCycle: (id: string) => void;
};

function MouseHeadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" focusable="false">
      <circle cx="12" cy="13" r="6.5" fill="currentColor" />
      <circle cx="6.6" cy="7.2" r="3.8" fill="currentColor" />
      <circle cx="17.4" cy="7.2" r="3.8" fill="currentColor" />
    </svg>
  );
}

export function StatusButton({ id, status = 'todo', onCycle }: StatusButtonProps) {
  const isDone = status === 'done';
  const previousDone = useRef(isDone);
  const [shouldBounce, setShouldBounce] = useState(false);

  useEffect(() => {
    if (isDone && !previousDone.current) {
      setShouldBounce(true);
      const timeout = window.setTimeout(() => setShouldBounce(false), 240);
      previousDone.current = isDone;
      return () => window.clearTimeout(timeout);
    }

    previousDone.current = isDone;
    return undefined;
  }, [isDone]);

  return (
    <button
      type="button"
      onClick={() => onCycle(id)}
      className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border transition focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#0A84FF] ${
        isDone
          ? 'border-[#30D158] bg-[#30D158] text-black'
          : 'border-white/10 bg-[#1C1C1E]/80 text-[#A1A1A6] hover:border-white/15 hover:bg-[#2C2C2E]'
      } ${shouldBounce ? 'status-complete-bounce' : ''}`}
      aria-label={isDone ? 'Mark incomplete' : 'Mark complete'}
      title={isDone ? 'Done' : 'To do'}
      aria-pressed={isDone}
    >
      {isDone ? <MouseHeadIcon /> : <LucideIcon name="check" size={20} />}
    </button>
  );
}
