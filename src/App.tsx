import { useEffect, useMemo, useState } from 'react';
import { ItemCard } from './components/ItemCard';
import { LucideIcon, type LucideIconName } from './components/LucideIcon';
import { ScreenHeader } from './components/ScreenHeader';
import { StatusButton } from './components/StatusButton';
import { AppTab, Tabs } from './components/Tabs';
import { tripDays as baseTripDays, tripEndDate, tripStartDate } from './data/tripData';
import { useTripStorage } from './hooks/useTripStorage';
import type { Activity, EditableActivityFields, EditableItemFields, FlexibleBlock, ItemStatus, LandBlock, TripDay, TripItem } from './types';
import {
  createActivityFromFields,
  createItemFromFields,
  getAttentionItems,
  getReservations,
  mergeTripEdits,
  toEditableActivityFields,
  toEditableFields,
} from './utils/itineraryEdits';
import { getActivityLand } from './utils/landBlocks';
import {
  findNextActivity,
  formatDateLabel,
  formatTime,
  formatTimeRange,
  getActiveScheduleState,
  getActivityStatusKey,
  getDepartureCountdown,
  getItemStatusKey,
  getTripPhase,
} from './utils/time';

function itemNeedsAttention(item: TripItem) {
  const text = `${item.title} ${item.location} ${item.notes ?? ''}`.toLowerCase();
  return Boolean(item.needsAttention) || text.includes('need reservation') || text.includes('insert multi-pass') || text.includes('add queue link');
}

function getActiveLandBlock(day: TripDay, activeItem: TripItem | undefined, statuses: Record<string, ItemStatus>): LandBlock | undefined {
  if (activeItem?.type !== 'flexible') return undefined;

  const activity = findNextActivity(activeItem, statuses) ?? activeItem.activities[0];
  if (!activity) return day.landBlocks?.find((block) => block.sourceItemIds.includes(activeItem.id));

  const land = getActivityLand(day.park, activeItem, activity);
  return day.landBlocks?.find((block) => block.land === land);
}

function getUpcomingLandBlocks(day: TripDay, activeLand?: LandBlock): LandBlock[] {
  const landBlocks = day.landBlocks ?? [];
  if (!activeLand) return landBlocks;

  const activeIndex = landBlocks.findIndex((block) => block.id === activeLand.id);
  return activeIndex === -1 ? landBlocks.filter((block) => block.id !== activeLand.id) : landBlocks.slice(activeIndex + 1);
}

function formatLandTime(block: LandBlock): string {
  if (block.time && block.endTime) return `${formatTime(block.time)}-${formatTime(block.endTime)}`;
  return block.time ? formatTime(block.time) : 'Flexible';
}

function formatOptionalTimeRange(time?: string, endTime?: string): string | undefined {
  if (time && endTime) return `${formatTime(time)}-${formatTime(endTime)}`;
  if (time) return formatTime(time);
  return undefined;
}

function formatShortTime(time?: string): string | undefined {
  if (!time) return undefined;
  return formatTime(time).replace(':00', '').replace(/\s/g, '');
}

function formatShortTimeRange(time?: string, endTime?: string): string | undefined {
  const start = formatShortTime(time);
  const end = formatShortTime(endTime);
  if (start && end) return `${start}-${end}`;
  return start;
}

function formatLightningLane(activity: Activity): string | undefined {
  return formatShortTimeRange(activity.lightningLaneTime ?? activity.lightningLaneStart, activity.lightningLaneEndTime ?? activity.lightningLaneEnd);
}

function addMinutesToTime(time: string, minutesToAdd: number): string {
  const [hours, minutes] = time.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes + minutesToAdd;
  const nextHours = Math.floor(totalMinutes / 60) % 24;
  const nextMinutes = totalMinutes % 60;
  return `${String(nextHours).padStart(2, '0')}:${String(nextMinutes).padStart(2, '0')}`;
}

const lightningLaneDurationOptions = [30, 60, 90, 120];

function groupActivitiesByLand(day: TripDay, item: FlexibleBlock) {
  const groups: { land: string; activities: FlexibleBlock['activities'] }[] = [];

  item.activities.forEach((activity) => {
    const land = getActivityLand(day.park, item, activity);
    const existing = groups.find((group) => group.land === land);

    if (existing) {
      existing.activities.push(activity);
      return;
    }

    groups.push({ land, activities: [activity] });
  });

  if (groups.length === 0) {
    groups.push({ land: item.area || item.location, activities: [] });
  }

  return groups;
}

function getDayPresentation(day: TripDay) {
  if (day.label.toLowerCase().includes('departure') || day.label.toLowerCase().includes('travel')) {
    return { title: 'Travel Day', icon: 'plane' as const };
  }

  if (day.park === 'Magic Kingdom') return { title: 'Magic Kingdom Day', icon: 'castle' as const };
  if (day.park === 'EPCOT') return { title: 'EPCOT Day', icon: 'globe' as const };
  if (day.park === 'Hollywood Studios') return { title: 'Hollywood Studios Day', icon: 'clapperboard' as const };
  if (day.park === 'Animal Kingdom') return { title: 'Animal Kingdom Day', icon: 'leaf' as const };
  return { title: day.label, icon: 'calendar' as const };
}

function DashboardTile({
  title,
  subtitle,
  icon,
  onClick,
}: {
  title: string;
  subtitle: string;
  icon: LucideIconName;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="glass-surface min-h-28 rounded-[1.35rem] px-4 py-4 text-left transition hover:border-white/15 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#0A84FF]"
      aria-label={`${title}. ${subtitle}`}
    >
      <span className="flex items-center gap-3">
        <LucideIcon name={icon} size={24} className="shrink-0 text-[#A1A1A6]" />
        <span>
          <span className="block text-[17px] font-black leading-tight text-white">{title}</span>
          <span className="mt-1 block text-[13px] font-semibold leading-snug text-[#A1A1A6]">{subtitle}</span>
        </span>
      </span>
    </button>
  );
}

