import type { ItemStatus, TripItem } from '../types';
import { findNextActivity, formatTimeRange, getActivityStatusKey, getItemStatusKey } from '../utils/time';
import { StatusButton } from './StatusButton';

type ItemCardProps = {
  item: TripItem;
  statuses: Record<string, ItemStatus>;
  onCycleStatus: (id: string) => void;
  compact?: boolean;
};

export function ItemCard({ item, statuses, onCycleStatus, compact = false }: ItemCardProps) {
  const itemStatus = statuses[getItemStatusKey(item)];
  const nextActivity = findNextActivity(item, statuses);

  if (item.type === 'flexible') {
    return (
      <article className="rounded-[1.6rem] border border-cyan-300/30 bg-cyan-300/10 p-4 shadow-xl shadow-cyan-950/20">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-cyan-100">{formatTimeRange(item)}</p>
            <h3 className="mt-1 text-xl font-black text-white">{item.title}</h3>
            <p className="mt-1 text-sm font-semibold text-cyan-100">{item.area}</p>
          </div>
          <StatusButton id={item.id} status={itemStatus} onCycle={onCycleStatus} />
        </div>

        {item.notes ? <p className="mt-3 text-sm leading-6 text-slate-200">{item.notes}</p> : null}
        {item.needsAttention ? (
          <p className="mt-3 inline-flex rounded-full bg-amber-300 px-4 py-2 text-sm font-black text-slate-950">Attention needed</p>
        ) : null}
        {nextActivity ? (
          <p className="mt-3 rounded-full bg-fuchsia-300 px-4 py-2 text-sm font-black text-slate-950">
            Next recommended: {nextActivity.title}
          </p>
        ) : null}

        {!compact ? (
          <ul className="mt-4 space-y-2" aria-label={`${item.title} activities`}>
            {item.activities.map((activity) => {
              const key = getActivityStatusKey(item, activity);
              const status = statuses[key];

              return (
                <li key={activity.id} className="flex items-center justify-between gap-3 rounded-2xl bg-black/22 p-3">
                  <div>
                    <p className="font-bold text-white">{activity.title}</p>
                    <p className="text-sm text-slate-300">{activity.location}</p>
                  </div>
                  <StatusButton id={key} status={status} onCycle={onCycleStatus} />
                </li>
              );
            })}
          </ul>
        ) : null}
      </article>
    );
  }

  return (
    <article className="rounded-[1.6rem] border border-white/12 bg-white/8 p-4 shadow-xl shadow-black/20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-lime-200">{formatTimeRange(item)}</p>
          <h3 className="mt-1 text-xl font-black text-white">{item.title}</h3>
          <p className="mt-1 text-sm font-semibold text-slate-300">{item.location}</p>
        </div>
        <StatusButton id={item.id} status={itemStatus} onCycle={onCycleStatus} />
      </div>
      {item.notes ? <p className="mt-3 text-sm leading-6 text-slate-200">{item.notes}</p> : null}
      {item.needsAttention ? (
        <p className="mt-3 inline-flex rounded-full bg-amber-300 px-4 py-2 text-sm font-black text-slate-950">Attention needed</p>
      ) : null}
    </article>
  );
}
