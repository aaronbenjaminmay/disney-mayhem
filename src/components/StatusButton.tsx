import type { ItemStatus } from '../types';

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
  return (
    <button
      type="button"
      onClick={() => onCycle(id)}
      className={`min-h-11 rounded-full border px-4 py-2 text-sm font-bold transition focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#0A84FF] ${
        status === 'done'
          ? 'border-[#30D158] bg-[#30D158] text-black'
          : status === 'skipped'
            ? 'border-[#FF9F0A] bg-[#FF9F0A] text-black'
            : 'border-[#3A3A3C] bg-[#1C1C1E] text-white hover:bg-[#2C2C2E]'
      }`}
      aria-label={`Mark ${id} status. Current status is ${statusLabel[status]}.`}
    >
      {statusLabel[status]}
    </button>
  );
}
