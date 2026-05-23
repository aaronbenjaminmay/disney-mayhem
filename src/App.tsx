import { useEffect, useMemo, useRef, useState } from 'react';
import { ItemCard } from './components/ItemCard';
import { LucideIcon, type LucideIconName } from './components/LucideIcon';
import { ScreenHeader } from './components/ScreenHeader';
import { StatusButton } from './components/StatusButton';
import { AppTab, Tabs } from './components/Tabs';
import { tripDays as baseTripDays, tripEndDate, tripStartDate } from './data/tripData';
import { useTripStorage } from './hooks/useTripStorage';
import type { Activity, EditableActivityFields, EditableItemFields, ItemPlacement, ItemStatus, LandBlock, LandGroupOrder, ParkName, ReservationDayCard, TripDay, TripItem } from './types';
import {
  createActivityFromFields,
  createItemFromFields,
  getAttentionItems,
  getReservations,
  isReservationItem,
  mergeTripEdits,
  toEditableActivityFields,
  toEditableFields,
} from './utils/itineraryEdits';
import { getActivityLand, getLandDisplayName, getLandGroupId, isDifferentKnownParkLand } from './utils/landBlocks';
import {
  findNextActivity,
  formatDateLabel,
  formatTime,
  formatTimeRange,
  getActiveScheduleState,
  getActivityStatusKey,
  getDepartureCountdown,
  getItemStatusKey,
  getItemStart,
  getTripPhase,
} from './utils/time';

type TimelineActivityBlock = TripItem & {
  activities: Activity[];
  area?: string;
};

const warnedUnknownStatusIds = new Set<string>();
const warnedLandGroupMismatchIds = new Set<string>();

function normalizeDisplayText(value?: string): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function isDuplicateDisplayText(primary?: string, secondary?: string): boolean {
  const normalizedPrimary = normalizeDisplayText(primary);
  const normalizedSecondary = normalizeDisplayText(secondary);
  return Boolean(normalizedPrimary && normalizedSecondary && normalizedPrimary === normalizedSecondary);
}

function shouldShowSecondaryText(primary?: string, secondary?: string): boolean {
  return Boolean((secondary ?? '').trim()) && !isDuplicateDisplayText(primary, secondary);
}

function hasTimelineActivityBlock(item: TripItem): item is TimelineActivityBlock {
  return 'activities' in item && Array.isArray(item.activities);
}

function getKnownStatusIds(days: TripDay[]): Set<string> {
  const ids = new Set<string>();

  days.forEach((day) => {
    day.items.forEach((item) => {
      ids.add(getItemStatusKey(item));
      if (hasTimelineActivityBlock(item)) {
        item.activities.forEach((activity) => ids.add(getActivityStatusKey(item, activity)));
      }
    });
  });

  return ids;
}

function warnUnknownStatusReferences(days: TripDay[], statuses: Record<string, ItemStatus>) {
  const knownStatusIds = getKnownStatusIds(days);

  Object.keys(statuses).forEach((statusId) => {
    if (knownStatusIds.has(statusId) || warnedUnknownStatusIds.has(statusId)) return;

    warnedUnknownStatusIds.add(statusId);
    console.warn('Disney Mayhem persistence warning: saved status references an unknown itinerary ID', {
      kind: 'status',
      id: statusId,
    });
  });
}

function getItemDisplayLocation(item: TripItem): string {
  if (hasTimelineActivityBlock(item)) return item.area || item.location;
  return item.location;
}

function itemNeedsAttention(item: TripItem) {
  const text = `${item.title} ${item.location} ${item.notes ?? ''}`.toLowerCase();
  return Boolean(item.needsAttention) || text.includes('need reservation') || text.includes('insert multi-pass') || text.includes('add queue link');
}

