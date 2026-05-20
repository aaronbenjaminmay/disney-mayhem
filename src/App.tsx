import { useEffect, useMemo, useState } from 'react';
import { ItemCard } from './components/ItemCard';
import { ScreenHeader } from './components/ScreenHeader';
import { AppTab, Tabs } from './components/Tabs';
import { tripDays as baseTripDays, tripEndDate, tripStartDate } from './data/tripData';
import { useTripStorage } from './hooks/useTripStorage';
import type { EditableItemFields, ItemStatus, TripDay, TripItem } from './types';
import { createItemFromFields, getAttentionItems, getReservations, mergeTripEdits, toEditableFields } from './utils/itineraryEdits';
import {
  findNextActivity,
  formatDateLabel,
  formatTimeRange,
  getActiveScheduleState,
  getDepartureCountdown,
  getItemStatusKey,
  getTripPhase,
} from './utils/time';

function statusClass(status?: ItemStatus) {
  if (status === 'done') return 'bg-[#30D158]/12';
  if (status === 'skipped') return 'bg-[#1C1C1E]';
  return 'bg-[#111111]';
}

function getDayPresentation(day: TripDay) {
  if (day.label.toLowerCase().includes('departure') || day.label.toLowerCase().includes('travel')) {
    return { title: 'Travel Day ✈️', symbol: '✈️' };
  }

  if (day.park === 'Magic Kingdom') return { title: 'Magic Kingdom Day 🏰', symbol: '🏰' };
  if (day.park === 'EPCOT') return { title: 'EPCOT Day 🌐', symbol: '🌐' };
  if (day.park === 'Hollywood Studios') return { title: 'Hollywood Studios Day 🎬', symbol: '🎬' };
  if (day.park === 'Animal Kingdom') return { title: 'Animal Kingdom Day 🌿', symbol: '🌿' };
  return { title: `${day.label} ✨`, symbol: '✨' };
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
}: ReturnType<typeof getActiveScheduleState> & {
  statuses: Record<string, ItemStatus>;
  onCycleStatus: (id: string) => void;
  onEditItem: (dayId: string, item: TripItem) => void;
  onViewFullDay: () => void;
  attentionItems: ReturnType<typeof getAttentionItems>;
  phase: ReturnType<typeof getTripPhase>;
  countdown: ReturnType<typeof getDepartureCountdown>;
}) {
  if (phase === 'before') {
    const countdownUnits = [
      { label: 'Days', value: countdown.days },
      { label: 'Hours', value: countdown.hours },
      { label: 'Minutes', value: countdown.minutes },
      { label: 'Seconds', value: countdown.seconds },
    ];

    return (
      <>
        <ScreenHeader eyebrow="Countdown" title="Disney Mayhem">
          <p>Departure is Friday, May 29 at 4:00 AM.</p>
        </ScreenHeader>

        <section aria-labelledby="countdown-heading" className="section-rise px-4">
          <div className="rounded-[2rem] bg-[#111111] px-5 py-8 text-center shadow-2xl shadow-black/30 sm:px-8 sm:py-10">
            <p className="text-[13px] font-black uppercase tracking-[0.18em] text-white">Disney Mayhem begins in...</p>
            <h2 id="countdown-heading" className="sr-only">
              Live countdown to Disney Mayhem departure
            </h2>
            <div className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-7" aria-live="polite" aria-label="Live countdown to departure">
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
              <p className="mt-9 text-[15px] font-semibold text-[#A1A1A6]">
                First up: {formatTimeRange(nextItem)} · {nextItem.title}
              </p>
            ) : null}
          </div>
        </section>

        <section aria-labelledby="prep-heading" className="section-rise mt-5 px-4 pb-6">
          <h2 id="prep-heading" className="mb-3 text-lg font-black text-white">
            Prep Focus
          </h2>
          <div className="space-y-3">
            {attentionItems.slice(0, 4).map(({ day: attentionDay, item }) => (
              <CompactItem
                key={item.id}
                item={item}
                statuses={statuses}
                eyebrow={formatDateLabel(attentionDay.date)}
                onEdit={() => onEditItem(attentionDay.id, item)}
              />
            ))}
          </div>
        </section>
      </>
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
          <div className="rounded-[2rem] border border-[#BF5AF2]/45 bg-[#1C1C1E] p-5">
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
  const laterItems = upcomingItems.filter((item) => item.id !== nextItem?.id).slice(0, 3);
  const dayPresentation = getDayPresentation(day);

  return (
    <>
      <header className="section-rise px-4 pb-8 pt-6">
        <div className="relative overflow-hidden rounded-[2.2rem] bg-[#111111] px-6 py-8 shadow-2xl shadow-black/40">
          <div className="absolute -right-6 -top-8 select-none text-[8rem] opacity-25 blur-sm" aria-hidden="true">
            {dayPresentation.symbol}
          </div>
          <div className="absolute inset-0 bg-black/25" aria-hidden="true" />
          <div className="relative">
            <p className="text-[12px] font-black uppercase tracking-[0.18em] text-[#0A84FF]">{isToday ? 'Today' : 'Trip preview'}</p>
            <h1 className="mt-4 text-[36px] font-black leading-[1.02] text-white sm:text-[44px]">{dayPresentation.title}</h1>
            <p className="mt-3 text-[16px] font-semibold text-[#A1A1A6]">{formatDateLabel(day.date)}</p>
          </div>
        </div>
      </header>

      <section aria-labelledby="now-heading" className="section-rise px-4">
        <div className="rounded-[2.4rem] bg-[#1C1C1E] px-6 py-12 text-center shadow-[0_0_60px_rgba(10,132,255,0.14)] sm:px-10 sm:py-14">
          <p className="text-[13px] font-black uppercase tracking-[0.18em] text-[#BF5AF2]">Now</p>
          <h2 id="now-heading" className="mx-auto mt-5 max-w-2xl text-[40px] font-black leading-[1.02] text-white sm:text-[48px]">
            {nowItem ? nowItem.title : 'Open time'}
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-[16px] font-semibold leading-7 text-[#A1A1A6]">
            {nowItem
              ? nowItem.type === 'flexible'
                ? `${nowItem.area} · ${formatTimeRange(nowItem)}`
                : `${nowItem.location} · ${formatTimeRange(nowItem)}`
              : 'No fixed item is active. Breathe, hydrate, and use Next when ready.'}
          </p>
          {nowItem?.notes ? <p className="mx-auto mt-4 max-w-xl text-[15px] leading-6 text-[#A1A1A6]">{nowItem.notes}</p> : null}

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
        {nextItem && nextItem.id !== activeItem?.id ? (
          <div className="rounded-[1.8rem] bg-[#1C1C1E] p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[13px] font-black uppercase tracking-[0.16em] text-[#0A84FF]">{formatTimeRange(nextItem)}</p>
                <h3 className="mt-2 text-[22px] font-black leading-tight text-white">{nextItem.title}</h3>
                <p className="mt-2 text-[15px] font-semibold text-[#A1A1A6]">{nextItem.type === 'flexible' ? nextItem.area : nextItem.location}</p>
              </div>
              <button
                type="button"
                onClick={() => onEditItem(day.id, nextItem)}
                className="ios-icon-button"
                aria-label={`Edit ${nextItem.title}`}
                title="Edit"
              >
                ✎
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-[1.8rem] bg-[#1C1C1E] p-5 text-[15px] text-[#A1A1A6]">Nothing queued up yet.</div>
        )}
      </section>

      <section aria-labelledby="later-heading" className="section-rise mt-12 px-4 pb-8">
        <h2 id="later-heading" className="mb-4 text-[13px] font-black uppercase tracking-[0.18em] text-[#A1A1A6]">
          Later
        </h2>
        <ul className="space-y-1" aria-label="Later today">
          {laterItems.map((item) => (
            <li key={item.id} className="flex min-h-16 items-center justify-between gap-4 rounded-[1.25rem] px-1 py-3">
              <div>
                <p className="text-[12px] font-black uppercase tracking-[0.16em] text-[#A1A1A6]">{formatTimeRange(item)}</p>
                <h3 className="mt-1 text-[18px] font-black leading-tight text-white">{item.title}</h3>
                <p className="mt-1 text-[14px] text-[#A1A1A6]">{item.type === 'flexible' ? item.area : item.location}</p>
              </div>
              <button
                type="button"
                onClick={() => onEditItem(day.id, item)}
                className="ios-icon-button"
                aria-label={`Edit ${item.title}`}
                title="Edit"
              >
                ✎
              </button>
            </li>
          ))}
          {laterItems.length === 0 ? <li className="rounded-[1.4rem] bg-[#111111] p-4 text-[15px] text-[#A1A1A6]">No later items for this day.</li> : null}
        </ul>
        <button
          type="button"
          onClick={onViewFullDay}
          className="mt-6 min-h-12 w-full rounded-full bg-[#0A84FF] px-5 py-3 text-[16px] font-black text-black focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#0A84FF] sm:w-auto"
        >
          View Full Day
        </button>
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
    <article className={`py-4 ${item.type === 'flexible' ? 'rounded-[1.5rem] bg-[#1C1C1E] p-4' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-black uppercase tracking-[0.16em] text-[#A1A1A6]">{eyebrow ?? formatTimeRange(item)}</p>
          <h3 className="mt-2 text-[19px] font-black leading-tight text-white">{item.title}</h3>
        </div>
        {onEdit ? (
          <button
            type="button"
            onClick={onEdit}
            className="ios-icon-button"
            aria-label={`Edit ${item.title}`}
            title="Edit"
          >
            ✎
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
      <main className="screen-fade space-y-2 px-4 pb-6">
        {attentionItems.map(({ day, item }) => (
          <article key={item.id} className={`py-4 ${item.type === 'flexible' ? 'rounded-[1.6rem] bg-[#1C1C1E] p-4' : ''}`}>
            <p className="text-sm font-black uppercase tracking-wide text-[#FF9F0A]">{formatDateLabel(day.date)}</p>
            <div className="mt-1 flex items-start justify-between gap-3">
              <h2 className="text-xl font-black text-white">{item.title}</h2>
              <button
                type="button"
                onClick={() => onEditItem(day.id, item)}
                className="ios-icon-button"
                aria-label={`Edit ${item.title}`}
                title="Edit"
              >
                ✎
              </button>
            </div>
            <p className="mt-1 font-semibold text-[#A1A1A6]">{formatTimeRange(item)}</p>
            <p className="mt-1 text-sm text-[#A1A1A6]">{item.type === 'flexible' ? item.area : item.location}</p>
            {item.notes ? <p className="mt-3 text-sm font-bold text-[#FF9F0A]">{item.notes}</p> : null}
          </article>
        ))}
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
        className="screen-fade max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-[2rem] border border-[#2C2C2E] bg-[#111111] p-5 shadow-2xl shadow-black"
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
            className="ios-icon-button"
            aria-label="Close editor"
          >
            ×
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

function DayTimeline({
  day,
  statuses,
  onCycleStatus,
  onEditItem,
  onAddItem,
}: {
  day: TripDay;
  statuses: Record<string, ItemStatus>;
  onCycleStatus: (id: string) => void;
  onEditItem: (dayId: string, item: TripItem) => void;
  onAddItem: (dayId: string) => void;
}) {
  return (
    <section aria-labelledby={`${day.id}-heading`} className="section-rise px-4 py-4">
      <div className="mb-3">
        <p className="text-sm font-black uppercase tracking-wide text-[#0A84FF]">{formatDateLabel(day.date)}</p>
        <h2 id={`${day.id}-heading`} className="text-2xl font-black text-white">
          {day.label}
        </h2>
        <p className="text-sm font-semibold text-[#A1A1A6]">{day.park}</p>
      </div>
      <button
        type="button"
        onClick={() => onAddItem(day.id)}
        className="mb-3 min-h-11 rounded-full bg-[#0A84FF] px-4 py-2 text-sm font-black text-black transition hover:bg-[#409CFF] focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#0A84FF]"
      >
        Add item
      </button>
      <div className="space-y-3">
        {day.items.map((item) => (
          <ItemCard key={item.id} item={item} statuses={statuses} onCycleStatus={onCycleStatus} onEdit={(selectedItem) => onEditItem(day.id, selectedItem)} />
        ))}
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
}: {
  statuses: Record<string, ItemStatus>;
  onCycleStatus: (id: string) => void;
  days: TripDay[];
  onEditItem: (dayId: string, item: TripItem) => void;
  onAddItem: (dayId: string) => void;
}) {
  return (
    <>
      <ScreenHeader eyebrow="Timeline" title="All Days">
        Fixed reservations and transport stay timed. Ride groups stay flexible and grouped.
      </ScreenHeader>
      {days.map((day) => (
        <DayTimeline key={day.id} day={day} statuses={statuses} onCycleStatus={onCycleStatus} onEditItem={onEditItem} onAddItem={onAddItem} />
      ))}
    </>
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
      <main className="screen-fade space-y-2 px-4 pb-6">
        {reservations.map(({ day, item }) => (
          <article key={item.id} className="py-4">
            <p className="text-sm font-black uppercase tracking-wide text-[#0A84FF]">{formatDateLabel(day.date)}</p>
            <div className="mt-1 flex items-start justify-between gap-3">
              <h2 className="text-xl font-black text-white">{item.title}</h2>
              <button
                type="button"
                onClick={() => onEditItem(day.id, item)}
                className="ios-icon-button"
                aria-label={`Edit ${item.title}`}
                title="Edit"
              >
                ✎
              </button>
            </div>
            <p className="mt-1 font-semibold text-[#A1A1A6]">{formatTimeRange(item)}</p>
            <p className="mt-1 text-sm text-[#A1A1A6]">{item.location}</p>
          </article>
        ))}
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
          <label key={day.id} className="block rounded-[1.6rem] border border-[#2C2C2E] bg-[#1C1C1E] p-4">
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
  const [now, setNow] = useState(() => new Date());
  const [editor, setEditor] = useState<EditorState | null>(null);
  const tripStorage = useTripStorage();

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const tripDays = useMemo(
    () => mergeTripEdits(baseTripDays, tripStorage.itemEdits, tripStorage.addedItems, tripStorage.deletedItemIds),
    [tripStorage.addedItems, tripStorage.deletedItemIds, tripStorage.itemEdits],
  );
  const reservations = useMemo(() => getReservations(tripDays), [tripDays]);
  const attentionItems = useMemo(() => getAttentionItems(tripDays), [tripDays]);
  const activeState = useMemo(() => getActiveScheduleState(tripDays, tripStorage.statuses, now), [now, tripDays, tripStorage.statuses]);
  const phase = useMemo(() => getTripPhase(now), [now]);
  const countdown = useMemo(() => getDepartureCountdown(now), [now]);

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

  return (
    <div className="min-h-screen bg-[#000000] text-white">
      <div key={activeTab} className="screen-fade mx-auto max-w-4xl pb-20">
        {activeTab === 'today' ? (
          <TodayScreen
            {...activeState}
            statuses={tripStorage.statuses}
            onCycleStatus={tripStorage.cycleStatus}
            onEditItem={openEditItem}
            onViewFullDay={() => setActiveTab('days')}
            attentionItems={attentionItems}
            phase={phase}
            countdown={countdown}
          />
        ) : null}
        {activeTab === 'days' ? (
          <AllDaysScreen
            days={tripDays}
            statuses={tripStorage.statuses}
            onCycleStatus={tripStorage.cycleStatus}
            onEditItem={openEditItem}
            onAddItem={openAddItem}
          />
        ) : null}
        {activeTab === 'attention' ? <AttentionScreen statuses={tripStorage.statuses} attentionItems={attentionItems} onEditItem={openEditItem} /> : null}
        {activeTab === 'reservations' ? (
          <ReservationsScreen statuses={tripStorage.statuses} reservations={reservations} onEditItem={openEditItem} />
        ) : null}
        {activeTab === 'notes' ? <NotesScreen notes={tripStorage.notes} setNote={tripStorage.setNote} days={tripDays} /> : null}
      </div>
      <Tabs activeTab={activeTab} onChange={setActiveTab} />
      {editor ? (
        <ItemEditorSheet
          editor={editor}
          onChange={(draft) => setEditor({ ...editor, draft } as EditorState)}
          onSave={saveEditor}
          onCancel={() => setEditor(null)}
          onDelete={deleteEditorItem}
        />
      ) : null}
    </div>
  );
}
