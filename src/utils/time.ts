import type { Activity, ActiveScheduleState, ItemStatus, TripDay, TripItem } from '../types';
import { tripEndDate, tripStartDate } from '../data/tripData';

const minutesInDay = 24 * 60;
const departureTime = `${tripStartDate}T04:00:00`;

export type TripPhase = 'before' | 'during' | 'after';

export type CountdownParts = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function formatTime(time?: string): string {
  if (!time) return 'Flexible';

  const [hourText, minuteText] = time.split(':');
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, '0')} ${suffix}`;
}

export function formatTimeRange(item: TripItem): string {
  if (item.time && item.endTime) {
    return `${formatTime(item.time)}-${formatTime(item.endTime)}`;
  }

  if (item.time) {
    return formatTime(item.time);
  }

  return 'Flexible';
}

export function formatDateLabel(date: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(new Date(`${date}T12:00:00`));
}

export function minutesNow(date = new Date()): number {
  return date.getHours() * 60 + date.getMinutes();
}

export function getItemStart(item: TripItem): number {
  return item.time ? timeToMinutes(item.time) : Number.MAX_SAFE_INTEGER;
}

export function getItemEnd(item: TripItem): number {
  if (!item.time) return Number.MAX_SAFE_INTEGER;
  if (item.endTime) return timeToMinutes(item.endTime);
  return Math.min(timeToMinutes(item.time) + 15, minutesInDay - 1);
}

export function isItemActive(item: TripItem, currentMinute: number): boolean {
  if (!item.time) return false;
  return currentMinute >= getItemStart(item) && currentMinute <= getItemEnd(item);
}

export function getItemStatusKey(item: TripItem): string {
  return item.id;
}

export function getActivityStatusKey(block: TripItem, activity: Activity): string {
  return `${block.id}:${activity.id}`;
}

export function findNextActivity(block: TripItem, statuses: Record<string, ItemStatus>): Activity | undefined {
  if (!('activities' in block) || !Array.isArray(block.activities)) return undefined;
  return block.activities.find((activity) => statuses[getActivityStatusKey(block, activity)] !== 'done');
}

export function getRelevantDay(days: TripDay[], date = new Date()): { day: TripDay; isToday: boolean } {
  const todayId = date.toLocaleDateString('en-CA');
  const exactDay = days.find((day) => day.date === todayId);

  if (exactDay) {
    return { day: exactDay, isToday: true };
  }

  const upcomingDay = days.find((day) => day.date > todayId);
  return { day: upcomingDay ?? days[days.length - 1], isToday: false };
}

export function getTripPhase(date = new Date()): TripPhase {
  const todayId = date.toLocaleDateString('en-CA');
  const departure = new Date(departureTime);

  if (date.getTime() < departure.getTime()) return 'before';
  if (todayId > tripEndDate) return 'after';
  return 'during';
}

export function getCountdownDays(date = new Date()): number {
  const today = new Date(`${date.toLocaleDateString('en-CA')}T00:00:00`);
  const departure = new Date(`${tripStartDate}T00:00:00`);
  const diff = departure.getTime() - today.getTime();
  return Math.max(0, Math.ceil(diff / 86_400_000));
}

export function getDepartureCountdown(date = new Date()): CountdownParts {
  const departure = new Date(departureTime);
  const diff = Math.max(0, departure.getTime() - date.getTime());
  const totalSeconds = Math.floor(diff / 1000);

  return {
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3_600),
    minutes: Math.floor((totalSeconds % 3_600) / 60),
    seconds: totalSeconds % 60,
  };
}

export function getActiveScheduleState(
  days: TripDay[],
  statuses: Record<string, ItemStatus>,
  date = new Date(),
): ActiveScheduleState {
  const { day, isToday } = getRelevantDay(days, date);
  const currentMinute = isToday ? minutesNow(date) : -1;
  const timedItems = day.items.filter((item) => item.time);
  const activeItem = isToday ? timedItems.find((item) => isItemActive(item, currentMinute)) : undefined;
  const nextItem = timedItems.find((item) => getItemStart(item) > currentMinute);
  const upcomingItems = timedItems.filter((item) => getItemStart(item) > currentMinute).slice(0, 4);
  const nextActivity = activeItem ? findNextActivity(activeItem, statuses) : undefined;

  return {
    day,
    activeItem,
    nextItem,
    nextActivity,
    upcomingItems,
    isToday,
  };
}
