import type { ItemStatus } from '../types';
import { LucideIcon } from './LucideIcon';

type StatusButtonProps = {
  id: string;
  status?: ItemStatus;
  onCycle: (id: string) => void;
};

const statusLabel: Record<ItemStatus | 'todo', string> = {
  todo: 'To do',
  done: 'Done',
  skipped: 'Skipped',
};

export function StatusButton({ id, status = 'todo', onCycle }: StatusButtonProps) {
  const isDone = status === 'done';

  return (
    <button
      type="button"
      onClick={() => onCycle(id)}
      className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border transition focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#0A84FF] ${
        isDone
          ? 'border-[#30D158] bg-[#30D158] text-black'
          : 'border-white/10 bg-[#1C1C1E]/80 text-[#A1A1A6] hover:border-white/15 hover:bg-[#2C2C2E]'
      }`}
      aria-label={`${isDone ? 'Mark to do' : 'Mark done'}. Current status is ${statusLabel[status]}.`}
      title={isDone ? 'Done' : 'To do'}
      aria-pressed={isDone}
    >
      <LucideIcon name="check" size={20} />
    </button>
  );
}
