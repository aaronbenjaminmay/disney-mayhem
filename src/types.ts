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

export type ItemPlacement = {
  mode: 'before' | 'after' | 'end';
  targetItemId?: string;
};

export type Activity = {
  id: string;
  landGroupId?: string;
  title: string;
  location: string;
  notes?: string;
  time?: string;
  endTime?: string;
  lightningLaneTime?: string;
  lightningLaneEndTime?: string;
  lightningLaneStart?: string;
  lightningLaneEnd?: string;
  lightningLaneLabel?: string;
  displayOrder?: number;
  needsAttention?: boolean;
};

export type ScheduledItem = {
  id: string;
  type: 'scheduled';
  time?: string;
  endTime?: string;
  title: string;
  location: string;
  from?: string;
  to?: string;
  area?: string;
  activities?: Activity[];
  category: ScheduledCategory;
  notes?: string;
  needsAttention?: boolean;
  placement?: ItemPlacement;
};

export type ReservationItem = {
  id: string;
  type: 'reservation';
  date: string;
  time: string;
  endTime?: string;
  title: string;
  location: string;
  area?: string;
  confirmationNumber?: string;
  notes?: string;
  category: 'reservation';
  needsAttention?: boolean;
  placement?: ItemPlacement;
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
  placement?: ItemPlacement;
};

export type TripItem = ScheduledItem | ReservationItem | FlexibleBlock;

export type LandBlockActivity = Activity & {
  sourceItemId: string;
  sourceItemTitle: string;
  sourceItemTime?: string;
  sourceItemEndTime?: string;
  sourceItemNotes?: string;
  sourceItemNeedsAttention?: boolean;
};

export type LandBlock = {
  id: string;
  land: string;
  activities: LandBlockActivity[];
  sourceItemIds: string[];
  time?: string;
  endTime?: string;
  notes?: string;
  needsAttention?: boolean;
};

export type TripDay = {
  id: string;
  date: string;
  label: string;
  park: ParkName;
  location: string;
  notes?: string;
  items: TripItem[];
  scheduledItems?: ScheduledItem[];
  landBlocks?: LandBlock[];
};

export type PersistedState = {
  statuses: Record<string, ItemStatus>;
  itemEdits: Record<string, EditableItemFields>;
  addedItems: Record<string, TripItem[]>;
  deletedItemIds: string[];
  activityEdits: Record<string, EditableActivityFields>;
  addedActivities: Record<string, Activity[]>;
  deletedActivityIds: string[];
  deletedLandGroupIds: string[];
};

export type EditableItemFields = {
  date?: string;
  time?: string;
  endTime?: string;
  title: string;
  location: string;
  from?: string;
  to?: string;
  area?: string;
  confirmationNumber?: string;
  notes?: string;
  category?: ScheduledCategory;
  placement?: ItemPlacement;
  type: TripItem['type'];
};

export type EditableActivityFields = {
  landGroupId?: string;
  title: string;
  location: string;
  notes?: string;
  time?: string;
  endTime?: string;
  lightningLaneTime?: string;
  lightningLaneEndTime?: string;
  lightningLaneStart?: string;
  lightningLaneEnd?: string;
  lightningLaneLabel?: string;
  displayOrder?: number;
};

export type ActiveScheduleState = {
  day: TripDay;
  activeItem?: TripItem;
  nextItem?: TripItem;
  nextActivity?: Activity;
  upcomingItems: TripItem[];
  isToday: boolean;
};