function getActiveLandBlock(day: TripDay, activeItem: TripItem | undefined, statuses: Record<string, ItemStatus>): LandBlock | undefined {
  if (!activeItem || !hasTimelineActivityBlock(activeItem)) return undefined;

  const activity = findNextActivity(activeItem, statuses) ?? activeItem.activities[0];
  if (!activity) return day.landBlocks?.find((block) => block.sourceItemIds.includes(activeItem.id));

  const land = getActivityLand(day.park, activeItem, activity);
  const groupPrefix = `${getLandGroupId(day.id, activeItem.id, '').replace(/__land$/, '')}__`;
  const inferredGroupId = getLandGroupId(day.id, activeItem.id, land);
  const groupId = activity.landGroupId?.startsWith(groupPrefix) && activity.landGroupId === inferredGroupId ? activity.landGroupId : inferredGroupId;
  return day.landBlocks?.find((block) => block.id === groupId);
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

function getItemConfirmationNumber(item: TripItem): string | undefined {
  return 'confirmationNumber' in item ? item.confirmationNumber : undefined;
}

function makeReservationDay(date: string, card?: ReservationDayCard): TripDay {
  return {
    id: `reservation-day-${date}`,
    date,
    label: card?.title?.trim() || formatDateLabel(date),
    park: 'Travel Day',
    location: '',
    notes: card?.notes,
    items: [],
  };
}

function groupReservationsByDay(reservations: ReturnType<typeof getReservations>, dayCards: Record<string, ReservationDayCard>) {
  const groups: { day: TripDay; items: TripItem[]; card?: ReservationDayCard }[] = [];

  reservations.forEach(({ day, item }) => {
    const existing = groups.find((group) => group.day.id === day.id);
    if (existing) {
      existing.items.push(item);
      return;
    }

    groups.push({ day, items: [item] });
  });

  Object.values(dayCards).forEach((card) => {
    const existing = groups.find((group) => group.day.date === card.date);
    if (existing) {
      existing.card = card;
      existing.day = {
        ...existing.day,
        label: card.title?.trim() || existing.day.label,
        notes: card.notes?.trim() || existing.day.notes,
      };
      return;
    }

    groups.push({ day: makeReservationDay(card.date, card), items: [], card });
  });

  return groups
    .sort((left, right) => left.day.date.localeCompare(right.day.date))
    .map((group) => ({
      ...group,
      items: [...group.items].sort((left, right) => getItemStart(left) - getItemStart(right)),
    }));
}

function getReservationGroupTitle(day: TripDay, card?: ReservationDayCard): string {
  const cardTitle = card?.title?.trim();
  if (cardTitle && normalizeDisplayText(cardTitle) !== 'travel day') return cardTitle;
  if (day.id.startsWith('reservation-day-')) return formatDateLabel(day.date);
  if (day.label.trim()) return day.label;
  return formatDateLabel(day.date);
}

function formatDashboardDateLabel(date: string): string {
  const parsedDate = new Date(`${date}T12:00:00`);
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(parsedDate).toUpperCase();
  const month = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(parsedDate).toUpperCase();
  const day = new Intl.DateTimeFormat('en-US', { day: 'numeric' }).format(parsedDate);
  return `${weekday}, ${month} ${day}`;
}

function addMinutesToTime(time: string, minutesToAdd: number): string {
  const [hours, minutes] = time.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes + minutesToAdd;
  const nextHours = Math.floor(totalMinutes / 60) % 24;
  const nextMinutes = totalMinutes % 60;
  return `${String(nextHours).padStart(2, '0')}:${String(nextMinutes).padStart(2, '0')}`;
}

const lightningLaneDurationOptions = [30, 60, 90, 120];

type TimelineLandGroup = {
  groupId: string;
  land: string;
  activities: Activity[];
};

function getLandGroupOrderValue(groupId: string, index: number, landGroupOrders: Record<string, LandGroupOrder> = {}): number {
  return landGroupOrders[groupId]?.displayOrder ?? index * 1000;
}

function sortTimelineLandGroups(groups: TimelineLandGroup[], landGroupOrders: Record<string, LandGroupOrder> = {}): TimelineLandGroup[] {
  return [...groups].sort((left, right) => {
    const leftIndex = groups.findIndex((group) => group.groupId === left.groupId);
    const rightIndex = groups.findIndex((group) => group.groupId === right.groupId);
    return getLandGroupOrderValue(left.groupId, leftIndex, landGroupOrders) - getLandGroupOrderValue(right.groupId, rightIndex, landGroupOrders) || leftIndex - rightIndex;
  });
}

function groupActivitiesByLand(day: TripDay, item: TimelineActivityBlock, landGroupOrders: Record<string, LandGroupOrder> = {}): TimelineLandGroup[] {
  const groups: TimelineLandGroup[] = [];
  const groupPrefix = `${getLandGroupId(day.id, item.id, '').replace(/__land$/, '')}__`;

  item.activities.forEach((activity) => {
    const hasStableGroup = activity.landGroupId?.startsWith(groupPrefix);
    const inferredLand = getActivityLand(day.park, item, activity);
    const inferredGroupId = getLandGroupId(day.id, item.id, inferredLand);
    const hasConflictingStableGroup = Boolean(hasStableGroup && activity.landGroupId && activity.landGroupId !== inferredGroupId && isDifferentKnownParkLand(day.park, inferredLand, activity.location));
    const land = hasStableGroup && !hasConflictingStableGroup ? getLandDisplayName(day.park, inferredLand, activity.location) : inferredLand;
    const groupId = hasStableGroup && activity.landGroupId && !hasConflictingStableGroup ? activity.landGroupId : inferredGroupId;
    const existing = groups.find((group) => group.groupId === groupId);

    if (hasConflictingStableGroup && !warnedLandGroupMismatchIds.has(activity.id)) {
      warnedLandGroupMismatchIds.add(activity.id);
      console.warn('Disney Mayhem persistence warning: land card group mismatch ignored', {
        activityId: activity.id,
        savedGroupId: activity.landGroupId,
        inferredGroupId,
      });
    }

    if (existing) {
      existing.activities.push(activity);
      return;
    }

    groups.push({ groupId, land, activities: [activity] });
  });

  if (groups.length === 0) {
    const land = item.area || item.location;
    groups.push({ groupId: getLandGroupId(day.id, item.id, land), land, activities: [] });
  }

  return sortTimelineLandGroups(groups, landGroupOrders);
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
  const showSubtitle = shouldShowSecondaryText(title, subtitle);
  const accessibleLabel = showSubtitle ? `${title}. ${subtitle}` : title;

  return (
    <button
      type="button"
      onClick={onClick}
      className="glass-surface min-h-28 rounded-[1.35rem] px-4 py-4 text-left transition hover:border-white/15 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#0A84FF]"
      aria-label={accessibleLabel}
    >
      <span className="flex items-center gap-3">
        <LucideIcon name={icon} size={24} className="shrink-0 text-[#A1A1A6]" />
        <span>
          <span className="block text-[17px] font-black leading-tight text-white">{title}</span>
          {showSubtitle ? <span className="mt-1 block text-[13px] font-semibold leading-snug text-[#A1A1A6]">{subtitle}</span> : null}
        </span>
      </span>
    </button>
  );
}

type WeatherIntel =
  | {
      status: 'loading';
    }
  | {
      status: 'error';
    }
  | {
      status: 'ready';
      currentTemp?: number;
      highTemp?: number;
      rainChance?: number;
      stormChance?: number;
    };

type ParkActivityLevel = 'Low' | 'Moderate' | 'Heavy' | 'Mayhem';

type ParkActivityIntel =
  | {
      status: 'not-applicable';
    }
  | {
      status: 'loading';
    }
  | {
      status: 'unavailable';
    }
  | {
      status: 'error';
    }
  | {
      status: 'ready';
      level: ParkActivityLevel;
      averageWait: number;
      activeRideCount: number;
      downRideCount: number;
    };

type ThemeParksEntity = {
  id?: string;
  name?: string;
  entityType?: string;
};

type ThemeParksLiveEntry = {
  id?: string;
  name?: string;
  entityType?: string;
  status?: string;
  queue?: {
    STANDBY?: {
      waitTime?: number | null;
    };
  };
};

let parkActivityCache:
  | {
      expiresAt: number;
      data: Partial<Record<ParkName, ParkActivityIntel>>;
    }
  | undefined;

const openMeteoUrl =
  'https://api.open-meteo.com/v1/forecast?latitude=28.3772&longitude=-81.5707&current=temperature_2m,precipitation,weather_code&hourly=temperature_2m,precipitation_probability,weather_code&daily=temperature_2m_max,precipitation_probability_max,weather_code&temperature_unit=fahrenheit&timezone=America%2FNew_York&forecast_days=16';

const themeParksDestinationId = 'e957da41-3552-4cf6-b636-5babc5cbc4e5';
const themeParksCacheMs = 10 * 60 * 1000;

function hasStormCode(code: unknown): boolean {
  return typeof code === 'number' && code >= 95 && code <= 99;
}

function isMeaningfulRideActivity(item: TimelineActivityBlock, activity: Activity): boolean {
  const title = activity.title.trim();
  if (!title) return false;

  const activityText = `${title} ${activity.location} ${activity.notes ?? ''}`.toLowerCase();
  const blockText = `${item.title} ${item.area} ${item.location} ${item.notes ?? ''}`.toLowerCase();

  const placeholderPattern = /\b(placeholder|insert|need reservation|add queue link|whatever we didn|untitled|new ride|new activity)\b/;
  if (placeholderPattern.test(activityText)) return false;

  const logisticsPattern = /\b(walk to|head to|bus|uber|skyliner|stroller|bedtime|breakfast|lunch|dinner|airport|arrival|leave for)\b/;
  const attractionSignalPattern = /\b(ride|rides|attraction|cruise|railway|mountain|mansion|flight|safari|journey|track|runaway|resistance|falcon|tiana|tron|pan|remy|ratatouille|frozen|guardians|everest|avatar|slinky|alien|pirates|aladdin|small world|star tours|fantasmic)\b/;

  if (logisticsPattern.test(activityText) && !attractionSignalPattern.test(activityText)) return false;
  if (logisticsPattern.test(blockText) && !attractionSignalPattern.test(blockText) && !attractionSignalPattern.test(activityText)) return false;

  return true;
}

function shouldShowRideIntelForDay(day: TripDay): boolean {
  if (day.park === 'Travel Day' || day.park === 'Resort Day') return false;
  return !day.label.toLowerCase().includes('travel');
}

function getSupportedParkName(park: ParkName): Exclude<ParkName, 'Travel Day' | 'Resort Day'> | undefined {
  if (park === 'Magic Kingdom' || park === 'EPCOT' || park === 'Hollywood Studios' || park === 'Animal Kingdom') return park;
  return undefined;
}

function getDebugParkActivityOverride(): Exclude<ParkName, 'Travel Day' | 'Resort Day'> | undefined {
  const value = import.meta.env.VITE_DEBUG_PARK_ACTIVITY_PARK;
  if (value === 'magic-kingdom') return 'Magic Kingdom';
  if (value === 'epcot') return 'EPCOT';
  if (value === 'hollywood-studios') return 'Hollywood Studios';
  if (value === 'animal-kingdom') return 'Animal Kingdom';
  return undefined;
}

function normalizeParkEntityName(name = ''): ParkName | undefined {
  const normalized = name.toLowerCase();
  if (normalized.includes('magic kingdom')) return 'Magic Kingdom';
  if (normalized.includes('epcot')) return 'EPCOT';
  if (normalized.includes('hollywood studios')) return 'Hollywood Studios';
  if (normalized.includes('animal kingdom')) return 'Animal Kingdom';
  return undefined;
}

function getParkActivityLevel(averageWait: number, downRideCount: number, activeRideCount: number): ParkActivityLevel {
  const downPressure = activeRideCount > 0 && downRideCount / (activeRideCount + downRideCount) >= 0.25 ? 10 : 0;
  const adjustedWait = averageWait + downPressure;
  if (adjustedWait < 25) return 'Low';
  if (adjustedWait <= 45) return 'Moderate';
  if (adjustedWait <= 70) return 'Heavy';
  return 'Mayhem';
}

function getParkActivityTone(level: ParkActivityLevel): string {
  if (level === 'Low') return 'text-[#30D158]';
  if (level === 'Moderate') return 'text-[#FFD60A]';
  if (level === 'Heavy') return 'text-[#FF9F0A]';
  return 'text-[#FF2D55]';
}

function getWaitTime(entry: ThemeParksLiveEntry): number | undefined {
  const waitTime = entry.queue?.STANDBY?.waitTime;
  return typeof waitTime === 'number' && Number.isFinite(waitTime) && waitTime >= 0 ? waitTime : undefined;
}

function calculateParkActivity(entries: ThemeParksLiveEntry[]): ParkActivityIntel {
  const attractions = entries.filter((entry) => entry.entityType === 'ATTRACTION');
  const operatingWaits = attractions
    .filter((entry) => entry.status === 'OPERATING')
    .map(getWaitTime)
    .filter((waitTime): waitTime is number => waitTime !== undefined);
  const downRideCount = attractions.filter((entry) => entry.status === 'DOWN' || entry.status === 'TEMPORARILY_DOWN').length;

  if (operatingWaits.length === 0) return { status: 'unavailable' };

  const averageWait = Math.round(operatingWaits.reduce((total, waitTime) => total + waitTime, 0) / operatingWaits.length);

  return {
    status: 'ready',
    averageWait,
    activeRideCount: operatingWaits.length,
    downRideCount,
    level: getParkActivityLevel(averageWait, downRideCount, operatingWaits.length),
  };
}

async function fetchThemeParksActivity(signal: AbortSignal): Promise<Partial<Record<ParkName, ParkActivityIntel>>> {
  const childrenUrl = `https://api.themeparks.wiki/v1/entity/${themeParksDestinationId}/children`;
  console.log('ThemeParks activity fetch URL', childrenUrl);
  const childrenResponse = await fetch(childrenUrl, { signal });
  if (!childrenResponse.ok) throw new Error(`ThemeParks children request failed: ${childrenResponse.status}`);

  const childrenData = await childrenResponse.json();
  const entities: ThemeParksEntity[] = Array.isArray(childrenData.children) ? childrenData.children : [];
  const parkEntities = entities
    .map((entity) => ({ entity, park: normalizeParkEntityName(entity.name) }))
    .filter((entry): entry is { entity: ThemeParksEntity; park: Exclude<ParkName, 'Travel Day' | 'Resort Day'> } => Boolean(entry.entity.id && entry.park));

  const liveResults = await Promise.all(
    parkEntities.map(async ({ entity, park }) => {
      const liveUrl = `https://api.themeparks.wiki/v1/entity/${entity.id}/live`;
      console.log('ThemeParks activity fetch URL', liveUrl);
      const liveResponse = await fetch(liveUrl, { signal });
      if (!liveResponse.ok) throw new Error(`ThemeParks live request failed for ${park}: ${liveResponse.status}`);
      const liveData = await liveResponse.json();
      const entries: ThemeParksLiveEntry[] = Array.isArray(liveData.liveData) ? liveData.liveData : [];
      return [park, calculateParkActivity(entries)] as const;
    }),
  );

  return Object.fromEntries(liveResults);
}

function useParkActivityIntel(day: TripDay, phase: ReturnType<typeof getTripPhase>): ParkActivityIntel {
  const debugPark = getDebugParkActivityOverride();
  const supportedPark = debugPark ?? (phase === 'during' ? getSupportedParkName(day.park) : undefined);
  const [activity, setActivity] = useState<ParkActivityIntel>(() => (supportedPark ? { status: 'loading' } : { status: 'not-applicable' }));

  useEffect(() => {
    if (debugPark) {
      console.log(`Park Activity debug override active: ${debugPark}`);
    }
    console.log('Park Activity debug', {
      dayTitle: day.label,
      date: day.date,
      detectedPark: supportedPark ?? day.park,
      skipped: !supportedPark,
      phase,
      override: debugPark,
    });

    if (!supportedPark) {
      setActivity({ status: 'not-applicable' });
      return;
    }
    const parkName = supportedPark;

    const cached = parkActivityCache;
    if (cached && cached.expiresAt > Date.now()) {
      console.log('ThemeParks activity cache hit', { park: parkName });
      setActivity(cached.data[parkName] ?? { status: 'unavailable' });
      return;
    }

    const controller = new AbortController();
    setActivity({ status: 'loading' });

    async function fetchActivity() {
      try {
        const data = await fetchThemeParksActivity(controller.signal);
        parkActivityCache = {
          expiresAt: Date.now() + themeParksCacheMs,
          data,
        };
        console.log('ThemeParks activity API success', {
          park: parkName,
          result: data[parkName] ?? null,
        });
        setActivity(data[parkName] ?? { status: 'unavailable' });
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error('ThemeParks activity API error', error);
          setActivity({ status: 'error' });
        }
      }
    }

    void fetchActivity();
    return () => controller.abort();
  }, [debugPark, day.date, day.label, day.park, phase, supportedPark]);

  return activity;
}

function useWeatherIntel(date: string): WeatherIntel {
  const [weather, setWeather] = useState<WeatherIntel>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    setWeather({ status: 'loading' });

    async function fetchWeather() {
      try {
        const response = await fetch(openMeteoUrl, { signal: controller.signal });
        if (!response.ok) throw new Error(`Weather request failed: ${response.status}`);
        const data = await response.json();
        const dayIndex = Array.isArray(data.daily?.time) ? data.daily.time.indexOf(date) : -1;
        const hourlyTimes: string[] = Array.isArray(data.hourly?.time) ? data.hourly.time : [];
        const dayHourlyIndexes = hourlyTimes
          .map((time, index) => (time.startsWith(date) ? index : -1))
          .filter((index) => index >= 0);
        const stormChance = dayHourlyIndexes.some((index) => hasStormCode(data.hourly?.weather_code?.[index])) ? 1 : 0;

        setWeather({
          status: 'ready',
          currentTemp: typeof data.current?.temperature_2m === 'number' ? Math.round(data.current.temperature_2m) : undefined,
          highTemp: dayIndex >= 0 && typeof data.daily?.temperature_2m_max?.[dayIndex] === 'number' ? Math.round(data.daily.temperature_2m_max[dayIndex]) : undefined,
          rainChance: dayIndex >= 0 && typeof data.daily?.precipitation_probability_max?.[dayIndex] === 'number' ? data.daily.precipitation_probability_max[dayIndex] : undefined,
          stormChance,
        });
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error('Weather fetch error', error);
          setWeather({ status: 'error' });
        }
      }
    }

    void fetchWeather();
    return () => controller.abort();
  }, [date]);

  return weather;
}

function getDayIntel(day: TripDay, statuses: Record<string, ItemStatus>) {
  const reservationCount = day.items.filter(isReservationItem).length;
  const activityItemsById = new Map(day.items.filter(hasTimelineActivityBlock).map((item) => [item.id, item]));
  const rideCandidates = (day.landBlocks ?? []).flatMap((landBlock) =>
    landBlock.activities.map((activity) => ({
      land: landBlock.land,
      sourceItemId: activity.sourceItemId,
      activity,
      parentItem: activityItemsById.get(activity.sourceItemId),
    })),
  );
  const validRideCandidates = shouldShowRideIntelForDay(day)
    ? rideCandidates.filter((candidate) => candidate.parentItem && isMeaningfulRideActivity(candidate.parentItem, candidate.activity))
    : [];
  const completedActivityCount = validRideCandidates.filter(({ sourceItemId, activity }) => statuses[`${sourceItemId}:${activity.id}`] === 'done').length;
  const timelineItemCount = day.items.length;
  const hasAnyActivity = timelineItemCount > 0 || reservationCount > 0 || validRideCandidates.length > 0;

  console.log('Today Intel ride count debug', {
    day: {
      id: day.id,
      date: day.date,
      title: day.label,
    },
    candidatesBeforeFiltering: rideCandidates.map(({ land, sourceItemId, activity }) => ({
      id: activity.id,
      title: activity.title,
      land,
      sourceItemId,
    })),
    candidatesAfterFiltering: validRideCandidates.map(({ land, sourceItemId, activity }) => ({
      id: activity.id,
      title: activity.title,
      land,
      sourceItemId,
    })),
    finalRideTotal: validRideCandidates.length,
  });

  return {
    reservationCount,
    activityCount: validRideCandidates.length,
    completedActivityCount,
    timelineItemCount,
    hasAnyActivity,
  };
}