function TodayScreen({
  day,
  activeItem,
  nextItem,
  nextActivity,
  upcomingItems,
  isToday,
  statuses,
  onCycleStatus,
  onEditItem,
  onViewFullDay,
  attentionItems,
  phase,
  countdown,
  days,
  onOpenDay,
  onOpenReservations,
  onOpenNotes,
}: ReturnType<typeof getActiveScheduleState> & {
  statuses: Record<string, ItemStatus>;
  onCycleStatus: (id: string) => void;
  onEditItem: (dayId: string, item: TripItem) => void;
  onViewFullDay: () => void;
  attentionItems: ReturnType<typeof getAttentionItems>;
  phase: ReturnType<typeof getTripPhase>;
  countdown: ReturnType<typeof getDepartureCountdown>;
  days: TripDay[];
  onOpenDay: (dayId: string) => void;
  onOpenReservations: () => void;
  onOpenNotes: () => void;
}) {
  if (phase === 'before') {
    const countdownUnits = [
      { label: 'Days', value: countdown.days },
      { label: 'Hours', value: countdown.hours },
      { label: 'Minutes', value: countdown.minutes },
      { label: 'Seconds', value: countdown.seconds },
    ];

    return (
      <main className="screen-fade px-4 pb-8 pt-8 sm:pt-12">
        <section aria-labelledby="countdown-heading" className="section-rise text-center">
          <h1 id="countdown-heading" className="text-[38px] font-black leading-none tracking-[0.08em] text-white sm:text-[52px]">
            DISNEY MAYHEM
          </h1>
          <p className="mt-5 text-[13px] font-black uppercase tracking-[0.18em] text-white">Disney Mayhem begins in...</p>
          <div className="glass-surface mx-auto mt-7 max-w-3xl rounded-[1.75rem] px-5 py-7 sm:px-8 sm:py-9">
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-7" aria-live="polite" aria-label="Live countdown to departure">
              {countdownUnits.map((unit) => (
                <div key={unit.label} className="basis-[calc(50%-0.75rem)] sm:basis-auto">
                  <div className="tabular-nums font-black leading-none text-[#0A84FF] [font-size:clamp(2.8rem,12vw,5.5rem)]">
                    {String(unit.value).padStart(2, '0')}
                  </div>
                  <div className="mt-3 text-[12px] font-black uppercase tracking-[0.16em] text-[#A1A1A6]">{unit.label}</div>
                </div>
              ))}
            </div>
            {nextItem ? (
              <p className="mt-8 text-[15px] font-semibold text-[#A1A1A6]">
                First up: {formatTimeRange(nextItem)} · {nextItem.title}
              </p>
            ) : null}
          </div>
        </section>

        <section aria-labelledby="dashboard-heading" className="section-rise mt-10">
          <h2 id="dashboard-heading" className="text-[13px] font-black uppercase tracking-[0.18em] text-[#A1A1A6]">
            Trip Dashboard
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-3 min-[390px]:grid-cols-2">
            {days.map((tripDay) => {
              const presentation = getDayPresentation(tripDay);
              return (
                <DashboardTile
                  key={tripDay.id}
                  title={formatDateLabel(tripDay.date)}
                  subtitle={tripDay.label}
                  icon={presentation.icon}
                  onClick={() => onOpenDay(tripDay.id)}
                />
              );
            })}
            <DashboardTile
              title="Reservations"
              subtitle="Dining and fixed plans"
              icon="utensils"
              onClick={onOpenReservations}
            />
            <DashboardTile
              title="Notes"
              subtitle="Family reminders"
              icon="notebook"
              onClick={onOpenNotes}
            />
          </div>
        </section>
      </main>
    );
  }

  if (phase === 'after') {
    return (
      <>
        <ScreenHeader eyebrow="Trip complete" title="Disney Mayhem">
          <p>
            The May 29-June 4 trip is complete. Use All Days and Notes as the memory view.
          </p>
        </ScreenHeader>

        <section aria-labelledby="memory-heading" className="section-rise px-4 pb-6">
          <div className="glass-surface rounded-[2rem] p-5">
            <p className="text-sm font-black uppercase tracking-wide text-[#BF5AF2]">Memory view</p>
            <h2 id="memory-heading" className="mt-3 text-2xl font-black text-white">
              {formatDateLabel(tripStartDate)} through {formatDateLabel(tripEndDate)}
            </h2>
            <p className="mt-2 text-base leading-7 text-white">
              Review the finished timeline, keep notes, and mark favorite moments as done.
            </p>
          </div>
        </section>
      </>
    );
  }

  const nowItem = activeItem;
  const activeLand = getActiveLandBlock(day, activeItem, statuses);
  const upcomingLands = getUpcomingLandBlocks(day, activeLand);
  const nextLand = activeLand ? upcomingLands[0] : undefined;
  const laterLands = activeLand ? upcomingLands.slice(1, 4) : [];
  const laterItems = upcomingItems.filter((item) => item.id !== nextItem?.id).slice(0, 3);
  const dayPresentation = getDayPresentation(day);

  return (
    <>
      <header className="section-rise px-4 pb-8 pt-6">
        <div className="glass-surface relative overflow-hidden rounded-[2.2rem] px-6 py-8">
          <div className="absolute inset-0 bg-black/25" aria-hidden="true" />
          <div className="relative">
            <p className="text-[12px] font-black uppercase tracking-[0.18em] text-[#0A84FF]">{isToday ? 'Today' : 'Trip preview'}</p>
            <h1 className="mt-4 text-[36px] font-black leading-[1.02] text-white sm:text-[44px]">{dayPresentation.title}</h1>
            <p className="mt-3 text-[16px] font-semibold text-[#A1A1A6]">{formatDateLabel(day.date)}</p>
          </div>
        </div>
      </header>

      <section aria-labelledby="now-heading" className="section-rise px-4">
        <div className="glass-surface rounded-[2.4rem] px-6 py-12 text-center sm:px-10 sm:py-14">
          <p className="text-[13px] font-black uppercase tracking-[0.18em] text-[#BF5AF2]">Now</p>
          <h2 id="now-heading" className="mx-auto mt-5 max-w-2xl text-[40px] font-black leading-[1.02] text-white sm:text-[48px]">
            {activeLand ? activeLand.land : nowItem ? nowItem.title : 'Open time'}
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-[16px] font-semibold leading-7 text-[#A1A1A6]">
            {activeLand && nowItem
              ? `Current land · ${formatTimeRange(nowItem)}`
              : nowItem
                ? nowItem.type === 'flexible'
                  ? `${nowItem.area} · ${formatTimeRange(nowItem)}`
                  : `${nowItem.location} · ${formatTimeRange(nowItem)}`
              : 'No fixed item is active. Breathe, hydrate, and use Next when ready.'}
          </p>
          {(activeLand?.notes ?? nowItem?.notes) ? <p className="mx-auto mt-4 max-w-xl text-[15px] leading-6 text-[#A1A1A6]">{activeLand?.notes ?? nowItem?.notes}</p> : null}

          {nextActivity ? (
            <div className="mx-auto mt-7 max-w-md rounded-full bg-[#0A84FF] px-5 py-3 text-[16px] font-black text-black">
              Next: {nextActivity.title}
            </div>
          ) : null}

          {nowItem ? (
            <button
              type="button"
              onClick={() => onEditItem(day.id, nowItem)}
              className="mt-7 min-h-11 rounded-full bg-[#111111] px-5 py-2 text-[14px] font-black text-white focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#0A84FF]"
            >
              Edit
            </button>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="next-heading" className="section-rise mt-12 px-4">
        <h2 id="next-heading" className="mb-4 text-[13px] font-black uppercase tracking-[0.18em] text-[#0A84FF]">
          Next
        </h2>
        {activeLand ? (
          <div className="border-y border-[#2C2C2E]/70 py-5">
            {nextLand ? (
              <div>
                <p className="text-[13px] font-black uppercase tracking-[0.16em] text-[#0A84FF]">{formatLandTime(nextLand)}</p>
                <h3 className="mt-2 text-[22px] font-black leading-tight text-white">{nextLand.land}</h3>
                <p className="mt-2 text-[15px] font-semibold text-[#A1A1A6]">
                  {nextLand.activities.length > 0 ? `${nextLand.activities.length} activities` : 'Flexible block'}
                </p>
              </div>
            ) : (
              <div className="text-[15px] text-[#A1A1A6]">No more lands queued up.</div>
            )}
          </div>
        ) : nextItem && nextItem.id !== activeItem?.id ? (
          <div className="border-y border-[#2C2C2E]/70 py-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[13px] font-black uppercase tracking-[0.16em] text-[#0A84FF]">{formatTimeRange(nextItem)}</p>
                <h3 className="mt-2 text-[22px] font-black leading-tight text-white">{nextItem.title}</h3>
                <p className="mt-2 text-[15px] font-semibold text-[#A1A1A6]">{nextItem.type === 'flexible' ? nextItem.area : nextItem.location}</p>
              </div>
              <button
                type="button"
                onClick={() => onEditItem(day.id, nextItem)}
                className="ios-quiet-button"
                aria-label={`Edit ${nextItem.title}`}
                title="Edit"
              >
                Edit
              </button>
            </div>
          </div>
        ) : (
          <div className="border-y border-[#2C2C2E]/70 py-5 text-[15px] text-[#A1A1A6]">Nothing queued up yet.</div>
        )}
      </section>

      <section aria-labelledby="later-heading" className="section-rise mt-12 px-4 pb-8">
        <h2 id="later-heading" className="mb-4 text-[13px] font-black uppercase tracking-[0.18em] text-[#A1A1A6]">
          Later
        </h2>
        <ul className="divide-y divide-[#2C2C2E]/70" aria-label="Later today">
          {activeLand
            ? laterLands.map((land) => (
                <li key={land.id} className="min-h-16 px-1 py-3">
                  <p className="text-[12px] font-black uppercase tracking-[0.16em] text-[#A1A1A6]">{formatLandTime(land)}</p>
                  <h3 className="mt-1 text-[18px] font-black leading-tight text-white">{land.land}</h3>
                  <p className="mt-1 text-[14px] text-[#A1A1A6]">
                    {land.activities.length > 0 ? land.activities.map((activity) => activity.title).join(' · ') : 'Flexible block'}
                  </p>
                </li>
              ))
            : laterItems.map((item) => (
            <li key={item.id} className="flex min-h-16 items-center justify-between gap-4 rounded-[1.25rem] px-1 py-3">
              <div>
                <p className="text-[12px] font-black uppercase tracking-[0.16em] text-[#A1A1A6]">{formatTimeRange(item)}</p>
                <h3 className="mt-1 text-[18px] font-black leading-tight text-white">{item.title}</h3>
                <p className="mt-1 text-[14px] text-[#A1A1A6]">{item.type === 'flexible' ? item.area : item.location}</p>
              </div>
              <button
                type="button"
                onClick={() => onEditItem(day.id, item)}
                className="ios-quiet-button"
                aria-label={`Edit ${item.title}`}
                title="Edit"
              >
                Edit
              </button>
            </li>
          ))}
          {(activeLand ? laterLands.length : laterItems.length) === 0 ? <li className="glass-surface rounded-[1.4rem] p-4 text-[15px] text-[#A1A1A6]">No later items for this day.</li> : null}
        </ul>
        <div className="mt-6 border-t border-[#2C2C2E]/70 pt-6">
          <button
            type="button"
            onClick={onViewFullDay}
            className="min-h-12 w-full rounded-full bg-[#0A84FF] px-5 py-3 text-[16px] font-black text-black focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#0A84FF] sm:w-auto"
          >
            View Full Day
          </button>
        </div>
      </section>
    </>
  );
}

function CompactItem({
  item,
  statuses,
  eyebrow,
  onEdit,
}: {
  item: TripItem;
  statuses: Record<string, ItemStatus>;
  eyebrow?: string;
  onEdit?: () => void;
}) {
  const status = statuses[getItemStatusKey(item)];
  const nextActivity = findNextActivity(item, statuses);

  return (
    <article className={`py-4 ${item.type === 'flexible' ? 'glass-surface rounded-[1.5rem] p-4' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-black uppercase tracking-[0.16em] text-[#A1A1A6]">{eyebrow ?? formatTimeRange(item)}</p>
          <h3 className="mt-2 text-[19px] font-black leading-tight text-white">{item.title}</h3>
        </div>
        {onEdit ? (
          <button
            type="button"
            onClick={onEdit}
            className="ios-quiet-button"
            aria-label={`Edit ${item.title}`}
            title="Edit"
          >
            Edit
          </button>
        ) : null}
      </div>
      <p className="mt-2 text-[15px] text-[#A1A1A6]">{item.type === 'flexible' ? item.area : item.location}</p>
      {nextActivity ? <p className="mt-3 text-[14px] font-bold text-[#BF5AF2]">Next: {nextActivity.title}</p> : null}
    </article>
  );
}

function AttentionScreen({
  statuses,
  attentionItems,
  onEditItem,
}: {
  statuses: Record<string, ItemStatus>;
  attentionItems: ReturnType<typeof getAttentionItems>;
  onEditItem: (dayId: string, item: TripItem) => void;
}) {
  return (
    <>
      <ScreenHeader eyebrow="Needs decisions" title="Attention Needed">
        Reservations, multi-pass details, queue links, and open meal choices from the source itinerary.
      </ScreenHeader>
      <main className="screen-fade px-4 pb-6">
        <div className="divide-y divide-[#2C2C2E]/70">
        {attentionItems.map(({ day, item }) => (
          <article key={item.id} className={`py-4 ${item.type === 'flexible' ? 'glass-surface rounded-[1.6rem] p-4' : ''}`}>
            <p className="text-sm font-black uppercase tracking-wide text-[#FF9F0A]">{formatDateLabel(day.date)}</p>
            <div className="mt-1 flex items-start justify-between gap-3">
              <h2 className="text-xl font-black text-white">{item.title}</h2>
              <button
                type="button"
                onClick={() => onEditItem(day.id, item)}
                className="ios-quiet-button"
                aria-label={`Edit ${item.title}`}
                title="Edit"
              >
                Edit
              </button>
            </div>
            <p className="mt-1 font-semibold text-[#A1A1A6]">{formatTimeRange(item)}</p>
            <p className="mt-1 text-sm text-[#A1A1A6]">{item.type === 'flexible' ? item.area : item.location}</p>
            {item.notes ? <p className="mt-3 text-sm font-bold text-[#FF9F0A]">{item.notes}</p> : null}
          </article>
        ))}
        </div>
      </main>
    </>
  );
}

type EditorState =
  | {
      mode: 'edit';
      dayId: string;
      item: TripItem;
      draft: EditableItemFields;
    }
  | {
      mode: 'add';
      dayId: string;
      draft: EditableItemFields;
    };

type LandEditorActivity = {
  id: string;
  draft: EditableActivityFields;
  status: ItemStatus;
  isNew?: boolean;
  removed?: boolean;
};

type LandEditorState = {
  dayId: string;
  parentItem: FlexibleBlock;
  land: string;
  activities: LandEditorActivity[];
};

type LightningLanePickerState = {
  activityId: string;
  startTime: string;
  duration: number;
};

function ItemEditorSheet({
  editor,
  onChange,
  onSave,
  onCancel,
  onDelete,
}: {
  editor: EditorState;
  onChange: (draft: EditableItemFields) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const draft = editor.draft;

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/70 px-3 py-4 sm:items-center sm:justify-center" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="item-editor-title"
        className="glass-surface screen-fade max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-[2rem] p-5"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-black uppercase tracking-wide text-[#0A84FF]">{editor.mode === 'add' ? 'Add itinerary item' : 'Edit itinerary item'}</p>
            <h2 id="item-editor-title" className="mt-1 text-2xl font-black text-white">
              {editor.mode === 'add' ? 'New item' : draft.title || 'Untitled item'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="ios-quiet-button"
            aria-label="Close editor"
          >
            Close
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="text-sm font-black uppercase tracking-wide text-[#A1A1A6]">Type</span>
            <select
              value={draft.type}
              onChange={(event) => onChange({ ...draft, type: event.target.value as TripItem['type'] })}
              className="mt-2 min-h-12 w-full rounded-2xl border border-[#2C2C2E] bg-[#111111] px-4 text-lg font-bold text-white outline-none focus:border-[#0A84FF] focus:ring-4 focus:ring-[#0A84FF]/30"
            >
              <option value="scheduled">Scheduled</option>
              <option value="flexible">Flexible</option>
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-black uppercase tracking-wide text-[#A1A1A6]">Time</span>
            <input
              type="time"
              value={draft.time ?? ''}
              onChange={(event) => onChange({ ...draft, time: event.target.value })}
              className="mt-2 min-h-12 w-full rounded-2xl border border-[#2C2C2E] bg-[#111111] px-4 text-lg font-bold text-white outline-none focus:border-[#0A84FF] focus:ring-4 focus:ring-[#0A84FF]/30"
            />
          </label>

          <label className="block">
            <span className="text-sm font-black uppercase tracking-wide text-[#A1A1A6]">Title</span>
            <input
              value={draft.title}
              onChange={(event) => onChange({ ...draft, title: event.target.value })}
              className="mt-2 min-h-12 w-full rounded-2xl border border-[#2C2C2E] bg-[#111111] px-4 text-lg font-bold text-white outline-none focus:border-[#0A84FF] focus:ring-4 focus:ring-[#0A84FF]/30"
            />
          </label>

          <label className="block">
            <span className="text-sm font-black uppercase tracking-wide text-[#A1A1A6]">Location</span>
            <input
              value={draft.location}
              onChange={(event) => onChange({ ...draft, location: event.target.value })}
              className="mt-2 min-h-12 w-full rounded-2xl border border-[#2C2C2E] bg-[#111111] px-4 text-lg font-bold text-white outline-none focus:border-[#0A84FF] focus:ring-4 focus:ring-[#0A84FF]/30"
            />
          </label>

          <label className="block">
            <span className="text-sm font-black uppercase tracking-wide text-[#A1A1A6]">Notes</span>
            <textarea
              value={draft.notes ?? ''}
              onChange={(event) => onChange({ ...draft, notes: event.target.value })}
              className="mt-2 min-h-28 w-full rounded-2xl border border-[#2C2C2E] bg-[#111111] px-4 py-3 text-lg font-bold text-white outline-none focus:border-[#0A84FF] focus:ring-4 focus:ring-[#0A84FF]/30"
            />
          </label>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-between">
          {editor.mode === 'edit' ? (
            <button
              type="button"
              onClick={onDelete}
              className="min-h-12 rounded-full border border-[#FF453A] bg-[#1C1C1E] px-5 py-2 font-black text-[#FF453A] focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#FF453A]"
            >
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={onCancel}
              className="min-h-12 rounded-full border border-[#3A3A3C] bg-[#1C1C1E] px-5 py-2 font-black text-white focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#0A84FF]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSave}
              className="min-h-12 rounded-full bg-[#0A84FF] px-5 py-2 font-black text-black focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#0A84FF]"
            >
              Save
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function LandEditorSheet({
  editor,
  onChange,
  onSave,
  onCancel,
}: {
  editor: LandEditorState;
  onChange: (editor: LandEditorState) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [lightningLanePicker, setLightningLanePicker] = useState<LightningLanePickerState | null>(null);

  function updateActivity(id: string, draft: EditableActivityFields) {
    onChange({
      ...editor,
      activities: editor.activities.map((activity) => (activity.id === id ? { ...activity, draft } : activity)),
    });
  }

  function updateStatus(id: string, status: ItemStatus) {
    onChange({
      ...editor,
      activities: editor.activities.map((activity) => (activity.id === id ? { ...activity, status } : activity)),
    });
  }

  function addActivity() {
    const id = `local-activity-${editor.parentItem.id}-${Date.now()}`;
    onChange({
      ...editor,
      activities: [
        ...editor.activities,
        {
          id,
          isNew: true,
          status: 'todo',
          draft: {
            title: '',
            location: editor.land,
            notes: '',
            lightningLaneTime: '',
            lightningLaneEndTime: '',
            lightningLaneLabel: '',
          },
        },
      ],
    });
  }

  function removeActivity(id: string) {
    onChange({
      ...editor,
      activities: editor.activities.map((activity) => (activity.id === id ? { ...activity, removed: true } : activity)),
    });
  }

  function moveActivity(id: string, direction: -1 | 1) {
    const activities = [...editor.activities];
    const index = activities.findIndex((activity) => activity.id === id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= activities.length) return;
    const [activity] = activities.splice(index, 1);
    activities.splice(nextIndex, 0, activity);
    onChange({ ...editor, activities });
  }

  function openLightningLanePicker(activity: LandEditorActivity) {
    const startTime = activity.draft.lightningLaneStart || activity.draft.lightningLaneTime || '12:00';
    const endTime = activity.draft.lightningLaneEnd || activity.draft.lightningLaneEndTime;
    const duration = endTime
      ? Math.max(30, (Number(endTime.slice(0, 2)) * 60 + Number(endTime.slice(3, 5))) - (Number(startTime.slice(0, 2)) * 60 + Number(startTime.slice(3, 5))))
      : 60;

    setLightningLanePicker({
      activityId: activity.id,
      startTime,
      duration: lightningLaneDurationOptions.includes(duration) ? duration : 60,
    });
  }

  function saveLightningLaneWindow() {
    if (!lightningLanePicker) return;

    const endTime = addMinutesToTime(lightningLanePicker.startTime, lightningLanePicker.duration);
    const activity = editor.activities.find((candidate) => candidate.id === lightningLanePicker.activityId);
    if (!activity) return;

    updateActivity(activity.id, {
      ...activity.draft,
      lightningLaneTime: lightningLanePicker.startTime,
      lightningLaneStart: lightningLanePicker.startTime,
      lightningLaneEndTime: endTime,
      lightningLaneEnd: endTime,
      lightningLaneLabel: activity.draft.lightningLaneLabel || 'LL',
    });
    setLightningLanePicker(null);
  }

  function clearLightningLaneWindow() {
    if (!lightningLanePicker) return;
    const activity = editor.activities.find((candidate) => candidate.id === lightningLanePicker.activityId);
    if (!activity) return;

    updateActivity(activity.id, {
      ...activity.draft,
      lightningLaneTime: '',
      lightningLaneStart: '',
      lightningLaneEndTime: '',
      lightningLaneEnd: '',
      lightningLaneLabel: '',
    });
    setLightningLanePicker(null);
  }

  const visibleActivities = editor.activities.filter((activity) => !activity.removed);
  const inputClass =
    'mt-2 min-h-12 w-full rounded-2xl border border-[#2C2C2E] bg-[#111111] px-4 text-base font-bold text-white outline-none focus:border-[#0A84FF] focus:ring-4 focus:ring-[#0A84FF]/30';

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/70 px-3 py-4 sm:items-center sm:justify-center" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="land-editor-title"
        className="glass-surface screen-fade max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] p-5"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-black uppercase tracking-wide text-[#0A84FF]">Edit land card</p>
            <h2 id="land-editor-title" className="mt-1 text-2xl font-black text-white">
              {editor.land}
            </h2>
          </div>
          <button type="button" onClick={onCancel} className="ios-quiet-button" aria-label="Close land editor">
            Close
          </button>
        </div>

        <div className="mt-5 space-y-5">
          {visibleActivities.map((activity, index) => (
            <section key={activity.id} className="glass-surface rounded-[1.35rem] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[12px] font-black uppercase tracking-[0.16em] text-[#A1A1A6]">Ride {index + 1}</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => moveActivity(activity.id, -1)} className="ios-quiet-button" aria-label={`Move ${activity.draft.title || 'ride'} up`}>
                    Up
                  </button>
                  <button type="button" onClick={() => moveActivity(activity.id, 1)} className="ios-quiet-button" aria-label={`Move ${activity.draft.title || 'ride'} down`}>
                    Down
                  </button>
                  <button type="button" onClick={() => removeActivity(activity.id)} className="ios-quiet-button text-[#FF453A]" aria-label={`Remove ${activity.draft.title || 'ride'}`}>
                    Remove
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-4">
                <label className="block sm:col-span-2">
                  <span className="text-sm font-black uppercase tracking-wide text-[#A1A1A6]">Title</span>
                  <input
                    value={activity.draft.title}
                    onChange={(event) => updateActivity(activity.id, { ...activity.draft, title: event.target.value })}
                    className={inputClass}
                    required
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-black uppercase tracking-wide text-[#A1A1A6]">Status</span>
                  <select value={activity.status} onChange={(event) => updateStatus(activity.id, event.target.value as ItemStatus)} className={inputClass}>
                    <option value="todo">To do</option>
                    <option value="done">Done</option>
                    <option value="skipped">Skipped</option>
                  </select>
                </label>
                <div>
                  <p className="text-sm font-black uppercase tracking-wide text-[#A1A1A6]">Lightning Lane Window</p>
                  <button
                    type="button"
                    onClick={() => openLightningLanePicker(activity)}
                    className="mt-2 flex min-h-12 w-full items-center justify-between rounded-2xl border border-[#2C2C2E] bg-[#111111] px-4 text-left text-base font-bold text-white outline-none focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#0A84FF]"
                  >
                    <span>
                      {formatOptionalTimeRange(activity.draft.lightningLaneStart ?? activity.draft.lightningLaneTime, activity.draft.lightningLaneEnd ?? activity.draft.lightningLaneEndTime) ?? 'Not set'}
                    </span>
                    <span className="text-sm text-[#A1A1A6]">Set</span>
                  </button>
                </div>
                <label className="block sm:col-span-2">
                  <span className="text-sm font-black uppercase tracking-wide text-[#A1A1A6]">Notes</span>
                  <textarea
                    value={activity.draft.notes ?? ''}
                    onChange={(event) => updateActivity(activity.id, { ...activity.draft, notes: event.target.value })}
                    className="mt-2 min-h-24 w-full rounded-2xl border border-[#2C2C2E] bg-[#111111] px-4 py-3 text-base font-bold text-white outline-none focus:border-[#0A84FF] focus:ring-4 focus:ring-[#0A84FF]/30"
                  />
                </label>
              </div>
            </section>
          ))}
        </div>

        {lightningLanePicker ? (
          <div className="fixed inset-0 z-50 flex items-end bg-black/70 px-3 py-4 sm:items-center sm:justify-center" role="presentation">
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="ll-picker-title"
              className="glass-surface screen-fade max-h-[88vh] w-full max-w-xl overflow-y-auto rounded-[2rem] p-5"
            >
              <h3 id="ll-picker-title" className="text-2xl font-black text-white">
                Lightning Lane Window
              </h3>
              <label className="mt-5 block">
                <span className="text-sm font-black uppercase tracking-wide text-[#A1A1A6]">Lightning Lane Start</span>
                <input
                  type="time"
                  value={lightningLanePicker.startTime}
                  onChange={(event) => setLightningLanePicker({ ...lightningLanePicker, startTime: event.target.value || '12:00' })}
                  className="mt-2 min-h-12 w-full rounded-2xl border border-[#2C2C2E] bg-[#1C1C1E] px-4 text-lg font-bold text-white outline-none focus:border-[#0A84FF] focus:ring-4 focus:ring-[#0A84FF]/30"
                />
              </label>

              <p className="mt-5 text-sm font-black uppercase tracking-wide text-[#A1A1A6]">Duration</p>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {lightningLaneDurationOptions.map((duration) => {
                  const selected = lightningLanePicker.duration === duration;
                  return (
                    <button
                      key={duration}
                      type="button"
                      onClick={() => setLightningLanePicker({ ...lightningLanePicker, duration })}
                      className={`min-h-11 rounded-full border px-3 py-2 text-sm font-black focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#0A84FF] ${
                        selected ? 'border-[#0A84FF] bg-[#0A84FF]/15 text-white ring-2 ring-[#0A84FF]' : 'border-[#2C2C2E] bg-[#1C1C1E] text-[#A1A1A6]'
                      }`}
                      aria-pressed={selected}
                    >
                      {duration} min
                    </button>
                  );
                })}
              </div>

              <div className="glass-surface mt-6 rounded-[1.25rem] p-4">
                <p className="text-sm font-black uppercase tracking-wide text-[#A1A1A6]">Preview</p>
                <p className="mt-2 text-xl font-black text-white">LL window: {formatOptionalTimeRange(lightningLanePicker.startTime, addMinutesToTime(lightningLanePicker.startTime, lightningLanePicker.duration))}</p>
              </div>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setLightningLanePicker(null)} className="min-h-12 rounded-full border border-[#3A3A3C] bg-[#1C1C1E] px-5 py-2 font-black text-white focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#0A84FF]">
                  Cancel
                </button>
                <button type="button" onClick={clearLightningLaneWindow} className="min-h-12 rounded-full border border-[#FF453A] bg-[#1C1C1E] px-5 py-2 font-black text-[#FF453A] focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#FF453A]">
                  Clear
                </button>
                <button type="button" onClick={saveLightningLaneWindow} className="min-h-12 rounded-full bg-[#0A84FF] px-5 py-2 font-black text-black focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#0A84FF]">
                  Save
                </button>
              </div>
            </section>
          </div>
        ) : null}

        <button
          type="button"
          onClick={addActivity}
          className="mt-5 min-h-12 w-full rounded-full border border-[#3A3A3C] bg-[#1C1C1E] px-5 py-2 font-black text-white focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#0A84FF]"
        >
          Add ride
        </button>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-12 rounded-full border border-[#3A3A3C] bg-[#1C1C1E] px-5 py-2 font-black text-white focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#0A84FF]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            className="min-h-12 rounded-full bg-[#0A84FF] px-5 py-2 font-black text-black focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#0A84FF]"
          >
            Save
          </button>
        </div>
      </section>
    </div>
  );
}

function FlexibleTimelineItem({
  day,
  item,
  statuses,
  onCycleStatus,
  onEditItem,
  onEditLand,
}: {
  day: TripDay;
  item: FlexibleBlock;
  statuses: Record<string, ItemStatus>;
  onCycleStatus: (id: string) => void;
  onEditItem: (dayId: string, item: TripItem) => void;
  onEditLand: (day: TripDay, item: FlexibleBlock, land: string, activities: Activity[]) => void;
}) {
  const itemStatus = statuses[getItemStatusKey(item)];
  const groups = groupActivitiesByLand(day, item);

  return (
    <article className="py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-black uppercase tracking-[0.16em] text-[#0A84FF]">{formatTimeRange(item)}</p>
          <p className="mt-2 text-[15px] font-semibold text-[#A1A1A6]">{item.location}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onEditItem(day.id, item)}
            className="ios-quiet-button"
            aria-label={`Edit ${item.title}`}
            title="Edit"
          >
            Edit
          </button>
          <StatusButton id={item.id} status={itemStatus} onCycle={onCycleStatus} />
        </div>
      </div>

      {item.notes ? <p className="mt-4 text-[15px] leading-6 text-[#A1A1A6]">{item.notes}</p> : null}

      <div className="mt-6 space-y-7">
        {groups.map((group) => (
          <section key={`${item.id}-${group.land}`} aria-label={`${item.title} ${group.land}`} className="glass-surface rounded-[1.35rem] px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-[13px] font-black uppercase tracking-[0.18em] text-white">{group.land}</h4>
              <button
                type="button"
                onClick={() => onEditLand(day, item, group.land, group.activities)}
                className="ios-quiet-button"
                aria-label={`Edit ${group.land}`}
                title={`Edit ${group.land}`}
              >
                <LucideIcon name="pencil" size={16} className="text-[#A1A1A6]" />
              </button>
            </div>
            <ul className="mt-3 divide-y divide-[#2C2C2E]/70">
              {group.activities.map((activity) => {
                const statusKey = getActivityStatusKey(item, activity);
                const lightningLaneTime = formatLightningLane(activity);

                return (
                  <li key={activity.id} className="flex min-h-16 items-center justify-between gap-4 py-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[16px] font-bold text-white">{activity.title}</p>
                        {lightningLaneTime ? (
                          <span className="rounded-full border border-[#0A84FF]/30 bg-[#0A84FF]/10 px-2 py-1 text-[12px] font-black text-[#0A84FF]">
                            {activity.lightningLaneLabel || 'LL'} {lightningLaneTime}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-[14px] text-[#A1A1A6]">{activity.location}</p>
                      {activity.notes ? <p className="mt-2 text-[14px] leading-5 text-[#A1A1A6]">{activity.notes}</p> : null}
                    </div>
                    <StatusButton id={statusKey} status={statuses[statusKey]} onCycle={onCycleStatus} />
                  </li>
                );
              })}
              {group.activities.length === 0 ? <li className="py-3 text-[15px] text-[#A1A1A6]">No activities listed for this flexible block.</li> : null}
            </ul>
          </section>
        ))}
      </div>
    </article>
  );
}

function DayTimeline({
  day,
  statuses,
  onCycleStatus,
  onEditItem,
  onAddItem,
  onEditLand,
}: {
  day: TripDay;
  statuses: Record<string, ItemStatus>;
  onCycleStatus: (id: string) => void;
  onEditItem: (dayId: string, item: TripItem) => void;
  onAddItem: (dayId: string) => void;
  onEditLand: (day: TripDay, item: FlexibleBlock, land: string, activities: Activity[]) => void;
}) {
  return (
    <section aria-labelledby={`${day.id}-heading`} className="section-rise px-4 py-8">
      <div className="glass-surface mb-5 rounded-[1.5rem] px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[12px] font-black uppercase tracking-[0.16em] text-[#0A84FF]">{formatDateLabel(day.date)}</p>
            <h2 id={`${day.id}-heading`} className="mt-2 text-[26px] font-black leading-tight text-white">
              {day.label}
            </h2>
            <p className="mt-1 text-[15px] font-semibold text-[#A1A1A6]">{day.park}</p>
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => onAddItem(day.id)}
        className="mb-5 min-h-11 rounded-full bg-[#0A84FF] px-4 py-2 text-sm font-black text-black transition hover:bg-[#409CFF] focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#0A84FF]"
      >
        Add item
      </button>
      <div className="divide-y divide-[#2C2C2E]/70">
        {day.items.map((item) =>
          item.type === 'flexible' ? (
            <FlexibleTimelineItem
              key={item.id}
              day={day}
              item={item}
              statuses={statuses}
              onCycleStatus={onCycleStatus}
              onEditItem={onEditItem}
              onEditLand={onEditLand}
            />
          ) : (
            <ItemCard
              key={item.id}
              item={item}
              statuses={statuses}
              onCycleStatus={onCycleStatus}
              onEdit={(selectedItem) => onEditItem(day.id, selectedItem)}
            />
          ),
        )}
      </div>
    </section>
  );
}

function AllDaysScreen({
  statuses,
  onCycleStatus,
  days,
  onEditItem,
  onAddItem,
  onEditLand,
}: {
  statuses: Record<string, ItemStatus>;
  onCycleStatus: (id: string) => void;
  days: TripDay[];
  onEditItem: (dayId: string, item: TripItem) => void;
  onAddItem: (dayId: string) => void;
  onEditLand: (day: TripDay, item: FlexibleBlock, land: string, activities: Activity[]) => void;
}) {
  return (
    <main className="screen-fade pt-2">
      {days.map((day) => (
        <DayTimeline key={day.id} day={day} statuses={statuses} onCycleStatus={onCycleStatus} onEditItem={onEditItem} onAddItem={onAddItem} onEditLand={onEditLand} />
      ))}
    </main>
  );
}

function ReservationsScreen({
  statuses,
  reservations,
  onEditItem,
}: {
  statuses: Record<string, ItemStatus>;
  reservations: ReturnType<typeof getReservations>;
  onEditItem: (dayId: string, item: TripItem) => void;
}) {
  return (
    <>
      <ScreenHeader eyebrow="Fixed plans" title="Reservations" />
      <main className="screen-fade px-4 pb-6">
        <div className="divide-y divide-[#2C2C2E]/70">
        {reservations.map(({ day, item }) => (
          <article key={item.id} className="py-4">
            <p className="text-sm font-black uppercase tracking-wide text-[#0A84FF]">{formatDateLabel(day.date)}</p>
            <div className="mt-1 flex items-start justify-between gap-3">
              <h2 className="text-xl font-black text-white">{item.title}</h2>
              <button
                type="button"
                onClick={() => onEditItem(day.id, item)}
                className="ios-quiet-button"
                aria-label={`Edit ${item.title}`}
                title="Edit"
              >
                Edit
              </button>
            </div>
            <p className="mt-1 font-semibold text-[#A1A1A6]">{formatTimeRange(item)}</p>
            <p className="mt-1 text-sm text-[#A1A1A6]">{item.location}</p>
          </article>
        ))}
        </div>
      </main>
    </>
  );
}

function NotesScreen({
  notes,
  setNote,
  days,
}: {
  notes: Record<string, string>;
  setNote: (id: string, note: string) => void;
  days: TripDay[];
}) {
  return (
    <>
      <ScreenHeader eyebrow="Family notes" title="Notes">
        Saved on this device for quick reminders.
      </ScreenHeader>
      <main className="screen-fade space-y-4 px-4 pb-6">
        {days.map((day) => (
          <label key={day.id} className="glass-surface block rounded-[1.6rem] p-4">
            <span className="block text-lg font-black text-white">{day.label}</span>
            <span className="mt-1 block text-sm text-[#A1A1A6]">{formatDateLabel(day.date)}</span>
            <textarea
              value={notes[day.id] ?? ''}
              onChange={(event) => setNote(day.id, event.target.value)}
              className="mt-3 min-h-28 w-full rounded-3xl border border-[#2C2C2E] bg-[#111111] px-4 py-3 text-base text-white outline-none focus:border-[#0A84FF] focus:ring-4 focus:ring-[#0A84FF]/30"
              placeholder="Add reminders, mobile order ideas, kid notes, or backup plans."
            />
          </label>
        ))}
      </main>
    </>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('today');
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [landEditor, setLandEditor] = useState<LandEditorState | null>(null);
  const tripStorage = useTripStorage();

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const tripDays = useMemo(
    () =>
      mergeTripEdits(
        baseTripDays,
        tripStorage.itemEdits,
        tripStorage.addedItems,
        tripStorage.deletedItemIds,
        tripStorage.activityEdits,
        tripStorage.addedActivities,
        tripStorage.deletedActivityIds,
      ),
    [tripStorage.activityEdits, tripStorage.addedActivities, tripStorage.addedItems, tripStorage.deletedActivityIds, tripStorage.deletedItemIds, tripStorage.itemEdits],
  );
  const reservations = useMemo(() => getReservations(tripDays), [tripDays]);
  const attentionItems = useMemo(() => getAttentionItems(tripDays), [tripDays]);
  const activeState = useMemo(() => getActiveScheduleState(tripDays, tripStorage.statuses, now), [now, tripDays, tripStorage.statuses]);
  const phase = useMemo(() => getTripPhase(now), [now]);
  const countdown = useMemo(() => getDepartureCountdown(now), [now]);
  const selectedTimelineDay = selectedDayId ? tripDays.find((tripDay) => tripDay.id === selectedDayId) : undefined;
  const timelineDays = selectedTimelineDay ? [selectedTimelineDay] : tripDays;

  function openTab(tab: AppTab) {
    if (tab === 'days') setSelectedDayId(null);
    setActiveTab(tab);
  }

  function openDashboard() {
    setSelectedDayId(null);
    setActiveTab('today');
  }

  function openDashboardDay(dayId: string) {
    setSelectedDayId(dayId);
    setActiveTab('days');
  }

  function openDashboardTab(tab: Extract<AppTab, 'reservations' | 'notes'>) {
    setSelectedDayId(null);
    setActiveTab(tab);
  }

  function openEditItem(dayId: string, item: TripItem) {
    setEditor({
      mode: 'edit',
      dayId,
      item,
      draft: toEditableFields(item),
    });
  }

  function openAddItem(dayId: string) {
    setEditor({
      mode: 'add',
      dayId,
      draft: {
        time: '',
        title: '',
        location: '',
        notes: '',
        type: 'scheduled',
      },
    });
  }

  function openLandEditor(day: TripDay, item: FlexibleBlock, land: string, activities: Activity[]) {
    setLandEditor({
      dayId: day.id,
      parentItem: item,
      land,
      activities: activities.map((activity) => ({
        id: activity.id,
        status: tripStorage.statuses[getActivityStatusKey(item, activity)] ?? 'todo',
        draft: {
          ...toEditableActivityFields(activity),
          displayOrder: item.activities.findIndex((candidate) => candidate.id === activity.id),
        },
      })),
    });
  }

  function saveEditor() {
    if (!editor) return;

    if (editor.mode === 'edit') {
      tripStorage.saveItemEdit(editor.item.id, editor.draft);
    } else {
      const id = `local-${editor.dayId}-${Date.now()}`;
      tripStorage.addItem(editor.dayId, createItemFromFields(id, editor.draft));
    }

    setEditor(null);
  }

  function deleteEditorItem() {
    if (!editor || editor.mode !== 'edit') return;
    tripStorage.deleteItem(editor.item.id);
    setEditor(null);
  }

  function saveLandEditor() {
    if (!landEditor) return;

    const visibleActivities = landEditor.activities.filter((activity) => !activity.removed);
    if (visibleActivities.some((activity) => !activity.draft.title.trim())) {
      window.alert('Each ride needs a title before saving.');
      return;
    }

    const baseDisplayOrder = Math.min(
      ...visibleActivities.map((activity) => activity.draft.displayOrder ?? landEditor.parentItem.activities.length),
      landEditor.parentItem.activities.length,
    );

    landEditor.activities.forEach((activity) => {
      if (activity.removed) {
        if (!activity.isNew) tripStorage.deleteActivity(landEditor.dayId, landEditor.parentItem.id, activity.id);
        return;
      }

      const currentIndex = visibleActivities.findIndex((candidate) => candidate.id === activity.id);
      const draft = {
        ...activity.draft,
        title: activity.draft.title.trim(),
        location: activity.draft.location.trim() || landEditor.land,
        time: '',
        endTime: '',
        lightningLaneStart: activity.draft.lightningLaneTime ?? activity.draft.lightningLaneStart,
        lightningLaneEnd: activity.draft.lightningLaneEndTime ?? activity.draft.lightningLaneEnd,
        displayOrder: baseDisplayOrder + currentIndex,
      };
      const savedActivity = createActivityFromFields(activity.id, draft);

      console.log('Ride edit payload saved', {
        dayId: landEditor.dayId,
        parentItemId: landEditor.parentItem.id,
        activityId: activity.id,
        action: activity.isNew ? 'add' : 'edit',
        payload: activity.isNew ? savedActivity : draft,
      });

      if (activity.isNew) {
        tripStorage.addActivity(landEditor.dayId, landEditor.parentItem.id, savedActivity);
      } else {
        tripStorage.saveActivityEdit(landEditor.dayId, landEditor.parentItem.id, activity.id, draft);
      }

      const statusKey = `${landEditor.parentItem.id}:${activity.id}`;
      if ((tripStorage.statuses[statusKey] ?? 'todo') !== activity.status) {
        tripStorage.setStatus(statusKey, activity.status);
      }
    });

    setLandEditor(null);
  }

  return (
    <div className="relative min-h-screen text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 bg-[url('/disneymayhem-background.jpg')] bg-cover bg-[center_top] bg-no-repeat"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[1] bg-[linear-gradient(to_bottom,rgba(0,0,0,0.12),rgba(0,0,0,0.38))]"
      />
      <div key={`${activeTab}-${selectedDayId ?? 'all'}`} className={`screen-fade relative z-10 mx-auto max-w-4xl ${phase === 'before' ? 'pb-8' : 'pb-20'}`}>
        {phase === 'before' && activeTab !== 'today' ? (
          <div className="sticky top-0 z-20 px-4 pb-2 pt-3 backdrop-blur-sm">
            <button
              type="button"
              onClick={openDashboard}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[#2C2C2E]/80 bg-[#1C1C1E]/95 text-white shadow-lg shadow-black/30 transition hover:bg-[#2C2C2E] focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#0A84FF]"
              aria-label="Back to dashboard"
            >
              <LucideIcon name="chevron-left" size={24} className="text-[#A1A1A6]" />
            </button>
          </div>
        ) : null}
        {activeTab === 'today' ? (
          <TodayScreen
            {...activeState}
            statuses={tripStorage.statuses}
            onCycleStatus={tripStorage.cycleStatus}
            onEditItem={openEditItem}
            onViewFullDay={() => openDashboardDay(activeState.day.id)}
            attentionItems={attentionItems}
            phase={phase}
            countdown={countdown}
            days={tripDays}
            onOpenDay={openDashboardDay}
            onOpenReservations={() => openDashboardTab('reservations')}
            onOpenNotes={() => openDashboardTab('notes')}
          />
        ) : null}
        {activeTab === 'days' ? (
          <AllDaysScreen
            days={timelineDays}
            statuses={tripStorage.statuses}
            onCycleStatus={tripStorage.cycleStatus}
            onEditItem={openEditItem}
            onAddItem={openAddItem}
            onEditLand={openLandEditor}
          />
        ) : null}
        {activeTab === 'attention' ? <AttentionScreen statuses={tripStorage.statuses} attentionItems={attentionItems} onEditItem={openEditItem} /> : null}
        {activeTab === 'reservations' ? (
          <ReservationsScreen statuses={tripStorage.statuses} reservations={reservations} onEditItem={openEditItem} />
        ) : null}
        {activeTab === 'notes' ? <NotesScreen notes={tripStorage.notes} setNote={tripStorage.setNote} days={tripDays} /> : null}
      </div>
      {phase === 'before' ? null : <Tabs activeTab={activeTab} onChange={openTab} />}
      {editor ? (
        <ItemEditorSheet
          editor={editor}
          onChange={(draft) => setEditor({ ...editor, draft } as EditorState)}
          onSave={saveEditor}
          onCancel={() => setEditor(null)}
          onDelete={deleteEditorItem}
        />
      ) : null}
      {landEditor ? (
        <LandEditorSheet
          editor={landEditor}
          onChange={setLandEditor}
          onSave={saveLandEditor}
          onCancel={() => setLandEditor(null)}
        />
      ) : null}
    </div>
  );
}
