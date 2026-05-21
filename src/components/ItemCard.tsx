import type { ItemStatus, TripItem } from '../types';
import { findNextActivity, formatTimeRange, getActivityStatusKey, getItemStatusKey } from '../utils/time';
import { LucideIcon } from './LucideIcon';
import { StatusButton } from './StatusButton';

type ItemCardProps = {
  item: TripItem;
  statuses: Record<string, ItemStatus>;
  onCycleStatus: (id: string) => void;
  onEdit?: (item: TripItem) => void;
  compact?: boolean;
};

function EditButton({ item, onEdit }: { item: TripItem; onEdit?: (item: TripItem) => void }) {
  if (!onEdit) return null;

  return (
    <button
      type="button"
      onClick={() => onEdit(item)}
      className="ios-icon-button"
      aria-label="Edit"
      title="Edit"
    >
      <LucideIcon name="pencil" size={20} />
    </button>
  );
}

export function ItemCard({ item, statuses, onCycleStatus, onEdit, compact = false }: ItemCardProps) {
  const itemStatus = statuses[getItemStatusKey(item)];
  const nextActivity = findNextActivity(item, statuses);

  if (item.type === 'flexible') {
    return (
      <article className="glass-surface rounded-[1.7rem] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[12px] font-black uppercase tracking-[0.16em] text-[#0A84FF]">{formatTimeRange(item)}</p>
            <h3 className="mt-2 text-[20px] font-black leading-tight text-white">{item.title}</h3>
            <p className="mt-2 text-[15px] font-semibold text-[#A1A1A6]">{item.area}</p>
          </div>
          <div className="flex gap-2">
            <EditButton item={item} onEdit={onEdit} />
            <StatusButton id={item.id} status={itemStatus} onCycle={onCycleStatus} />
          </div>
        </div>

        {item.notes ? <p className="mt-4 text-[15px] leading-6 text-[#A1A1A6]">{item.notes}</p> : null}
        {nextActivity ? (
          <p className="mt-4 rounded-full bg-[#0A84FF] px-4 py-2 text-[14px] font-black text-black">
            Next recommended: {nextActivity.title}
          </p>
        ) : null}

        {!compact ? (
          <ul className="mt-5 space-y-3" aria-label={`${item.title} activities`}>
            {item.activities.map((activity) => {
              const key = getActivityStatusKey(item, activity);
              const status = statuses[key];

              return (
                <li key={activity.id} className="flex items-center justify-between gap-3 rounded-2xl bg-[#111111] p-4">
                  <div>
                    <p className="text-[16px] font-bold text-white">{activity.title}</p>
                    <p className="mt-1 text-[14px] text-[#A1A1A6]">{activity.location}</p>
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
    <article className="py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-black uppercase tracking-[0.16em] text-[#0A84FF]">{formatTimeRange(item)}</p>
          <h3 className="mt-2 text-[20px] font-black leading-tight text-white">{item.title}</h3>
          <p className="mt-2 text-[15px] font-semibold text-[#A1A1A6]">{item.location}</p>
        </div>
        <div className="flex gap-2">
          <EditButton item={item} onEdit={onEdit} />
          <StatusButton id={item.id} status={itemStatus} onCycle={onCycleStatus} />
        </div>
      </div>
      {item.notes ? <p className="mt-3 text-[15px] leading-6 text-[#A1A1A6]">{item.notes}</p> : null}
    </article>
  );
}
