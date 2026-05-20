export type ItemStatus = 'todo' | 'done' | 'skipped';

export type ParkName =
  | 'Travel Day'
  | 'Magic Kingdom'
  | 'EPCOT'
  | 'Hollywood Studios'
  | 'Animal Kingdom'
  | 'Resort Day';

export type ScheduledCategory =
  | 'flight'
  | 'reservation'
  | 'transport'
  | 'fireworks'
  | 'show'
  | 'break'
  | 'park'
  | 'meal'
  | 'logistics'
  | 'attention';

export type Activity = {
  id: string;
  title: string;
  location: string;
  notes?: string;
  needsAttention?: boolean;
};

export type ScheduledItem = {
  id: string;
  type: 'scheduled';
  time: string;
  endTime?: string;
  title: string;
  location: string;
  category: ScheduledCategory;
  notes?: string;
  needsAttention?: boolean;
};

export type FlexibleBlock = {
  id: string;
  type: 'flexible';
  time?: string;
  endTime?: string;
  title: string;
  area: string;
  location: string;
  activities: Activity[];
  notes?: string;
  needsAttention?: boolean;
};

export type TripItem = ScheduledItem | FlexibleBlock;

export type TripDay = {
  id: string;
  date: string;
  label: string;
  park: ParkName;
  location: string;
  notes?: string;
  items: TripItem[];
};

export type PersistedState = {
  statuses: Record<string, ItemStatus>;
  notes: Record<string, string>;
};

export type ActiveScheduleState = {
  day: TripDay;
  activeItem?: TripItem;
  nextItem?: TripItem;
  nextActivity?: Activity;
  upcomingItems: TripItem[];
  isToday: boolean;
};
