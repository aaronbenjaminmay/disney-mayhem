import { useEffect, useMemo, useState } from 'react';
import { ItemCard } from './components/ItemCard';
import { ScreenHeader } from './components/ScreenHeader';
import { AppTab, Tabs } from './components/Tabs';
import { attentionItems, packingItems, reservations, tripDays, tripEndDate, tripStartDate } from './data/tripData';
import { useTripStorage } from './hooks/useTripStorage';
import type { ItemStatus, TripDay, TripItem } from './types';
import {
  findNextActivity,
  formatDateLabel,
  formatTimeRange,
  getActiveScheduleState,
  getCountdownDays,
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
  phase,
  countdownDays,
}: ReturnType<typeof getActiveScheduleState> & {
  statuses: Record<string, ItemStatus>;
  onCycleStatus: (id: string) => void;
  phase: ReturnType<typeof getTripPhase>;
  countdownDays: number;
}) {
  if (phase === 'before') {
    return (
      <>
        <ScreenHeader eyebrow="Countdown" title="Disney Mayhem">
          <p>
            Departure is {countdownDays} {countdownDays === 1 ? 'day' : 'days'} away. Trip starts {formatDateLabel(tripStartDate)}.
          </p>
        </ScreenHeader>

        <section aria-labelledby="countdown-heading" className="px-4">
          <div className="rounded-[2rem] border border-lime-300/35 bg-lime-300/12 p-5 shadow-2xl shadow-lime-950/20">
            <p className="text-sm font-black uppercase tracking-wide text-lime-100">First trip day</p>
            <h2 id="countdown-heading" className="mt-3 text-3xl font-black text-white">
              {day.label}
            </h2>
            <p className="mt-2 text-base leading-7 text-slate-100">
              {formatDateLabel(day.date)} · {day.location}
            </p>
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
              <CompactItem key={item.id} item={item} statuses={statuses} eyebrow={formatDateLabel(attentionDay.date)} />
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

  return (
    <>
      <ScreenHeader eyebrow={isToday ? 'Right now' : 'Trip preview'} title="Disney Mayhem">
        <p>
          {formatDateLabel(day.date)} · {day.park}
        </p>
      </ScreenHeader>

      <section aria-labelledby="now-heading" className="px-4">
        <div className="rounded-[2rem] border border-fuchsia-300/35 bg-fuchsia-300/12 p-5 shadow-2xl shadow-fuchsia-950/30">
          <p className="text-sm font-black uppercase tracking-wide text-fuchsia-100">{day.location}</p>
          <h2 id="now-heading" className="mt-3 text-2xl font-black text-white">
            {activeItem ? `Now: ${activeItem.title}` : isToday ? 'Now: Open time' : 'First up'}
          </h2>
          <p className="mt-2 text-base leading-7 text-slate-100">
            {activeItem
              ? activeItem.type === 'flexible'
                ? `${activeItem.area} · ${formatTimeRange(activeItem)}`
                : `${activeItem.location} · ${formatTimeRange(activeItem)}`
              : isToday
                ? 'No fixed item is active. Use the next card to bridge the gap calmly.'
                : 'This is the next trip day in the real itinerary.'}
          </p>

          {nextActivity ? (
            <div className="mt-4 rounded-full bg-lime-300 px-4 py-3 text-base font-black text-slate-950">
              Next: {nextActivity.title}
            </div>
          ) : null}

          {nextItem ? (
            <p className="mt-4 text-sm font-bold text-cyan-100">
              Next event: {formatTimeRange(nextItem)} · {nextItem.title}
            </p>
          ) : (
            <p className="mt-4 text-sm font-bold text-cyan-100">Nothing else scheduled after this.</p>
          )}
        </div>
      </section>

      <section aria-labelledby="active-heading" className="mt-5 px-4">
        <h2 id="active-heading" className="mb-3 text-lg font-black text-white">
          Active Details
        </h2>
        {activeItem ? (
          <ItemCard item={activeItem} statuses={statuses} onCycleStatus={onCycleStatus} />
        ) : nextItem ? (
          <ItemCard item={nextItem} statuses={statuses} onCycleStatus={onCycleStatus} compact />
        ) : (
          <div className="rounded-[1.6rem] border border-white/10 bg-white/8 p-4 text-slate-200">You made it through the plan.</div>
        )}
      </section>

      <section aria-labelledby="remaining-heading" className="mt-5 px-4 pb-6">
        <h2 id="remaining-heading" className="mb-3 text-lg font-black text-white">
          Key Remaining
        </h2>
        <div className="space-y-3">
          {upcomingItems.map((item) => (
            <CompactItem key={item.id} item={item} statuses={statuses} />
          ))}
        </div>
      </section>
    </>
  );
}

function CompactItem({ item, statuses, eyebrow }: { item: TripItem; statuses: Record<string, ItemStatus>; eyebrow?: string }) {
  const status = statuses[getItemStatusKey(item)];
  const nextActivity = findNextActivity(item, statuses);

  return (
    <article className={`rounded-[1.4rem] border p-4 ${item.type === 'flexible' ? 'border-cyan-300/30 bg-cyan-300/10' : statusClass(status)}`}>
      <p className="text-sm font-black uppercase tracking-wide text-lime-200">{eyebrow ?? formatTimeRange(item)}</p>
      <h3 className="mt-1 text-lg font-black text-white">{item.title}</h3>
      <p className="mt-1 text-sm text-slate-300">{item.type === 'flexible' ? item.area : item.location}</p>
      {nextActivity ? <p className="mt-2 text-sm font-bold text-fuchsia-100">Next: {nextActivity.title}</p> : null}
    </article>
  );
}

function AttentionScreen({ statuses }: { statuses: Record<string, ItemStatus> }) {
  return (
    <>
      <ScreenHeader eyebrow="Needs decisions" title="Attention Needed">
        Reservations, multi-pass details, queue links, and open meal choices from the source itinerary.
      </ScreenHeader>
      <main className="space-y-3 px-4 pb-6">
        {attentionItems.map(({ day, item }) => (
          <article key={item.id} className={`rounded-[1.6rem] border border-amber-300/40 bg-amber-300/12 p-4 ${statusClass(statuses[item.id])}`}>
            <p className="text-sm font-black uppercase tracking-wide text-amber-100">{formatDateLabel(day.date)}</p>
            <h2 className="mt-1 text-xl font-black text-white">{item.title}</h2>
            <p className="mt-1 font-semibold text-slate-200">{formatTimeRange(item)}</p>
            <p className="mt-1 text-sm text-slate-300">{item.type === 'flexible' ? item.area : item.location}</p>
            {item.notes ? <p className="mt-3 rounded-2xl bg-black/20 p-3 text-sm font-bold text-amber-50">{item.notes}</p> : null}
          </article>
        ))}
      </main>
    </>
  );
}

function DayTimeline({
  day,
  statuses,
  onCycleStatus,
}: {
  day: TripDay;
  statuses: Record<string, ItemStatus>;
  onCycleStatus: (id: string) => void;
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
      <div className="space-y-3">
        {day.items.map((item) => (
          <ItemCard key={item.id} item={item} statuses={statuses} onCycleStatus={onCycleStatus} />
        ))}
      </div>
    </section>
  );
}

function AllDaysScreen({
  statuses,
  onCycleStatus,
}: {
  statuses: Record<string, ItemStatus>;
  onCycleStatus: (id: string) => void;
}) {
  return (
    <>
      <ScreenHeader eyebrow="Timeline" title="All Days">
        Fixed reservations and transport stay timed. Ride groups stay flexible and grouped.
      </ScreenHeader>
      {tripDays.map((day) => (
        <DayTimeline key={day.id} day={day} statuses={statuses} onCycleStatus={onCycleStatus} />
      ))}
    </>
  );
}

function ReservationsScreen({ statuses }: { statuses: Record<string, ItemStatus> }) {
  return (
    <>
      <ScreenHeader eyebrow="Fixed plans" title="Reservations" />
      <main className="space-y-3 px-4 pb-6">
        {reservations.map(({ day, item }) => (
          <article key={item.id} className={`rounded-[1.6rem] border p-4 ${statusClass(statuses[item.id])}`}>
            <p className="text-sm font-black uppercase tracking-wide text-lime-200">{formatDateLabel(day.date)}</p>
            <h2 className="mt-1 text-xl font-black text-white">{item.title}</h2>
            <p className="mt-1 font-semibold text-slate-200">{formatTimeRange(item)}</p>
            <p className="mt-1 text-sm text-slate-300">{item.location}</p>
          </article>
        ))}
      </main>
    </>
  );
}

function PackingScreen({
  statuses,
  onCycleStatus,
}: {
  statuses: Record<string, ItemStatus>;
  onCycleStatus: (id: string) => void;
}) {
  return (
    <>
      <ScreenHeader eyebrow="Before you go" title="Packing" />
      <main className="space-y-2 px-4 pb-6">
        {packingItems.map((item) => {
          const id = `packing:${item}`;
          return (
            <div key={item} className="flex items-center justify-between gap-3 rounded-[1.3rem] border border-white/10 bg-white/8 p-3">
              <span className="font-bold text-white">{item}</span>
              <button
                type="button"
                onClick={() => onCycleStatus(id)}
                className={`min-h-11 rounded-full px-4 py-2 text-sm font-black focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-cyan-200 ${
                  statuses[id] === 'done' ? 'bg-emerald-300 text-slate-950' : 'bg-white/10 text-white'
                }`}
              >
                {statuses[id] === 'done' ? 'Packed' : 'Pack'}
              </button>
            </div>
          );
        })}
      </main>
    </>
  );
}

function NotesScreen({
  notes,
  setNote,
}: {
  notes: Record<string, string>;
  setNote: (id: string, note: string) => void;
}) {
  return (
    <>
      <ScreenHeader eyebrow="Family notes" title="Notes">
        Saved on this device for quick reminders.
      </ScreenHeader>
      <main className="space-y-4 px-4 pb-6">
        {tripDays.map((day) => (
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
  const tripStorage = useTripStorage();

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const activeState = useMemo(() => getActiveScheduleState(tripDays, tripStorage.statuses, now), [now, tripStorage.statuses]);
  const phase = useMemo(() => getTripPhase(now), [now]);
  const countdownDays = useMemo(() => getCountdownDays(now), [now]);

  return (
    <div className="min-h-screen bg-[#070816] text-white">
      <div className="mx-auto max-w-4xl pb-20">
        {activeTab === 'today' ? (
          <TodayScreen
            {...activeState}
            statuses={tripStorage.statuses}
            onCycleStatus={tripStorage.cycleStatus}
            phase={phase}
            countdownDays={countdownDays}
          />
        ) : null}
        {activeTab === 'days' ? <AllDaysScreen statuses={tripStorage.statuses} onCycleStatus={tripStorage.cycleStatus} /> : null}
        {activeTab === 'attention' ? <AttentionScreen statuses={tripStorage.statuses} /> : null}
        {activeTab === 'reservations' ? <ReservationsScreen statuses={tripStorage.statuses} /> : null}
        {activeTab === 'packing' ? <PackingScreen statuses={tripStorage.statuses} onCycleStatus={tripStorage.cycleStatus} /> : null}
        {activeTab === 'notes' ? <NotesScreen notes={tripStorage.notes} setNote={tripStorage.setNote} /> : null}
      </div>
      <Tabs activeTab={activeTab} onChange={setActiveTab} />
    </div>
  );
}
