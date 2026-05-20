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
      className={`min-h-11 rounded-full border px-4 py-2 text-sm font-bold transition focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-cyan-200 ${
        status === 'done'
          ? 'border-emerald-300 bg-emerald-300 text-slate-950'
          : status === 'skipped'
            ? 'border-amber-300 bg-amber-300 text-slate-950'
            : 'border-white/20 bg-white/8 text-white hover:bg-white/14'
      }`}
      aria-label={`Mark ${id} status. Current status is ${statusLabel[status]}.`}
    >
      {statusLabel[status]}
    </button>
  );
}