function getIntelTitle(day: TripDay, phase: ReturnType<typeof getTripPhase>, countdown?: ReturnType<typeof getDepartureCountdown>): string {
  if (phase === 'before' && countdown) {
    if (countdown.days === 0) return 'Departure today';
    if (countdown.days === 1) return 'Departure tomorrow';
    return `Departure in ${countdown.days} days`;
  }

  if (phase === 'after') return 'Trip complete';
  return day.label;
}

function TodayIntelCard({
  day,
  statuses,
  phase,
  countdown,
}: {
  day: TripDay;
  statuses: Record<string, ItemStatus>;
  phase: ReturnType<typeof getTripPhase>;
  countdown?: ReturnType<typeof getDepartureCountdown>;
}) {
  const weather = useWeatherIntel(day.date);
  const parkActivity = useParkActivityIntel(day, phase);
  const intel = getDayIntel(day, statuses);
  const title = getIntelTitle(day, phase, countdown);
  const reservationText = intel.reservationCount > 0 ? String(intel.reservationCount) : '—';
  const rideText = intel.activityCount > 0 ? `${intel.completedActivityCount}/${intel.activityCount} done` : '—';
  const parkActivityText =
    parkActivity.status === 'not-applicable'
      ? '—'
      : parkActivity.status === 'loading'
        ? 'Checking…'
        : parkActivity.status === 'unavailable'
          ? 'Unavailable'
          : parkActivity.status === 'error'
            ? 'Connection error'
            : parkActivity.level;
  const parkActivityClass = parkActivity.status === 'ready' ? getParkActivityTone(parkActivity.level) : 'text-white';
  const weatherText =
    weather.status === 'loading'
      ? 'Loading forecast'
      : weather.status === 'error'
        ? 'Forecast unavailable'
        : [
            weather.currentTemp !== undefined ? `${weather.currentTemp}° now` : undefined,
            weather.highTemp !== undefined ? `${weather.highTemp}° high` : undefined,
            weather.rainChance !== undefined ? `${weather.rainChance}% rain` : undefined,
            weather.stormChance ? 'storm possible' : undefined,
          ]
            .filter(Boolean)
            .join(' · ') || 'Forecast unavailable';

  return (
    <section aria-labelledby="today-intel-heading" className="glass-surface rounded-[1.5rem] px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-black uppercase tracking-[0.16em] text-[#0A84FF]">Today Intel</p>
          <h2 id="today-intel-heading" className="mt-1 text-[20px] font-black leading-tight text-white">
            {title}
          </h2>
        </div>
        <LucideIcon name="calendar" size={24} className="shrink-0 text-[#A1A1A6]" />
      </div>
      <dl className="mt-4 divide-y divide-[#2C2C2E]/70">
        {!intel.hasAnyActivity ? (
          <div className="py-3 text-[15px] font-semibold text-white">No activity for the day</div>
        ) : null}
        <div className="grid grid-cols-[auto_1fr] gap-x-3 py-3">
          <dt className="text-[13px] font-black uppercase tracking-[0.14em] text-[#A1A1A6]">Weather</dt>
          <dd className="text-right text-[15px] font-semibold text-white">{weatherText}</dd>
        </div>
        <div className="grid grid-cols-[auto_1fr] gap-x-3 py-3">
          <dt className="text-[13px] font-black uppercase tracking-[0.14em] text-[#A1A1A6]">Park Activity</dt>
          <dd className={`text-right text-[15px] font-black ${parkActivityClass}`}>
            {parkActivityText}
          </dd>
        </div>
        <div className="grid grid-cols-[auto_1fr] gap-x-3 py-3">
          <dt className="text-[13px] font-black uppercase tracking-[0.14em] text-[#A1A1A6]">Reservations</dt>
          <dd className="text-right text-[15px] font-semibold text-white">{reservationText}</dd>
        </div>
        <div className="grid grid-cols-[auto_1fr] gap-x-3 py-3">
          <dt className="text-[13px] font-black uppercase tracking-[0.14em] text-[#A1A1A6]">Rides</dt>
          <dd className="text-right text-[15px] font-semibold text-white">{rideText}</dd>
        </div>
      </dl>
    </section>
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
          <h1 id="countdown-heading" className="sr-only">Disney Mayhem</h1>
          <img
            src={`${import.meta.env.BASE_URL}DisneyMayhem-WM.svg`}
            alt="Disney Mayhem"
            className="mx-auto h-auto w-[min(78vw,280px)] sm:w-[320px]"
          />
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
          <div className="mt-4">
            <TodayIntelCard day={day} statuses={statuses} phase={phase} countdown={countdown} />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 min-[390px]:grid-cols-2">
            {days.map((tripDay) => {
              const presentation = getDayPresentation(tripDay);
              return (
                <DashboardTile
                  key={tripDay.id}
                  title={formatDashboardDateLabel(tripDay.date)}
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
            The May 29-June 4 trip is complete. Use All Days as the memory view.
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

      <section className="section-rise px-4 pb-8">
        <TodayIntelCard day={day} statuses={statuses} phase={phase} countdown={countdown} />
      </section>

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
                ? `${getItemDisplayLocation(nowItem)} · ${formatTimeRange(nowItem)}`
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
              className="ios-icon-button mt-7"
              aria-label="Edit"
              title="Edit"
            >
              <LucideIcon name="pencil" size={20} />
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
                <p className="mt-2 text-[15px] font-semibold text-[#A1A1A6]">{getItemDisplayLocation(nextItem)}</p>
              </div>
              <button
                type="button"
                onClick={() => onEditItem(day.id, nextItem)}
                className="ios-icon-button"
                aria-label="Edit"
                title="Edit"
              >
                <LucideIcon name="pencil" size={20} />
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
                <p className="mt-1 text-[14px] text-[#A1A1A6]">{getItemDisplayLocation(item)}</p>
              </div>
              <button
                type="button"
                onClick={() => onEditItem(day.id, item)}
                className="ios-icon-button"
                aria-label="Edit"
                title="Edit"
              >
                <LucideIcon name="pencil" size={20} />
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
  const displayLocation = getItemDisplayLocation(item);
  const showLocation = shouldShowSecondaryText(item.title, displayLocation);

  return (
    <article className={`py-4 ${hasTimelineActivityBlock(item) ? 'glass-surface rounded-[1.5rem] p-4' : ''}`}>
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
            aria-label="Edit"
            title="Edit"
          >
            <LucideIcon name="pencil" size={20} />
          </button>
        ) : null}
      </div>
      {showLocation ? <p className="mt-2 text-[15px] text-[#A1A1A6]">{displayLocation}</p> : null}
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
          <article key={item.id} className={`py-4 ${hasTimelineActivityBlock(item) ? 'glass-surface rounded-[1.6rem] p-4' : ''}`}>
            <p className="text-sm font-black uppercase tracking-wide text-[#FF9F0A]">{formatDateLabel(day.date)}</p>
            <div className="mt-1 flex items-start justify-between gap-3">
              <h2 className="text-xl font-black text-white">{item.title}</h2>
              <button
                type="button"
                onClick={() => onEditItem(day.id, item)}
                className="ios-icon-button"
                aria-label="Edit"
                title="Edit"
              >
                <LucideIcon name="pencil" size={20} />
              </button>
            </div>
            <p className="mt-1 font-semibold text-[#A1A1A6]">{formatTimeRange(item)}</p>
            <p className="mt-1 text-sm text-[#A1A1A6]">{getItemDisplayLocation(item)}</p>
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

type AddChoiceState = {
  dayId: string;
};

type ReservationAddChoiceState = {
  dayId?: string;
};

type ReservationDayCardAddState = {
  date: string;
  title: string;
  notes: string;
};

type AddLandCardState = {
  dayId: string;
  land: string;
  time: string;
  endTime: string;
  notes: string;
  placement: ItemPlacement;
  activities: LandEditorActivity[];
};

type LandDeleteState = {
  dayId: string;
  parentItem: TimelineActivityBlock;
  group: TimelineLandGroup;
};

type ItemDeleteState = {
  itemId: string;
  title: string;
};

type LandEditorActivity = {
  id: string;
  draft: EditableActivityFields;
  isNew?: boolean;
  removed?: boolean;
};

type LandEditorState = {
  dayId: string;
  groupId: string;
  parentItem: TimelineActivityBlock;
  land: string;
  notes: string;
  canEditParentDetails: boolean;
  activities: LandEditorActivity[];
};

type LightningLanePickerState = {
  activityId: string;
  startTime: string;
  duration: number;
};

type AppRoute = {
  tab: AppTab;
  dayId: string | null;
};

function parseHashRoute(hash = window.location.hash): AppRoute {
  if (!hash.startsWith('#!')) return { tab: 'today', dayId: null };

  const basePath = new URL(import.meta.env.BASE_URL, window.location.origin).pathname.replace(/\/+$/, '');
  const rawPath = decodeURIComponent(hash.slice(2)).replace(/\/+$/, '') || '/';
  const appPath = window.location.pathname.replace(/\/+$/, '');
  const pathPrefix = [basePath, appPath]
    .filter(Boolean)
    .sort((left, right) => right.length - left.length)
    .find((prefix) => rawPath.startsWith(prefix));
  const path = pathPrefix ? rawPath.slice(pathPrefix.length) || '/' : rawPath;
  const segments = path.split('/').filter(Boolean);

  if (segments[0] === 'days') {
    return { tab: 'days', dayId: segments[1] ?? null };
  }

  if (segments[0] === 'attention') {
    return { tab: 'attention', dayId: null };
  }

  if (segments[0] === 'reservations') {
    return { tab: 'reservations', dayId: null };
  }

  return { tab: 'today', dayId: null };
}

function getRouteHash(tab: AppTab, dayId: string | null = null): string {
  if (tab === 'days') return dayId ? `#!/days/${encodeURIComponent(dayId)}` : '#!/days';
  if (tab === 'attention') return '#!/attention';
  if (tab === 'reservations') return '#!/reservations';
  return '#!/';
}

function updateRouteHash(tab: AppTab, dayId: string | null = null) {
  const nextHash = getRouteHash(tab, dayId);
  if (window.location.hash !== nextHash) {
    window.location.hash = nextHash;
  }
}

function AddChoiceSheet({
  day,
  onChoose,
  onCancel,
}: {
  day: TripDay;
  onChoose: (choice: 'land' | 'reservation' | 'travel' | 'generic') => void;
  onCancel: () => void;
}) {
  const options: { id: 'land' | 'reservation' | 'travel' | 'generic'; label: string; detail: string; icon: LucideIconName }[] = [
    { id: 'land', label: 'Land card', detail: 'Add a grouped set of rides or activities.', icon: 'leaf' },
    { id: 'reservation', label: 'Reservation', detail: 'Dining, activities, or other fixed bookings.', icon: 'calendar' },
    { id: 'travel', label: 'Travel', detail: 'Transportation between places.', icon: 'plane' },
    { id: 'generic', label: 'Generic item', detail: 'A simple timeline note or reminder.', icon: 'plus' },
  ];

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/70 px-3 py-4 sm:items-center sm:justify-center" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-choice-title"
        className="glass-surface screen-fade w-full max-w-xl rounded-[2rem] p-5"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-black uppercase tracking-wide text-[#0A84FF]">{formatDateLabel(day.date)}</p>
            <h2 id="add-choice-title" className="mt-1 text-2xl font-black text-white">
              Add to {day.label}
            </h2>
          </div>
          <button type="button" onClick={onCancel} className="ios-icon-button" aria-label="Close" title="Close">
            <LucideIcon name="x" size={20} />
          </button>
        </div>

        <div className="mt-5 grid gap-3">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => onChoose(option.id)}
              className="flex min-h-16 items-center gap-3 rounded-[1.25rem] border border-white/[0.08] bg-[#1C1C1E]/70 px-4 py-3 text-left transition hover:bg-[#2C2C2E]/70 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#0A84FF]"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#111111] text-[#A1A1A6]">
                <LucideIcon name={option.icon} size={20} />
              </span>
              <span>
                <span className="block text-[17px] font-black text-white">{option.label}</span>
                <span className="mt-1 block text-[14px] text-[#A1A1A6]">{option.detail}</span>
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function ReservationAddChoiceSheet({
  day,
  onChooseReservation,
  onChooseDayCard,
  onCancel,
}: {
  day?: TripDay;
  onChooseReservation: () => void;
  onChooseDayCard: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/70 px-3 py-4 sm:items-center sm:justify-center" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="reservation-add-choice-title"
        className="glass-surface screen-fade w-full max-w-xl rounded-[2rem] p-5"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-black uppercase tracking-wide text-[#0A84FF]">
              {day ? formatDateLabel(day.date) : 'Reservations'}
            </p>
            <h2 id="reservation-add-choice-title" className="mt-1 text-2xl font-black text-white">
              {day ? `Add to ${day.label}` : 'Add reservation'}
            </h2>
          </div>
          <button type="button" onClick={onCancel} className="ios-icon-button" aria-label="Close" title="Close">
            <LucideIcon name="x" size={20} />
          </button>
        </div>

        <div className="mt-5 grid gap-3">
          <button
            type="button"
            onClick={onChooseReservation}
            className="flex min-h-16 items-center gap-3 rounded-[1.25rem] border border-white/[0.08] bg-[#1C1C1E]/70 px-4 py-3 text-left transition hover:bg-[#2C2C2E]/70 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#0A84FF]"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#111111] text-[#A1A1A6]">
              <LucideIcon name="calendar" size={20} />
            </span>
            <span>
              <span className="block text-[17px] font-black text-white">Add reservation</span>
              <span className="mt-1 block text-[14px] text-[#A1A1A6]">Dining, activities, or other fixed bookings.</span>
            </span>
          </button>
          <button
            type="button"
            onClick={onChooseDayCard}
            className="flex min-h-16 items-center gap-3 rounded-[1.25rem] border border-white/[0.08] bg-[#1C1C1E]/70 px-4 py-3 text-left transition hover:bg-[#2C2C2E]/70 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#0A84FF]"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#111111] text-[#A1A1A6]">
              <LucideIcon name="plus" size={20} />
            </span>
            <span>
              <span className="block text-[17px] font-black text-white">Add day card</span>
              <span className="mt-1 block text-[14px] text-[#A1A1A6]">Create a new day group for reservations.</span>
            </span>
          </button>
        </div>
      </section>
    </div>
  );
}

function ReservationDayCardSheet({
  draft,
  onChange,
  onSave,
  onCancel,
}: {
  draft: ReservationDayCardAddState;
  onChange: (draft: ReservationDayCardAddState) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/70 px-3 py-4 sm:items-center sm:justify-center" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="reservation-day-card-title"
        className="glass-surface screen-fade w-full max-w-xl rounded-[2rem] p-5"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-black uppercase tracking-wide text-[#0A84FF]">Reservations</p>
            <h2 id="reservation-day-card-title" className="mt-1 text-2xl font-black text-white">
              Add day card
            </h2>
          </div>
          <button type="button" onClick={onCancel} className="ios-icon-button" aria-label="Close" title="Close">
            <LucideIcon name="x" size={20} />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="text-sm font-black uppercase tracking-wide text-[#A1A1A6]">Date</span>
            <input
              type="date"
              value={draft.date}
              onChange={(event) => onChange({ ...draft, date: event.target.value })}
              className="mt-2 min-h-12 w-full rounded-2xl border border-[#2C2C2E] bg-[#111111] px-4 text-lg font-bold text-white outline-none focus:border-[#0A84FF] focus:ring-4 focus:ring-[#0A84FF]/30"
            />
          </label>
          <label className="block">
            <span className="text-sm font-black uppercase tracking-wide text-[#A1A1A6]">Day title</span>
            <input
              value={draft.title}
              onChange={(event) => onChange({ ...draft, title: event.target.value })}
              className="mt-2 min-h-12 w-full rounded-2xl border border-[#2C2C2E] bg-[#111111] px-4 text-lg font-bold text-white outline-none focus:border-[#0A84FF] focus:ring-4 focus:ring-[#0A84FF]/30"
            />
          </label>
          <label className="block">
            <span className="text-sm font-black uppercase tracking-wide text-[#A1A1A6]">Notes</span>
            <textarea
              value={draft.notes}
              onChange={(event) => onChange({ ...draft, notes: event.target.value })}
              className="mt-2 min-h-28 w-full rounded-2xl border border-[#2C2C2E] bg-[#111111] px-4 py-3 text-lg font-bold text-white outline-none focus:border-[#0A84FF] focus:ring-4 focus:ring-[#0A84FF]/30"
            />
          </label>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} className="min-h-12 rounded-full border border-[#3A3A3C] bg-[#1C1C1E] px-5 py-2 font-black text-white focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#0A84FF]">
            Cancel
          </button>
          <button type="button" onClick={onSave} className="min-h-12 rounded-full bg-[#0A84FF] px-5 py-2 font-black text-black focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#0A84FF]">
            Save
          </button>
        </div>
      </section>
    </div>
  );
}

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
  const isReservationDraft = draft.type === 'reservation';

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

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
            className="ios-icon-button"
            aria-label="Close"
            title="Close"
          >
            <LucideIcon name="x" size={20} />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          {draft.type === 'reservation' ? (
            <label className="block">
              <span className="text-sm font-black uppercase tracking-wide text-[#A1A1A6]">Date</span>
              <input
                type="date"
                value={draft.date ?? ''}
                onChange={(event) => onChange({ ...draft, date: event.target.value })}
                className="mt-2 min-h-12 w-full rounded-2xl border border-[#2C2C2E] bg-[#111111] px-4 text-lg font-bold text-white outline-none focus:border-[#0A84FF] focus:ring-4 focus:ring-[#0A84FF]/30"
              />
            </label>
          ) : null}

          <label className="block">
            <span className="text-sm font-black uppercase tracking-wide text-[#A1A1A6]">Time</span>
            <input
              type="time"
              value={draft.time ?? ''}
              onChange={(event) => onChange({ ...draft, time: event.target.value })}
              className="mt-2 min-h-12 w-full rounded-2xl border border-[#2C2C2E] bg-[#111111] px-4 text-lg font-bold text-white outline-none focus:border-[#0A84FF] focus:ring-4 focus:ring-[#0A84FF]/30"
            />
          </label>

          {draft.type === 'reservation' ? (
            <label className="block">
              <span className="text-sm font-black uppercase tracking-wide text-[#A1A1A6]">End time</span>
              <input
                type="time"
                value={draft.endTime ?? ''}
                onChange={(event) => onChange({ ...draft, endTime: event.target.value })}
                className="mt-2 min-h-12 w-full rounded-2xl border border-[#2C2C2E] bg-[#111111] px-4 text-lg font-bold text-white outline-none focus:border-[#0A84FF] focus:ring-4 focus:ring-[#0A84FF]/30"
              />
            </label>
          ) : null}

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

          {draft.type === 'scheduled' && draft.category === 'transport' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-black uppercase tracking-wide text-[#A1A1A6]">From</span>
                <input
                  value={draft.from ?? ''}
                  onChange={(event) => onChange({ ...draft, from: event.target.value })}
                  className="mt-2 min-h-12 w-full rounded-2xl border border-[#2C2C2E] bg-[#111111] px-4 text-lg font-bold text-white outline-none focus:border-[#0A84FF] focus:ring-4 focus:ring-[#0A84FF]/30"
                />
              </label>
              <label className="block">
                <span className="text-sm font-black uppercase tracking-wide text-[#A1A1A6]">To</span>
                <input
                  value={draft.to ?? ''}
                  onChange={(event) => onChange({ ...draft, to: event.target.value })}
                  className="mt-2 min-h-12 w-full rounded-2xl border border-[#2C2C2E] bg-[#111111] px-4 text-lg font-bold text-white outline-none focus:border-[#0A84FF] focus:ring-4 focus:ring-[#0A84FF]/30"
                />
              </label>
            </div>
          ) : null}

          {draft.type === 'reservation' ? (
            <>
              <label className="block">
                <span className="text-sm font-black uppercase tracking-wide text-[#A1A1A6]">Park or area</span>
                <input
                  value={draft.area ?? ''}
                  onChange={(event) => onChange({ ...draft, area: event.target.value })}
                  className="mt-2 min-h-12 w-full rounded-2xl border border-[#2C2C2E] bg-[#111111] px-4 text-lg font-bold text-white outline-none focus:border-[#0A84FF] focus:ring-4 focus:ring-[#0A84FF]/30"
                />
              </label>
              <label className="block">
                <span className="text-sm font-black uppercase tracking-wide text-[#A1A1A6]">Confirmation number</span>
                <input
                  value={draft.confirmationNumber ?? ''}
                  onChange={(event) => onChange({ ...draft, confirmationNumber: event.target.value })}
                  className="mt-2 min-h-12 w-full rounded-2xl border border-[#2C2C2E] bg-[#111111] px-4 text-lg font-bold text-white outline-none focus:border-[#0A84FF] focus:ring-4 focus:ring-[#0A84FF]/30"
                />
              </label>
            </>
          ) : null}

          <label className="block">
            <span className="text-sm font-black uppercase tracking-wide text-[#A1A1A6]">Notes</span>
            <textarea
              value={draft.notes ?? ''}
              onChange={(event) => onChange({ ...draft, notes: event.target.value })}
              className="mt-2 min-h-28 w-full rounded-2xl border border-[#2C2C2E] bg-[#111111] px-4 py-3 text-lg font-bold text-white outline-none focus:border-[#0A84FF] focus:ring-4 focus:ring-[#0A84FF]/30"
            />
          </label>
        </div>

        <div className={`mt-5 flex flex-col gap-3 sm:flex-row ${editor.mode === 'edit' && !isReservationDraft ? 'sm:justify-between' : 'sm:justify-end'}`}>
          {editor.mode === 'edit' && !isReservationDraft ? (
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

        {editor.mode === 'edit' && isReservationDraft ? (
          <div className="mt-6 border-t border-white/[0.08] pt-5">
            <button
              type="button"
              onClick={onDelete}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-[#FF453A] bg-[#FF453A]/15 px-5 py-2 font-black text-[#FF453A] focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#FF453A] sm:w-auto"
            >
              <LucideIcon name="trash" size={20} />
              Delete reservation
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function AddLandCardSheet({
  editor,
  day,
  onChange,
  onSave,
  onCancel,
}: {
  editor: AddLandCardState;
  day: TripDay;
  onChange: (editor: AddLandCardState) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  function updateActivity(id: string, draft: EditableActivityFields) {
    onChange({
      ...editor,
      activities: editor.activities.map((activity) => (activity.id === id ? { ...activity, draft } : activity)),
    });
  }

  function addActivity() {
    onChange({
      ...editor,
      activities: [
        ...editor.activities,
        {
          id: `draft-activity-${Date.now()}`,
          isNew: true,
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
    onChange({ ...editor, activities: editor.activities.filter((activity) => activity.id !== id) });
  }

  function setPlacement(value: string) {
    if (value === 'end') {
      onChange({ ...editor, placement: { mode: 'end' } });
      return;
    }

    const [mode, targetItemId] = value.split(':') as ['before' | 'after', string];
    onChange({ ...editor, placement: { mode, targetItemId } });
  }

  const inputClass =
    'mt-2 min-h-12 w-full rounded-2xl border border-[#2C2C2E] bg-[#111111] px-4 text-base font-bold text-white outline-none focus:border-[#0A84FF] focus:ring-4 focus:ring-[#0A84FF]/30';

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/70 px-3 py-4 sm:items-center sm:justify-center" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="land-card-add-title"
        className="glass-surface screen-fade max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] p-5"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-black uppercase tracking-wide text-[#0A84FF]">Add land card</p>
            <h2 id="land-card-add-title" className="mt-1 text-2xl font-black text-white">
              {day.label}
            </h2>
          </div>
          <button type="button" onClick={onCancel} className="ios-icon-button" aria-label="Close" title="Close">
            <LucideIcon name="x" size={20} />
          </button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="text-sm font-black uppercase tracking-wide text-[#A1A1A6]">Land / Area name</span>
            <input
              value={editor.land}
              onChange={(event) => onChange({ ...editor, land: event.target.value })}
              className={inputClass}
              required
            />
          </label>
          <label className="block">
            <span className="text-sm font-black uppercase tracking-wide text-[#A1A1A6]">Time</span>
            <input
              type="time"
              value={editor.time}
              onChange={(event) => onChange({ ...editor, time: event.target.value })}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="text-sm font-black uppercase tracking-wide text-[#A1A1A6]">End time</span>
            <input
              type="time"
              value={editor.endTime}
              onChange={(event) => onChange({ ...editor, endTime: event.target.value })}
              className={inputClass}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-sm font-black uppercase tracking-wide text-[#A1A1A6]">Placement</span>
            <select
              value={editor.placement.mode === 'end' ? 'end' : `${editor.placement.mode}:${editor.placement.targetItemId ?? ''}`}
              onChange={(event) => setPlacement(event.target.value)}
              className={inputClass}
            >
              <option value="end">End of day</option>
              {day.items.map((item) => (
                <option key={`before-${item.id}`} value={`before:${item.id}`}>
                  Before {formatTimeRange(item)} · {item.title}
                </option>
              ))}
              {day.items.map((item) => (
                <option key={`after-${item.id}`} value={`after:${item.id}`}>
                  After {formatTimeRange(item)} · {item.title}
                </option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="text-sm font-black uppercase tracking-wide text-[#A1A1A6]">Notes</span>
            <textarea
              value={editor.notes}
              onChange={(event) => onChange({ ...editor, notes: event.target.value })}
              className="mt-2 min-h-24 w-full rounded-2xl border border-[#2C2C2E] bg-[#111111] px-4 py-3 text-base font-bold text-white outline-none focus:border-[#0A84FF] focus:ring-4 focus:ring-[#0A84FF]/30"
            />
          </label>
        </div>

        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-black uppercase tracking-wide text-[#A1A1A6]">Initial rides</p>
            <button type="button" onClick={addActivity} className="ios-icon-button" aria-label="Add ride" title="Add ride">
              <LucideIcon name="plus" size={20} />
            </button>
          </div>
          {editor.activities.map((activity, index) => (
            <section key={activity.id} className="rounded-[1.25rem] border border-white/[0.08] bg-[#1C1C1E]/50 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[12px] font-black uppercase tracking-[0.16em] text-[#A1A1A6]">Ride {index + 1}</p>
                <button type="button" onClick={() => removeActivity(activity.id)} className="ios-icon-button ios-icon-button-danger" aria-label="Remove item" title="Remove item">
                  <LucideIcon name="trash" size={20} />
                </button>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="text-sm font-black uppercase tracking-wide text-[#A1A1A6]">Title</span>
                  <input
                    value={activity.draft.title}
                    onChange={(event) => updateActivity(activity.id, { ...activity.draft, title: event.target.value })}
                    className={inputClass}
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-sm font-black uppercase tracking-wide text-[#A1A1A6]">Notes</span>
                  <textarea
                    value={activity.draft.notes ?? ''}
                    onChange={(event) => updateActivity(activity.id, { ...activity.draft, notes: event.target.value })}
                    className="mt-2 min-h-20 w-full rounded-2xl border border-[#2C2C2E] bg-[#111111] px-4 py-3 text-base font-bold text-white outline-none focus:border-[#0A84FF] focus:ring-4 focus:ring-[#0A84FF]/30"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-black uppercase tracking-wide text-[#A1A1A6]">Lightning Lane start</span>
                  <input
                    type="time"
                    value={activity.draft.lightningLaneStart ?? activity.draft.lightningLaneTime ?? ''}
                    onChange={(event) => {
                      const start = event.target.value;
                      updateActivity(activity.id, {
                        ...activity.draft,
                        lightningLaneStart: start,
                        lightningLaneTime: start,
                        lightningLaneEnd: start ? addMinutesToTime(start, 60) : '',
                        lightningLaneEndTime: start ? addMinutesToTime(start, 60) : '',
                        lightningLaneLabel: start ? 'LL' : '',
                      });
                    }}
                    className={inputClass}
                  />
                </label>
                <p className="self-end pb-3 text-sm font-semibold text-[#A1A1A6]">
                  {formatOptionalTimeRange(activity.draft.lightningLaneStart ?? activity.draft.lightningLaneTime, activity.draft.lightningLaneEnd ?? activity.draft.lightningLaneEndTime) ?? 'LL window not set'}
                </p>
              </div>
            </section>
          ))}
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} className="min-h-12 rounded-full border border-[#3A3A3C] bg-[#1C1C1E] px-5 py-2 font-black text-white focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#0A84FF]">
            Cancel
          </button>
          <button type="button" onClick={onSave} className="min-h-12 rounded-full bg-[#0A84FF] px-5 py-2 font-black text-black focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#0A84FF]">
            Save
          </button>
        </div>
      </section>
    </div>
  );
}

function DeleteLandCardSheet({
  land,
  onCancel,
  onDelete,
}: {
  land: string;
  onCancel: () => void;
  onDelete: () => void;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/70 px-3 py-4 sm:items-center sm:justify-center" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-land-card-title"
        className="glass-surface screen-fade w-full max-w-md rounded-[2rem] p-5"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-black uppercase tracking-wide text-[#FF453A]">{land}</p>
            <h2 id="delete-land-card-title" className="mt-1 text-2xl font-black text-white">
              Delete this land card?
            </h2>
          </div>
          <button type="button" onClick={onCancel} className="ios-icon-button" aria-label="Close" title="Close">
            <LucideIcon name="x" size={20} />
          </button>
        </div>
        <p className="mt-4 text-[15px] leading-6 text-[#A1A1A6]">
          This will remove the land card and all rides/activities inside it from this day.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} className="min-h-12 rounded-full border border-[#3A3A3C] bg-[#1C1C1E] px-5 py-2 font-black text-white focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#0A84FF]">
            Cancel
          </button>
          <button type="button" onClick={onDelete} className="min-h-12 rounded-full border border-[#FF453A] bg-[#FF453A]/15 px-5 py-2 font-black text-[#FF453A] focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#FF453A]">
            Delete
          </button>
        </div>
      </section>
    </div>
  );
}

function DeleteItemSheet({
  title,
  onCancel,
  onDelete,
}: {
  title: string;
  onCancel: () => void;
  onDelete: () => void;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/70 px-3 py-4 sm:items-center sm:justify-center" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-item-title"
        className="glass-surface screen-fade w-full max-w-md rounded-[2rem] p-5"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-black uppercase tracking-wide text-[#FF453A]">{title}</p>
            <h2 id="delete-item-title" className="mt-1 text-2xl font-black text-white">
              Delete this item?
            </h2>
          </div>
          <button type="button" onClick={onCancel} className="ios-icon-button" aria-label="Close" title="Close">
            <LucideIcon name="x" size={20} />
          </button>
        </div>
        <p className="mt-4 text-[15px] leading-6 text-[#A1A1A6]">
          This will remove it from the planner and synced devices.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} className="min-h-12 rounded-full border border-[#3A3A3C] bg-[#1C1C1E] px-5 py-2 font-black text-white focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#0A84FF]">
            Cancel
          </button>
          <button type="button" onClick={onDelete} className="min-h-12 rounded-full border border-[#FF453A] bg-[#FF453A]/15 px-5 py-2 font-black text-[#FF453A] focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#FF453A]">
            Delete
          </button>
        </div>
      </section>
    </div>
  );
}

function LandEditorSheet({
  editor,
  orderState,
  onChange,
  onSave,
  onCancel,
  onDelete,
  onMoveEarlier,
  onMoveLater,
}: {
  editor: LandEditorState;
  orderState?: { canMoveEarlier: boolean; canMoveLater: boolean };
  onChange: (editor: LandEditorState) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onMoveEarlier: () => void;
  onMoveLater: () => void;
}) {
  const [lightningLanePicker, setLightningLanePicker] = useState<LightningLanePickerState | null>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (lightningLanePicker) {
        setLightningLanePicker(null);
        return;
      }
      onCancel();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightningLanePicker, onCancel]);

  function updateActivity(id: string, draft: EditableActivityFields) {
    onChange({
      ...editor,
      activities: editor.activities.map((activity) => (activity.id === id ? { ...activity, draft } : activity)),
    });
  }

  function addActivity() {
    const id = `local-activity-${editor.groupId}-${Date.now()}`;
    onChange({
      ...editor,
      activities: [
        ...editor.activities,
        {
          id,
          isNew: true,
          draft: {
            landGroupId: editor.groupId,
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
          <button type="button" onClick={onCancel} className="ios-icon-button" aria-label="Close" title="Close">
            <LucideIcon name="x" size={20} />
          </button>
        </div>

        <div className="mt-5 grid gap-4">
          <label className="block">
            <span className="text-sm font-black uppercase tracking-wide text-[#A1A1A6]">Land / Area name</span>
            <input
              value={editor.land}
              onChange={(event) => onChange({ ...editor, land: event.target.value })}
              className={inputClass}
              required
            />
          </label>
          {editor.canEditParentDetails ? (
            <label className="block">
              <span className="text-sm font-black uppercase tracking-wide text-[#A1A1A6]">Notes</span>
              <textarea
                value={editor.notes}
                onChange={(event) => onChange({ ...editor, notes: event.target.value })}
                className="mt-2 min-h-24 w-full rounded-2xl border border-[#2C2C2E] bg-[#111111] px-4 py-3 text-base font-bold text-white outline-none focus:border-[#0A84FF] focus:ring-4 focus:ring-[#0A84FF]/30"
              />
            </label>
          ) : null}
        </div>

        {orderState ? (
          <section className="mt-5 rounded-[1.35rem] border border-white/[0.08] bg-[#111111]/55 p-4">
            <p className="text-sm font-black uppercase tracking-wide text-[#A1A1A6]">Order</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={onMoveEarlier}
                disabled={!orderState.canMoveEarlier}
                className="min-h-12 rounded-full border border-[#3A3A3C] bg-[#1C1C1E] px-5 py-2 font-black text-white transition disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#0A84FF]"
              >
                Move earlier
              </button>
              <button
                type="button"
                onClick={onMoveLater}
                disabled={!orderState.canMoveLater}
                className="min-h-12 rounded-full border border-[#3A3A3C] bg-[#1C1C1E] px-5 py-2 font-black text-white transition disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#0A84FF]"
              >
                Move later
              </button>
            </div>
          </section>
        ) : null}

        <div className="mt-5 space-y-5">
          {visibleActivities.map((activity, index) => (
            <section key={activity.id} className="glass-surface rounded-[1.35rem] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[12px] font-black uppercase tracking-[0.16em] text-[#A1A1A6]">Ride {index + 1}</p>
                <div className="flex shrink-0 gap-2">
                  <button type="button" onClick={() => moveActivity(activity.id, -1)} className="ios-icon-button" aria-label="Move up" title="Move up">
                    <LucideIcon name="chevron-up" size={20} />
                  </button>
                  <button type="button" onClick={() => moveActivity(activity.id, 1)} className="ios-icon-button" aria-label="Move down" title="Move down">
                    <LucideIcon name="chevron-down" size={20} />
                  </button>
                  <button type="button" onClick={() => removeActivity(activity.id)} className="ios-icon-button ios-icon-button-danger" aria-label="Remove item" title="Remove item">
                    <LucideIcon name="trash" size={20} />
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

        <div className="mt-6 border-t border-white/[0.08] pt-5">
          <button
            type="button"
            onClick={onDelete}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-[#FF453A] bg-[#FF453A]/10 px-5 py-2 font-black text-[#FF453A] focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#FF453A] sm:w-auto"
          >
            <LucideIcon name="trash" size={20} />
            Delete land card
          </button>
        </div>

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
  landGroupOrders,
  onCycleStatus,
  onEditItem,
  onEditLand,
}: {
  day: TripDay;
  item: TimelineActivityBlock;
  statuses: Record<string, ItemStatus>;
  landGroupOrders: Record<string, LandGroupOrder>;
  onCycleStatus: (id: string) => void;
  onEditItem: (dayId: string, item: TripItem) => void;
  onEditLand: (day: TripDay, item: TimelineActivityBlock, group: TimelineLandGroup) => void;
}) {
  const itemStatus = statuses[getItemStatusKey(item)];
  const groups = groupActivitiesByLand(day, item, landGroupOrders);

  return (
    <article className="py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-black uppercase tracking-[0.16em] text-[#0A84FF]">{formatTimeRange(item)}</p>
          <p className="mt-2 text-[15px] font-semibold text-[#A1A1A6]">{getItemDisplayLocation(item)}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onEditItem(day.id, item)}
            className="ios-icon-button"
            aria-label="Edit"
            title="Edit"
          >
            <LucideIcon name="pencil" size={20} />
          </button>
          <StatusButton id={item.id} status={itemStatus} onCycle={onCycleStatus} />
        </div>
      </div>

      {item.notes ? <p className="mt-4 text-[15px] leading-6 text-[#A1A1A6]">{item.notes}</p> : null}

      <div className="mt-6 space-y-7">
        {groups.map((group) => (
          <section key={group.groupId} aria-label={`${item.title} ${group.land}`} className="glass-surface rounded-[1.35rem] px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-[13px] font-black uppercase tracking-[0.18em] text-white">{group.land}</h4>
              <button
                type="button"
                onClick={() => onEditLand(day, item, group)}
                className="ios-icon-button"
                aria-label="Edit"
                title={`Edit ${group.land}`}
              >
                <LucideIcon name="pencil" size={20} />
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
  landGroupOrders,
  onCycleStatus,
  onEditItem,
  onAddItem,
  onEditLand,
  onBackToDashboard,
}: {
  day: TripDay;
  statuses: Record<string, ItemStatus>;
  landGroupOrders: Record<string, LandGroupOrder>;
  onCycleStatus: (id: string) => void;
  onEditItem: (dayId: string, item: TripItem) => void;
  onAddItem: (dayId: string) => void;
  onEditLand: (day: TripDay, item: TimelineActivityBlock, group: TimelineLandGroup) => void;
  onBackToDashboard?: () => void;
}) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const headerRef = useRef<HTMLElement | null>(null);
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);

  useEffect(() => {
    function updateCollapsedHeader() {
      const section = sectionRef.current;
      const header = headerRef.current;
      if (!section || !header) return;

      const headerRect = header.getBoundingClientRect();
      const sectionRect = section.getBoundingClientRect();
      const shouldCollapse = headerRect.bottom < 92 && sectionRect.bottom > 160;
      setIsHeaderCollapsed((current) => (current === shouldCollapse ? current : shouldCollapse));
    }

    updateCollapsedHeader();
    window.addEventListener('scroll', updateCollapsedHeader, { passive: true });
    window.addEventListener('resize', updateCollapsedHeader);
    return () => {
      window.removeEventListener('scroll', updateCollapsedHeader);
      window.removeEventListener('resize', updateCollapsedHeader);
    };
  }, [day.id]);

  return (
    <section ref={sectionRef} aria-labelledby={`${day.id}-heading`} className="section-rise px-4 pb-8 pt-3">
      {onBackToDashboard ? (
        <div className="sticky top-0 z-30 mb-3 pt-3">
          <div
            className={`flex min-h-14 items-center gap-2 rounded-full border border-white/[0.08] bg-[#1C1C1E]/75 px-1.5 py-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-xl transition-all duration-200 ${
              isHeaderCollapsed ? 'w-full' : 'w-14'
            }`}
          >
            <button
              type="button"
              onClick={onBackToDashboard}
              className="ios-icon-button min-h-11 min-w-11 shadow-none"
              aria-label="Back to dashboard"
              title="Back to dashboard"
            >
              <LucideIcon name="chevron-left" size={24} />
            </button>
            <p
              className={`min-w-0 flex-1 truncate text-[15px] font-black text-white transition-opacity duration-200 ${
                isHeaderCollapsed ? 'opacity-100' : 'pointer-events-none opacity-0'
              }`}
              aria-hidden={!isHeaderCollapsed}
            >
              {day.label}
            </p>
            <button
              type="button"
              onClick={() => onAddItem(day.id)}
              className={`ios-icon-button min-h-11 min-w-11 shadow-none transition-opacity duration-200 ${
                isHeaderCollapsed ? 'opacity-100' : 'pointer-events-none opacity-0'
              }`}
              aria-label="Add item"
              title="Add item"
              tabIndex={isHeaderCollapsed ? 0 : -1}
              aria-hidden={!isHeaderCollapsed}
            >
              <LucideIcon name="plus" size={20} />
            </button>
          </div>
        </div>
      ) : null}
      <header ref={headerRef} className="mb-8 border-b border-[#2C2C2E]/70 pb-7">
        <div className="flex items-start justify-between gap-5">
          <div>
            <p className="text-[12px] font-black uppercase tracking-[0.16em] text-[#0A84FF]">{formatDateLabel(day.date)}</p>
            <h2 id={`${day.id}-heading`} className="mt-3 text-[32px] font-black leading-[1.02] text-white sm:text-[38px]">
              {day.label}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onAddItem(day.id)}
            className="ios-icon-button mt-1 min-h-12 min-w-12 border-white/15 bg-[#1C1C1E]/85"
            aria-label="Add item"
            title="Add item"
          >
            <LucideIcon name="plus" size={24} />
          </button>
        </div>
      </header>
      <div className="divide-y divide-[#2C2C2E]/70">
        {day.items.map((item) =>
          hasTimelineActivityBlock(item) ? (
            <FlexibleTimelineItem
              key={item.id}
              day={day}
              item={item}
              statuses={statuses}
              landGroupOrders={landGroupOrders}
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
  landGroupOrders,
  onCycleStatus,
  days,
  onEditItem,
  onAddItem,
  onEditLand,
  onBackToDashboard,
}: {
  statuses: Record<string, ItemStatus>;
  landGroupOrders: Record<string, LandGroupOrder>;
  onCycleStatus: (id: string) => void;
  days: TripDay[];
  onEditItem: (dayId: string, item: TripItem) => void;
  onAddItem: (dayId: string) => void;
  onEditLand: (day: TripDay, item: TimelineActivityBlock, group: TimelineLandGroup) => void;
  onBackToDashboard?: () => void;
}) {
  return (
    <main className="screen-fade pt-2">
      {days.map((day) => (
        <DayTimeline
          key={day.id}
          day={day}
          statuses={statuses}
          landGroupOrders={landGroupOrders}
          onCycleStatus={onCycleStatus}
          onEditItem={onEditItem}
          onAddItem={onAddItem}
          onEditLand={onEditLand}
          onBackToDashboard={days.length === 1 ? onBackToDashboard : undefined}
        />
      ))}
    </main>
  );
}

function ReservationsScreen({
  reservations,
  reservationDayCards,
  onEditItem,
  onOpenAddOptions,
  onAddReservationForDay,
  onBackToDashboard,
}: {
  reservations: ReturnType<typeof getReservations>;
  reservationDayCards: Record<string, ReservationDayCard>;
  onEditItem: (dayId: string, item: TripItem) => void;
  onOpenAddOptions: () => void;
  onAddReservationForDay: (date: string) => void;
  onBackToDashboard: () => void;
}) {
  const reservationGroups = groupReservationsByDay(reservations, reservationDayCards);
  const sectionRef = useRef<HTMLElement | null>(null);
  const headerRef = useRef<HTMLElement | null>(null);
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);

  useEffect(() => {
    function updateCollapsedHeader() {
      const section = sectionRef.current;
      const header = headerRef.current;
      if (!section || !header) return;

      const headerRect = header.getBoundingClientRect();
      const sectionRect = section.getBoundingClientRect();
      const shouldCollapse = headerRect.bottom < 92 && sectionRect.bottom > 160;
      setIsHeaderCollapsed((current) => (current === shouldCollapse ? current : shouldCollapse));
    }

    updateCollapsedHeader();
    window.addEventListener('scroll', updateCollapsedHeader, { passive: true });
    window.addEventListener('resize', updateCollapsedHeader);
    return () => {
      window.removeEventListener('scroll', updateCollapsedHeader);
      window.removeEventListener('resize', updateCollapsedHeader);
    };
  }, []);

  return (
    <main ref={sectionRef} className="screen-fade section-rise px-4 pb-6 pt-3" aria-labelledby="reservations-heading">
      <div className="sticky top-0 z-30 mb-3 pt-3">
        <div
          className={`flex min-h-14 items-center gap-2 rounded-full border border-white/[0.08] bg-[#1C1C1E]/75 px-1.5 py-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-xl transition-all duration-200 ${
            isHeaderCollapsed ? 'w-full' : 'w-14'
          }`}
        >
          <button
            type="button"
            onClick={onBackToDashboard}
            className="ios-icon-button min-h-11 min-w-11 shadow-none"
            aria-label="Back to dashboard"
            title="Back to dashboard"
          >
            <LucideIcon name="chevron-left" size={24} />
          </button>
          <p
            className={`min-w-0 flex-1 truncate text-[15px] font-black text-white transition-opacity duration-200 ${
              isHeaderCollapsed ? 'opacity-100' : 'pointer-events-none opacity-0'
            }`}
            aria-hidden={!isHeaderCollapsed}
          >
            Reservations
          </p>
          <button
            type="button"
            onClick={onOpenAddOptions}
            className={`ios-icon-button min-h-11 min-w-11 shadow-none transition-opacity duration-200 ${
              isHeaderCollapsed ? 'opacity-100' : 'pointer-events-none opacity-0'
            }`}
            aria-label="Add reservation"
            title="Add reservation"
            tabIndex={isHeaderCollapsed ? 0 : -1}
            aria-hidden={!isHeaderCollapsed}
          >
            <LucideIcon name="plus" size={20} />
          </button>
        </div>
      </div>

      <header ref={headerRef} className="mb-8 border-b border-[#2C2C2E]/70 pb-7">
        <div className="flex items-start justify-between gap-5">
          <h1 id="reservations-heading" className="text-[32px] font-black leading-[1.02] text-white sm:text-[38px]">
            Reservations
          </h1>
          <button
            type="button"
            onClick={onOpenAddOptions}
            className="ios-icon-button mt-1 min-h-12 min-w-12 border-white/15 bg-[#1C1C1E]/85"
            aria-label="Add reservation"
            title="Add reservation"
          >
            <LucideIcon name="plus" size={24} />
          </button>
        </div>
      </header>

      <div className="space-y-8">
        {reservationGroups.map(({ day, items, card }) => {
          const title = getReservationGroupTitle(day, card);

          return (
            <section
              key={day.id}
              aria-labelledby={`${day.id}-reservations-heading`}
              className="glass-surface rounded-[1.35rem] px-4 py-4"
            >
              <div className="flex items-start justify-between gap-4 pb-4">
                <div>
                  <p className="text-[12px] font-black uppercase tracking-[0.16em] text-[#0A84FF]">{formatDateLabel(day.date)}</p>
                  <h2 id={`${day.id}-reservations-heading`} className="mt-1 text-[20px] font-black leading-tight text-white">
                    {title}
                  </h2>
                  {day.notes ? <p className="mt-2 text-sm leading-5 text-[#A1A1A6]">{day.notes}</p> : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <p className="rounded-full border border-white/[0.08] bg-[#111111]/70 px-3 py-1 text-[12px] font-black text-[#A1A1A6]">
                    {items.length} {items.length === 1 ? 'plan' : 'plans'}
                  </p>
                  <button
                    type="button"
                    onClick={() => onAddReservationForDay(day.date)}
                    className="ios-icon-button"
                    aria-label={`Add reservation for ${title}`}
                    title={`Add reservation for ${title}`}
                  >
                    <LucideIcon name="plus" size={20} />
                  </button>
                </div>
              </div>
              <div className="divide-y divide-[#2C2C2E]/70">
                {items.map((item) => {
                  const showLocation = shouldShowSecondaryText(item.title, item.location);

                  return (
                    <article key={item.id} className="py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[12px] font-black uppercase tracking-[0.16em] text-[#A1A1A6]">{formatTimeRange(item)}</p>
                          <h3 className="mt-2 text-xl font-black leading-tight text-white">{item.title}</h3>
                          {showLocation ? <p className="mt-1 text-sm font-semibold text-[#A1A1A6]">{item.location}</p> : null}
                          {getItemConfirmationNumber(item) ? <p className="mt-2 text-sm text-[#A1A1A6]">Confirmation #{getItemConfirmationNumber(item)}</p> : null}
                          {item.notes ? <p className="mt-2 text-sm leading-6 text-[#A1A1A6]">{item.notes}</p> : null}
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <button
                            type="button"
                            onClick={() => onEditItem(day.id, item)}
                            className="ios-icon-button"
                            aria-label="Edit"
                            title="Edit"
                          >
                            <LucideIcon name="pencil" size={20} />
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
                {items.length === 0 ? <p className="py-4 text-[15px] text-[#A1A1A6]">No reservations yet.</p> : null}
              </div>
            </section>
          );
        })}
        {reservationGroups.length === 0 ? <p className="text-[15px] text-[#A1A1A6]">No reservations yet.</p> : null}
      </div>
    </main>
  );
}

export default function App() {
  const initialRoute = useMemo(() => parseHashRoute(), []);
  const [activeTab, setActiveTab] = useState<AppTab>(initialRoute.tab);
  const [selectedDayId, setSelectedDayId] = useState<string | null>(initialRoute.dayId);
  const [now, setNow] = useState(() => new Date());
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [addChoice, setAddChoice] = useState<AddChoiceState | null>(null);
  const [reservationAddChoice, setReservationAddChoice] = useState<ReservationAddChoiceState | null>(null);
  const [reservationDayCardAdd, setReservationDayCardAdd] = useState<ReservationDayCardAddState | null>(null);
  const [landCardAdd, setLandCardAdd] = useState<AddLandCardState | null>(null);
  const [landEditor, setLandEditor] = useState<LandEditorState | null>(null);
  const [landDelete, setLandDelete] = useState<LandDeleteState | null>(null);
  const [itemDelete, setItemDelete] = useState<ItemDeleteState | null>(null);
  const tripStorage = useTripStorage();

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    function handleHashChange() {
      const route = parseHashRoute();
      setActiveTab(route.tab);
      setSelectedDayId(route.dayId);
    }

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [activeTab, selectedDayId]);

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
        tripStorage.deletedLandGroupIds,
        tripStorage.landGroupOrders,
      ),
    [tripStorage.activityEdits, tripStorage.addedActivities, tripStorage.addedItems, tripStorage.deletedActivityIds, tripStorage.deletedItemIds, tripStorage.deletedLandGroupIds, tripStorage.itemEdits, tripStorage.landGroupOrders],
  );
  const reservations = useMemo(() => getReservations(tripDays), [tripDays]);
  const attentionItems = useMemo(() => getAttentionItems(tripDays), [tripDays]);
  const activeState = useMemo(() => getActiveScheduleState(tripDays, tripStorage.statuses, now), [now, tripDays, tripStorage.statuses]);
  const phase = useMemo(() => getTripPhase(now), [now]);
  const countdown = useMemo(() => getDepartureCountdown(now), [now]);
  const selectedTimelineDay = selectedDayId ? tripDays.find((tripDay) => tripDay.id === selectedDayId) : undefined;
  const timelineDays = selectedTimelineDay ? [selectedTimelineDay] : tripDays;

  useEffect(() => {
    warnUnknownStatusReferences(tripDays, tripStorage.statuses);
  }, [tripDays, tripStorage.statuses]);

  function openTab(tab: AppTab) {
    setSelectedDayId(null);
    setActiveTab(tab);
    updateRouteHash(tab);
  }

  function openDashboard() {
    setSelectedDayId(null);
    setActiveTab('today');
    updateRouteHash('today');
  }

  function openDashboardDay(dayId: string) {
    setSelectedDayId(dayId);
    setActiveTab('days');
    updateRouteHash('days', dayId);
  }

  function openDashboardTab(tab: Extract<AppTab, 'reservations'>) {
    setSelectedDayId(null);
    setActiveTab(tab);
    updateRouteHash(tab);
  }

  function openEditItem(dayId: string, item: TripItem) {
    const day = tripDays.find((tripDay) => tripDay.id === dayId);
    setEditor({
      mode: 'edit',
      dayId,
      item,
      draft: toEditableFields(item, day?.date ?? dayId),
    });
  }

  function openAddItem(dayId: string) {
    setAddChoice({ dayId });
  }

  function openGenericAddItem(dayId: string) {
    setEditor({
      mode: 'add',
      dayId,
      draft: {
        date: dayId,
        time: '',
        endTime: '',
        title: '',
        location: '',
        notes: '',
        category: 'park',
        placement: { mode: 'end' },
        type: 'scheduled',
      },
    });
  }

  function openTravelAddItem(dayId: string) {
    setEditor({
      mode: 'add',
      dayId,
      draft: {
        date: dayId,
        time: '',
        endTime: '',
        title: '',
        from: '',
        to: '',
        location: '',
        notes: '',
        category: 'transport',
        placement: { mode: 'end' },
        type: 'scheduled',
      },
    });
  }

  function openLandCardAdd(dayId: string) {
    setLandCardAdd({
      dayId,
      land: '',
      time: '',
      endTime: '',
      notes: '',
      placement: { mode: 'end' },
      activities: [
        {
          id: `draft-activity-${Date.now()}`,
          isNew: true,
          draft: {
            title: '',
            location: '',
            notes: '',
            lightningLaneTime: '',
            lightningLaneEndTime: '',
            lightningLaneLabel: '',
          },
        },
      ],
    });
  }

  function chooseAddType(choice: 'land' | 'reservation' | 'travel' | 'generic') {
    if (!addChoice) return;
    const { dayId } = addChoice;
    setAddChoice(null);

    if (choice === 'land') {
      openLandCardAdd(dayId);
      return;
    }

    if (choice === 'reservation') {
      const day = tripDays.find((tripDay) => tripDay.id === dayId);
      setEditor({
        mode: 'add',
        dayId,
        draft: {
          date: day?.date ?? dayId,
          time: '',
          endTime: '',
          title: '',
          location: '',
          area: day?.location ?? '',
          confirmationNumber: '',
          notes: '',
          type: 'reservation',
        },
      });
      return;
    }

    if (choice === 'travel') {
      openTravelAddItem(dayId);
      return;
    }

    openGenericAddItem(dayId);
  }

  function openReservationAddOptions(dayId?: string) {
    setReservationAddChoice({ dayId });
  }

  function openAddReservation(dateOrDayId?: string) {
    const day = dateOrDayId ? tripDays.find((tripDay) => tripDay.id === dateOrDayId || tripDay.date === dateOrDayId) : activeState.day;
    const targetDay = day ?? activeState.day;
    const targetDate = day?.date ?? dateOrDayId ?? activeState.day.date;
    setEditor({
      mode: 'add',
      dayId: targetDay.id,
      draft: {
        date: targetDate,
        time: '',
        endTime: '',
        title: '',
        location: '',
        area: targetDay.location,
        confirmationNumber: '',
        notes: '',
        type: 'reservation',
      },
    });
  }

  function chooseReservationAddType() {
    if (!reservationAddChoice) return;
    const { dayId } = reservationAddChoice;
    setReservationAddChoice(null);
    openAddReservation(dayId);
  }

  function chooseReservationDayCardAdd() {
    const day = reservationAddChoice?.dayId ? tripDays.find((tripDay) => tripDay.id === reservationAddChoice.dayId || tripDay.date === reservationAddChoice.dayId) : undefined;
    setReservationAddChoice(null);
    setReservationDayCardAdd({
      date: day?.date ?? activeState.day.date,
      title: '',
      notes: '',
    });
  }

  function saveReservationDayCard() {
    if (!reservationDayCardAdd) return;
    const date = reservationDayCardAdd.date;
    if (!date) {
      window.alert('Date is required.');
      return;
    }

    const existingCard = tripStorage.reservationDayCards[date];
    const title = reservationDayCardAdd.title.trim();
    const notes = reservationDayCardAdd.notes.trim();

    tripStorage.saveReservationDayCard({
      id: existingCard?.id ?? `reservation-day-card-${date}`,
      date,
      title: title || existingCard?.title || undefined,
      notes: notes || existingCard?.notes,
    });
    setReservationDayCardAdd(null);
  }

  function openLandEditor(day: TripDay, item: TimelineActivityBlock, group: TimelineLandGroup) {
    const canEditParentDetails = group.activities.length >= item.activities.length;
    setLandEditor({
      dayId: day.id,
      groupId: group.groupId,
      parentItem: item,
      land: group.land,
      notes: canEditParentDetails ? item.notes ?? '' : '',
      canEditParentDetails,
      activities: group.activities.map((activity) => ({
        id: activity.id,
        draft: {
          ...toEditableActivityFields(activity),
          landGroupId: group.groupId,
          displayOrder: item.activities.findIndex((candidate) => candidate.id === activity.id),
        },
      })),
    });
  }

  function getLandEditorOrderState() {
    if (!landEditor) return undefined;

    const day = tripDays.find((tripDay) => tripDay.id === landEditor.dayId);
    const item = day?.items.find((candidate): candidate is TimelineActivityBlock => candidate.id === landEditor.parentItem.id && hasTimelineActivityBlock(candidate));
    if (!day || !item) return undefined;

    const groups = groupActivitiesByLand(day, item, tripStorage.landGroupOrders);
    const index = groups.findIndex((group) => group.groupId === landEditor.groupId);
    if (index >= 0 && groups.length > 1) {
      return {
        scope: 'group' as const,
        canMoveEarlier: index > 0,
        canMoveLater: index < groups.length - 1,
        groups,
        index,
      };
    }

    const timelineUnits = day.items.map((candidate, itemIndex) => {
      const candidateGroups = hasTimelineActivityBlock(candidate) ? groupActivitiesByLand(day, candidate, tripStorage.landGroupOrders) : [];
      const singleGroup = candidateGroups.length === 1 ? candidateGroups[0] : undefined;
      return {
        itemId: candidate.id,
        groupId: singleGroup?.groupId,
        order: singleGroup ? getLandGroupOrderValue(singleGroup.groupId, itemIndex, tripStorage.landGroupOrders) : itemIndex * 1000,
      };
    });
    const timelineIndex = timelineUnits.findIndex((unit) => unit.groupId === landEditor.groupId || unit.itemId === landEditor.parentItem.id);

    return {
      scope: 'timeline' as const,
      canMoveEarlier: timelineIndex > 0,
      canMoveLater: timelineIndex >= 0 && timelineIndex < timelineUnits.length - 1,
      timelineUnits,
      index: timelineIndex,
    };
  }

  function moveLandEditorGroup(direction: -1 | 1) {
    if (!landEditor) return;

    const orderState = getLandEditorOrderState();
    if (!orderState || orderState.index < 0) return;

    const units = orderState.scope === 'group' ? orderState.groups.map((group, index) => ({
      id: group.groupId,
      order: getLandGroupOrderValue(group.groupId, index, tripStorage.landGroupOrders),
    })) : orderState.timelineUnits.map((unit, index) => ({
      id: unit.groupId ?? unit.itemId,
      order: unit.order,
      index,
    }));
    const { index } = orderState;
    if (direction < 0 && index === 0) return;
    if (direction > 0 && index === units.length - 1) return;

    const targetIndex = direction < 0 ? index - 1 : index + 1;
    const lowerNeighborIndex = direction < 0 ? targetIndex - 1 : targetIndex;
    const upperNeighborIndex = direction < 0 ? targetIndex : targetIndex + 1;
    const lowerOrder =
      lowerNeighborIndex >= 0
        ? units[lowerNeighborIndex].order
        : units[targetIndex].order - 1000;
    const upperOrder =
      upperNeighborIndex < units.length
        ? units[upperNeighborIndex].order
        : units[targetIndex].order + 1000;
    const displayOrder = (lowerOrder + upperOrder) / 2;

    tripStorage.saveLandGroupOrder(landEditor.groupId, {
      dayId: landEditor.dayId,
      parentItemId: landEditor.parentItem.id,
      displayOrder,
    });
  }

  function saveEditor() {
    if (!editor) return;
    if (!editor.draft.title.trim()) {
      window.alert('Title is required.');
      return;
    }

    if (editor.mode === 'edit') {
      tripStorage.saveItemEdit(editor.item.id, editor.draft);
    } else {
      const id = `local-${editor.dayId}-${Date.now()}`;
      const item = createItemFromFields(id, editor.draft);
      const targetDayId = item.type === 'reservation' && item.date ? item.date : editor.dayId;
      tripStorage.addItem(targetDayId, item);
    }

    setEditor(null);
  }

  function saveLandCardAdd() {
    if (!landCardAdd) return;

    const land = landCardAdd.land.trim();
    if (!land) {
      window.alert('Land / Area name is required.');
      return;
    }

    const activityDrafts = landCardAdd.activities.filter((activity) => activity.draft.title.trim() || activity.draft.notes?.trim());
    if (activityDrafts.some((activity) => !activity.draft.title.trim())) {
      window.alert('Each ride needs a title before saving.');
      return;
    }

    const blockId = `local-land-${landCardAdd.dayId}-${Date.now()}`;
    const groupId = getLandGroupId(landCardAdd.dayId, blockId, land);
    const activities = activityDrafts.map((activity, index) =>
      createActivityFromFields(`local-activity-${groupId}-${index + 1}-${Date.now()}`, {
        ...activity.draft,
        landGroupId: groupId,
        title: activity.draft.title.trim(),
        location: land,
        time: '',
        endTime: '',
        displayOrder: index,
      }),
    );

    const item: TripItem = {
      id: blockId,
      type: 'flexible',
      time: landCardAdd.time || undefined,
      endTime: landCardAdd.endTime || undefined,
      title: `${land} activities`,
      area: land,
      location: land,
      notes: landCardAdd.notes.trim() || undefined,
      placement: landCardAdd.placement,
      activities,
    };

    tripStorage.addItem(landCardAdd.dayId, item);
    setLandCardAdd(null);
  }

  function requestItemDelete(itemId: string, title: string) {
    setItemDelete({ itemId, title });
  }

  function requestEditorItemDelete() {
    if (!editor || editor.mode !== 'edit') return;
    requestItemDelete(editor.item.id, editor.item.title);
  }

  function confirmItemDelete() {
    if (!itemDelete) return;
    tripStorage.deleteItem(itemDelete.itemId);
    if (editor?.mode === 'edit' && editor.item.id === itemDelete.itemId) {
      setEditor(null);
    }
    setItemDelete(null);
  }

  function cancelItemDelete() {
    setItemDelete(null);
  }

  function deleteEditorItem() {
    if (!editor || editor.mode !== 'edit') return;
    requestEditorItemDelete();
  }

  function confirmLandDelete() {
    if (!landDelete) return;

    const activityIds = landDelete.group.activities.map((activity) => activity.id);
    tripStorage.deleteLandGroup(landDelete.dayId, landDelete.parentItem.id, landDelete.group.groupId, activityIds);

    if (landDelete.group.activities.length >= landDelete.parentItem.activities.length) {
      tripStorage.deleteItem(landDelete.parentItem.id);
    }

    setLandDelete(null);
    setLandEditor(null);
  }

  function requestLandDeleteFromEditor() {
    if (!landEditor) return;

    setLandDelete({
      dayId: landEditor.dayId,
      parentItem: landEditor.parentItem,
      group: {
        groupId: landEditor.groupId,
        land: landEditor.land,
        activities: landEditor.activities.map((activity) => createActivityFromFields(activity.id, activity.draft)),
      },
    });
  }

  function saveLandEditor() {
    if (!landEditor) return;

    const land = landEditor.land.trim();
    if (!land) {
      window.alert('Land / Area name is required.');
      return;
    }

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
        if (!activity.isNew) tripStorage.deleteActivity(landEditor.dayId, landEditor.parentItem.id, activity.id, landEditor.groupId);
        return;
      }

      const currentIndex = visibleActivities.findIndex((candidate) => candidate.id === activity.id);
      const draft = {
        ...activity.draft,
        landGroupId: landEditor.groupId,
        title: activity.draft.title.trim(),
        location: land,
        time: '',
        endTime: '',
        lightningLaneStart: activity.draft.lightningLaneTime ?? activity.draft.lightningLaneStart,
        lightningLaneEnd: activity.draft.lightningLaneEndTime ?? activity.draft.lightningLaneEnd,
        displayOrder: baseDisplayOrder + currentIndex,
      };
      const savedActivity = createActivityFromFields(activity.id, draft);

      console.log('Ride edit payload saved', {
        dayId: landEditor.dayId,
        groupId: landEditor.groupId,
        parentItemId: landEditor.parentItem.id,
        activityId: activity.id,
        action: activity.isNew ? 'add' : 'edit',
        payload: activity.isNew ? savedActivity : draft,
      });

      if (activity.isNew) {
        tripStorage.addActivity(landEditor.dayId, landEditor.parentItem.id, savedActivity, landEditor.groupId);
      } else {
        tripStorage.saveActivityEdit(landEditor.dayId, landEditor.parentItem.id, activity.id, draft, landEditor.groupId);
      }
    });

    if (landEditor.canEditParentDetails) {
      tripStorage.saveItemEdit(landEditor.parentItem.id, {
        ...toEditableFields(landEditor.parentItem, landEditor.dayId),
        title: `${land} activities`,
        location: land,
        notes: landEditor.notes.trim(),
        type: landEditor.parentItem.type,
      });
    }

    setLandEditor(null);
  }

  return (
    <div className="relative min-h-screen text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 bg-cover bg-[center_top] bg-no-repeat"
        style={{ backgroundImage: `url('${import.meta.env.BASE_URL}disneymayhem-background.jpg')` }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[1] bg-[linear-gradient(to_bottom,rgba(0,0,0,0.12),rgba(0,0,0,0.38))]"
      />
      <div key={`${activeTab}-${selectedDayId ?? 'all'}`} className={`screen-fade relative z-10 mx-auto max-w-4xl ${phase === 'before' ? 'pb-8' : 'pb-20'}`}>
        {phase === 'before' && activeTab !== 'today' && activeTab !== 'days' && activeTab !== 'reservations' ? (
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
          />
        ) : null}
        {activeTab === 'days' ? (
          <AllDaysScreen
            days={timelineDays}
            statuses={tripStorage.statuses}
            landGroupOrders={tripStorage.landGroupOrders}
            onCycleStatus={tripStorage.cycleStatus}
            onEditItem={openEditItem}
            onAddItem={openAddItem}
            onEditLand={openLandEditor}
            onBackToDashboard={selectedTimelineDay ? openDashboard : undefined}
          />
        ) : null}
        {activeTab === 'attention' ? <AttentionScreen statuses={tripStorage.statuses} attentionItems={attentionItems} onEditItem={openEditItem} /> : null}
        {activeTab === 'reservations' ? (
          <ReservationsScreen
            reservations={reservations}
            reservationDayCards={tripStorage.reservationDayCards}
            onEditItem={openEditItem}
            onOpenAddOptions={() => openReservationAddOptions()}
            onAddReservationForDay={openAddReservation}
            onBackToDashboard={openDashboard}
          />
        ) : null}
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
      {addChoice ? (
        <AddChoiceSheet
          day={tripDays.find((day) => day.id === addChoice.dayId) ?? activeState.day}
          onChoose={chooseAddType}
          onCancel={() => setAddChoice(null)}
        />
      ) : null}
      {reservationAddChoice ? (
        <ReservationAddChoiceSheet
          day={reservationAddChoice.dayId ? tripDays.find((day) => day.id === reservationAddChoice.dayId) : undefined}
          onChooseReservation={chooseReservationAddType}
          onChooseDayCard={chooseReservationDayCardAdd}
          onCancel={() => setReservationAddChoice(null)}
        />
      ) : null}
      {reservationDayCardAdd ? (
        <ReservationDayCardSheet
          draft={reservationDayCardAdd}
          onChange={setReservationDayCardAdd}
          onSave={saveReservationDayCard}
          onCancel={() => setReservationDayCardAdd(null)}
        />
      ) : null}
      {landCardAdd ? (
        <AddLandCardSheet
          editor={landCardAdd}
          day={tripDays.find((day) => day.id === landCardAdd.dayId) ?? activeState.day}
          onChange={setLandCardAdd}
          onSave={saveLandCardAdd}
          onCancel={() => setLandCardAdd(null)}
        />
      ) : null}
      {landEditor ? (
        <LandEditorSheet
          editor={landEditor}
          orderState={getLandEditorOrderState()}
          onChange={setLandEditor}
          onSave={saveLandEditor}
          onCancel={() => setLandEditor(null)}
          onDelete={requestLandDeleteFromEditor}
          onMoveEarlier={() => moveLandEditorGroup(-1)}
          onMoveLater={() => moveLandEditorGroup(1)}
        />
      ) : null}
      {landDelete ? (
        <DeleteLandCardSheet
          land={landDelete.group.land}
          onCancel={() => setLandDelete(null)}
          onDelete={confirmLandDelete}
        />
      ) : null}
      {itemDelete ? (
        <DeleteItemSheet
          title={itemDelete.title}
          onCancel={cancelItemDelete}
          onDelete={confirmItemDelete}
        />
      ) : null}
    </div>
  );
}
