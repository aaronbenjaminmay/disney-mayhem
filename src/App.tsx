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
  if (status === 'done') return 'border-emerald-300/70 bg-emerald-300/12';
  if (status === 'skipped') return 'border-amber-300/70 bg-amber-300/12';
  return 'border-white/10 bg-white/6';
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
  attentionItems,
  phase,
  countdown,
}: ReturnType<typeof getActiveScheduleState> & {
  statuses: Record<string, ItemStatus>;
  onCycleStatus: (id: string) => void;
  onEditItem: (dayId: string, item: TripItem) => void;
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

        <section aria-labelledby="countdown-heading" className="px-4">
          <div className="countdown-pulse rounded-[2rem] border border-lime-300/35 bg-lime-300/12 p-5 text-center shadow-2xl shadow-lime-950/20">
            <p className="text-sm font-black uppercase tracking-wide text-lime-100">Disney Mayhem begins in... 🎢✨</p>
            <h2 id="countdown-heading" className="sr-only">
              Live countdown to Disney Mayhem departure
            </h2>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-live="polite" aria-label="Live countdown to departure">
              {countdownUnits.map((unit) => (
                <div key={unit.label} className="rounded-[1.4rem] border border-white/14 bg-black/24 px-3 py-4">
                  <div className="tabular-nums text-4xl font-black leading-none text-cyan-200 sm:text-5xl">
                    {String(unit.value).padStart(2, '0')}
                  </div>
                  <div className="mt-2 text-xs font-black uppercase tracking-wide text-white">{unit.label}</div>
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-[1.4rem] bg-black/24 px-4 py-4">
              <p className="text-sm font-black uppercase tracking-wide text-fuchsia-100">Trip title</p>
              <p className="mt-1 text-2xl font-black text-white">{day.label}</p>
              <p className="mt-2 text-base font-bold text-lime-100">Starting park: EPCOT</p>
            </div>
            {nextItem ? (
              <p className="mt-4 rounded-full bg-cyan-300 px-4 py-3 text-base font-black text-slate-950">
                First up: {formatTimeRange(nextItem)} · {nextItem.title}
              </p>
            ) : null}
          </div>
        </section>

        <section aria-labelledby="prep-heading" className="mt-5 px-4 pb-6">
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

        <section aria-labelledby="memory-heading" className="px-4 pb-6">
          <div className="rounded-[2rem] border border-fuchsia-300/35 bg-fuchsia-300/12 p-5">
            <p className="text-sm font-black uppercase tracking-wide text-fuchsia-100">Memory view</p>
            <h2 id="memory-heading" className="mt-3 text-2xl font-black text-white">
              {formatDateLabel(tripStartDate)} through {formatDateLabel(tripEndDate)}
            </h2>
            <p className="mt-2 text-base leading-7 text-slate-100">
              Review the finished timeline, keep notes, and mark favorite moments as done.
            </p>
          </div>
        </section>
      </>
    );
  }

  const nowItem = activeItem;
  const laterItems = upcomingItems.filter((item) => item.id !== nextItem?.id).slice(0, 3);

  return (
    <>
      <ScreenHeader eyebrow={isToday ? 'Right now' : 'Trip preview'} title="Disney Mayhem">
        <p>
          {formatDateLabel(day.date)} · {day.park}
        </p>
      </ScreenHeader>

      <section aria-labelledby="now-heading" className="px-4">
        <div className="rounded-[2.2rem] border border-fuchsia-300/40 bg-fuchsia-300/14 p-6 text-center shadow-2xl shadow-fuchsia-950/30">
          <p className="text-sm font-black uppercase tracking-wide text-fuchsia-100">Now</p>
          <h2 id="now-heading" className="mt-3 text-3xl font-black leading-tight text-white sm:text-4xl">
            {nowItem ? nowItem.title : 'Open time'}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-lg font-bold leading-7 text-slate-100">
            {nowItem
              ? nowItem.type === 'flexible'
                ? `${nowItem.area} · ${formatTimeRange(nowItem)}`
                : `${nowItem.location} · ${formatTimeRange(nowItem)}`
              : 'No fixed item is active. Breathe, hydrate, and use Next when ready.'}
          </p>

          {nextActivity ? (
            <div className="mx-auto mt-5 max-w-md rounded-full bg-lime-300 px-5 py-3 text-base font-black text-slate-950">
              Next: {nextActivity.title}
            </div>
          ) : null}

          {nowItem ? (
            <button
              type="button"
              onClick={() => onEditItem(day.id, nowItem)}
              className="mt-5 min-h-11 rounded-full border border-white/20 bg-white/8 px-4 py-2 text-sm font-black text-white focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-cyan-200"
            >
              Edit
            </button>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="next-heading" className="mt-8 px-4">
        <h2 id="next-heading" className="mb-3 text-sm font-black uppercase tracking-wide text-cyan-100">
          Next
        </h2>
        {nextItem && nextItem.id !== activeItem?.id ? (
          <div className="rounded-[1.7rem] border border-cyan-300/30 bg-cyan-300/10 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-black uppercase tracking-wide text-cyan-100">{formatTimeRange(nextItem)}</p>
                <h3 className="mt-1 text-2xl font-black text-white">{nextItem.title}</h3>
                <p className="mt-1 text-sm font-semibold text-slate-300">{nextItem.type === 'flexible' ? nextItem.area : nextItem.location}</p>
              </div>
              <button
                type="button"
                onClick={() => onEditItem(day.id, nextItem)}
                className="min-h-11 min-w-11 rounded-full border border-white/20 bg-white/8 px-3 text-lg font-black text-white focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-cyan-200"
                aria-label={`Edit ${nextItem.title}`}
                title="Edit"
              >
                ✎
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-[1.7rem] border border-white/10 bg-white/8 p-4 text-slate-200">Nothing queued up yet.</div>
        )}
      </section>

      <section aria-labelledby="later-heading" className="mt-8 px-4 pb-6">
        <h2 id="later-heading" className="mb-3 text-sm font-black uppercase tracking-wide text-slate-300">
          Later
        </h2>
        <div className="space-y-2">
          {laterItems.map((item) => (
            <CompactItem key={item.id} item={item} statuses={statuses} onEdit={() => onEditItem(day.id, item)} />
          ))}
          {laterItems.length === 0 ? <p className="rounded-[1.4rem] border border-white/10 bg-white/6 p-4 text-slate-300">No later items for this day.</p> : null}
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
    <article className={`rounded-[1.4rem] border p-4 ${item.type === 'flexible' ? 'border-cyan-300/30 bg-cyan-300/10' : statusClass(status)}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black uppercase tracking-wide text-lime-200">{eyebrow ?? formatTimeRange(item)}</p>
          <h3 className="mt-1 text-lg font-black text-white">{item.title}</h3>
        </div>
        {onEdit ? (
          <button
            type="button"
            onClick={onEdit}
            className="min-h-11 min-w-11 rounded-full border border-white/20 bg-white/8 px-3 text-lg font-black text-white focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-cyan-200"
            aria-label={`Edit ${item.title}`}
            title="Edit"
          >
            ✎
          </button>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-slate-300">{item.type === 'flexible' ? item.area : item.location}</p>
      {nextActivity ? <p className="mt-2 text-sm font-bold text-fuchsia-100">Next: {nextActivity.title}</p> : null}
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
      <main className="space-y-3 px-4 pb-6">
        {attentionItems.map(({ day, item }) => (
          <article key={item.id} className={`rounded-[1.6rem] border border-amber-300/40 bg-amber-300/12 p-4 ${statusClass(statuses[item.id])}`}>
            <p className="text-sm font-black uppercase tracking-wide text-amber-100">{formatDateLabel(day.date)}</p>
            <div className="mt-1 flex items-start justify-between gap-3">
              <h2 className="text-xl font-black text-white">{item.title}</h2>
              <button
                type="button"
                onClick={() => onEditItem(day.id, item)}
                className="min-h-11 min-w-11 rounded-full border border-white/20 bg-white/8 px-3 text-lg font-black text-white focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-cyan-200"
                aria-label={`Edit ${item.title}`}
                title="Edit"
              >
                ✎
              </button>
            </div>
            <p className="mt-1 font-semibold text-slate-200">{formatTimeRange(item)}</p>
            <p className="mt-1 text-sm text-slate-300">{item.type === 'flexible' ? item.area : item.location}</p>
            {item.notes ? <p className="mt-3 rounded-2xl bg-black/20 p-3 text-sm font-bold text-amber-50">{item.notes}</p> : null}
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
        className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-[2rem] border border-white/14 bg-slate-950 p-5 shadow-2xl shadow-black"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-black uppercase tracking-wide text-cyan-200">{editor.mode === 'add' ? 'Add itinerary item' : 'Edit itinerary item'}</p>
            <h2 id="item-editor-title" className="mt-1 text-2xl font-black text-white">
              {editor.mode === 'add' ? 'New item' : draft.title || 'Untitled item'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 min-w-11 rounded-full border border-white/20 bg-white/8 text-xl font-black text-white focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-cyan-200"
            aria-label="Close editor"
          >
            ×
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="text-sm font-black uppercase tracking-wide text-slate-200">Type</span>
            <select
              value={draft.type}
              onChange={(event) => onChange({ ...draft, type: event.target.value as TripItem['type'] })}
              className="mt-2 min-h-12 w-full rounded-2xl border border-white/14 bg-black/30 px-4 text-lg font-bold text-white outline-none focus:border-cyan-200 focus:ring-4 focus:ring-cyan-200/30"
            >
              <option value="scheduled">Scheduled</option>
              <option value="flexible">Flexible</option>
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-black uppercase tracking-wide text-slate-200">Time</span>
            <input
              type="time"
              value={draft.time ?? ''}
              onChange={(event) => onChange({ ...draft, time: event.target.value })}
              className="mt-2 min-h-12 w-full rounded-2xl border border-white/14 bg-black/30 px-4 text-lg font-bold text-white outline-none focus:border-cyan-200 focus:ring-4 focus:ring-cyan-200/30"
            />
          </label>

          <label className="block">
            <span className="text-sm font-black uppercase tracking-wide text-slate-200">Title</span>
            <input
              value={draft.title}
              onChange={(event) => onChange({ ...draft, title: event.target.value })}
              className="mt-2 min-h-12 w-full rounded-2xl border border-white/14 bg-black/30 px-4 text-lg font-bold text-white outline-none focus:border-cyan-200 focus:ring-4 focus:ring-cyan-200/30"
            />
          </label>

          <label className="block">
            <span className="text-sm font-black uppercase tracking-wide text-slate-200">Location</span>
            <input
              value={draft.location}
              onChange={(event) => onChange({ ...draft, location: event.target.value })}
              className="mt-2 min-h-12 w-full rounded-2xl border border-white/14 bg-black/30 px-4 text-lg font-bold text-white outline-none focus:border-cyan-200 focus:ring-4 focus:ring-cyan-200/30"
            />
          </label>

          <label className="block">
            <span className="text-sm font-black uppercase tracking-wide text-slate-200">Notes</span>
            <textarea
              value={draft.notes ?? ''}
              onChange={(event) => onChange({ ...draft, notes: event.target.value })}
              className="mt-2 min-h-28 w-full rounded-2xl border border-white/14 bg-black/30 px-4 py-3 text-lg font-bold text-white outline-none focus:border-cyan-200 focus:ring-4 focus:ring-cyan-200/30"
            />
          </label>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-between">
          {editor.mode === 'edit' ? (
            <button
              type="button"
              onClick={onDelete}
              className="min-h-12 rounded-full border border-rose-300/60 bg-rose-300/15 px-5 py-2 font-black text-rose-100 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-rose-200"
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
              className="min-h-12 rounded-full border border-white/20 bg-white/8 px-5 py-2 font-black text-white focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-cyan-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSave}
              className="min-h-12 rounded-full bg-lime-300 px-5 py-2 font-black text-slate-950 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-lime-100"
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
    <section aria-labelledby={`${day.id}-heading`} className="px-4 py-4">
      <div className="mb-3">
        <p className="text-sm font-black uppercase tracking-wide text-fuchsia-200">{formatDateLabel(day.date)}</p>
        <h2 id={`${day.id}-heading`} className="text-2xl font-black text-white">
          {day.label}
        </h2>
        <p className="text-sm font-semibold text-slate-300">{day.park}</p>
      </div>
      <button
        type="button"
        onClick={() => onAddItem(day.id)}
        className="mb-3 min-h-11 rounded-full bg-cyan-300 px-4 py-2 text-sm font-black text-slate-950 transition hover:bg-cyan-200 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-cyan-200"
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
      <main className="space-y-3 px-4 pb-6">
        {reservations.map(({ day, item }) => (
          <article key={item.id} className={`rounded-[1.6rem] border p-4 ${statusClass(statuses[item.id])}`}>
            <p className="text-sm font-black uppercase tracking-wide text-lime-200">{formatDateLabel(day.date)}</p>
            <div className="mt-1 flex items-start justify-between gap-3">
              <h2 className="text-xl font-black text-white">{item.title}</h2>
              <button
                type="button"
                onClick={() => onEditItem(day.id, item)}
                className="min-h-11 min-w-11 rounded-full border border-white/20 bg-white/8 px-3 text-lg font-black text-white focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-cyan-200"
                aria-label={`Edit ${item.title}`}
                title="Edit"
              >
                ✎
              </button>
            </div>
            <p className="mt-1 font-semibold text-slate-200">{formatTimeRange(item)}</p>
            <p className="mt-1 text-sm text-slate-300">{item.location}</p>
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
      <main className="space-y-4 px-4 pb-6">
        {days.map((day) => (
          <label key={day.id} className="block rounded-[1.6rem] border border-white/10 bg-white/8 p-4">
            <span className="block text-lg font-black text-white">{day.label}</span>
            <span className="mt-1 block text-sm text-slate-300">{formatDateLabel(day.date)}</span>
            <textarea
              value={notes[day.id] ?? ''}
              onChange={(event) => setNote(day.id, event.target.value)}
              className="mt-3 min-h-28 w-full rounded-3xl border border-white/14 bg-slate-950 px-4 py-3 text-base text-white outline-none focus:border-cyan-200 focus:ring-4 focus:ring-cyan-200/30"
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
    <div className="min-h-screen bg-[#070816] text-white">
      <div className="mx-auto max-w-4xl pb-20">
        {activeTab === 'today' ? (
          <TodayScreen
            {...activeState}
            statuses={tripStorage.statuses}
            onCycleStatus={tripStorage.cycleStatus}
            onEditItem={openEditItem}
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
