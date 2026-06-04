import type { Activity, EditableActivityFields, EditableItemFields, ItemPlacement, LandGroupOrder, ReservationItem, ScheduledItem, TripDay, TripItem } from '../types';
import { getActivityLand, getLandGroupId, isDifferentKnownParkLand, slugifyLandGroupPart, withTripDayGroups } from './landBlocks';
import { getItemStart } from './time';

const warnedPersistenceIds = new Set<string>();
const validItemTypes = new Set(['scheduled', 'reservation', 'flexible']);

function warnUnknownPersistenceReference(kind: string, id: string, detail?: Record<string, unknown>) {
  const warningKey = `${kind}:${id}`;
  if (warnedPersistenceIds.has(warningKey)) return;

  warnedPersistenceIds.add(warningKey);
  console.warn('Disney Mayhem persistence warning: saved edit references an unknown itinerary ID', {
    kind,
    id,
    ...detail,
  });
}

export function isReservationItem(item: TripItem): item is ReservationItem | ScheduledItem {
  return item.type === 'reservation' || (item.type === 'scheduled' && item.category === 'reservation');
}

function hasMeaningfulConfirmationNumber(item: TripItem): boolean {
  return 'confirmationNumber' in item && typeof item.confirmationNumber === 'string' && item.confirmationNumber.trim().length > 0;
}

function isKnownItemType(value: unknown): value is TripItem['type'] {
  return typeof value === 'string' && validItemTypes.has(value);
}

function getSafeItemType(value: unknown, fallback: TripItem['type'], id?: string): TripItem['type'] {
  if (isKnownItemType(value)) return value;

  if (id) {
    warnUnknownPersistenceReference('unknown item type', id, { type: value, fallback });
  }

  return fallback;
}

function getCanonicalItemType(fields: EditableItemFields, id?: string): TripItem['type'] {
  const itemType = getSafeItemType(fields.type, 'scheduled', id);

  if (itemType === 'reservation' && fields.category && fields.category !== 'reservation') {
    if (id) {
      warnUnknownPersistenceReference('incompatible reservation edit', id, {
        type: fields.type,
        category: fields.category,
        fallback: 'scheduled',
      });
    }

    return 'scheduled';
  }

  return itemType;
}

function getNormalizedFallbackType(item: TripItem): TripItem['type'] {
  return 'activities' in item && Array.isArray(item.activities) ? 'flexible' : 'scheduled';
}

function isEmptyFlexibleItem(item: TripItem): boolean {
  return item.type === 'flexible' && (!Array.isArray(item.activities) || item.activities.length === 0);
}

function normalizeTripItem(item: TripItem): TripItem {
  const runtimeItem = item as TripItem & { type?: unknown; category?: unknown; area?: unknown };
  if (isKnownItemType(runtimeItem.type)) return item;

  const fallback = getNormalizedFallbackType(item);
  warnUnknownPersistenceReference('unknown item type', item.id, { type: runtimeItem.type, fallback });

  if (fallback === 'flexible') {
    return {
      ...item,
      type: 'flexible',
      area: typeof runtimeItem.area === 'string' ? runtimeItem.area : item.location || 'Flexible block',
      location: item.location || (typeof runtimeItem.area === 'string' ? runtimeItem.area : ''),
      activities: 'activities' in item && Array.isArray(item.activities) ? item.activities : [],
    };
  }

  return {
    ...item,
    type: 'scheduled',
    location: item.location || '',
    category: typeof runtimeItem.category === 'string' ? runtimeItem.category as ScheduledItem['category'] : 'park',
  };
}

export function toEditableFields(item: TripItem, dayDate?: string): EditableItemFields {
  const reservationLike = isReservationItem(item) || hasMeaningfulConfirmationNumber(item);
  const editableType = reservationLike
    ? 'reservation'
    : isEmptyFlexibleItem(item)
      ? 'scheduled'
      : getSafeItemType((item as TripItem & { type?: unknown }).type, getNormalizedFallbackType(item), item.id);

  return {
    date: item.type === 'reservation' ? item.date : dayDate,
    time: item.time ?? '',
    endTime: item.endTime ?? '',
    title: item.title,
    location: item.location,
    from: item.type === 'scheduled' ? item.from ?? '' : '',
    to: item.type === 'scheduled' ? item.to ?? '' : '',
    area: 'area' in item ? item.area ?? '' : '',
    confirmationNumber: reservationLike && 'confirmationNumber' in item ? item.confirmationNumber ?? '' : '',
    notes: item.notes ?? '',
    category: item.type === 'scheduled' ? item.category : undefined,
    placement: item.placement,
    type: editableType,
  };
}

export function createItemFromFields(id: string, fields: EditableItemFields): TripItem {
  const time = fields.time?.trim();
  const itemType = getCanonicalItemType(fields, id);
  const base = {
    id,
    date: fields.date,
    time: time || undefined,
    endTime: fields.endTime?.trim() || undefined,
    title: fields.title.trim() || 'New item',
    location: fields.location.trim(),
    from: fields.from?.trim() || undefined,
    to: fields.to?.trim() || undefined,
    area: fields.area?.trim() || undefined,
    notes: fields.notes?.trim() || undefined,
    placement: fields.placement,
  };

  if (itemType === 'reservation') {
    return {
      ...base,
      type: 'reservation',
      date: fields.date || '',
      time: time || '09:00',
      confirmationNumber: fields.confirmationNumber?.trim() || undefined,
      category: 'reservation',
    } satisfies ReservationItem;
  }

  if (itemType === 'flexible') {
    return {
      ...base,
      type: 'flexible',
      area: fields.location.trim() || 'Flexible block',
      activities: [],
    };
  }

  return {
    ...base,
    type: 'scheduled',
    time: time || undefined,
    category: fields.category ?? 'park',
  };
}

function applyEdit(item: TripItem, fields?: EditableItemFields): TripItem {
  const runtimeTypeKnown = isKnownItemType((item as TripItem & { type?: unknown }).type);
  const safeItem = normalizeTripItem(item);
  if (!fields) return safeItem;

  const preservedType = isEmptyFlexibleItem(safeItem)
    ? 'scheduled'
    : runtimeTypeKnown
    ? getSafeItemType(safeItem.type, getNormalizedFallbackType(safeItem), safeItem.id)
    : getSafeItemType(fields.type, getNormalizedFallbackType(safeItem), safeItem.id);
  const safeFields = {
    ...fields,
    type: preservedType,
  };
  const updated = createItemFromFields(safeItem.id, safeFields);
  const existingActivities = 'activities' in safeItem && Array.isArray(safeItem.activities) ? safeItem.activities : undefined;

  if (updated.type === 'flexible' && existingActivities?.length) {
    return {
      ...safeItem,
      ...updated,
      area: fields.location.trim() || ('area' in safeItem ? safeItem.area : undefined) || safeItem.location || 'Flexible block',
      activities: existingActivities,
    };
  }

  if (updated.type === 'scheduled' && existingActivities?.length) {
    return {
      ...safeItem,
      ...updated,
      area: 'area' in safeItem ? safeItem.area : undefined,
      activities: existingActivities,
      category: updated.category,
    };
  }

  if (updated.type === 'scheduled' && safeItem.type === 'scheduled') {
    return {
      ...safeItem,
      ...updated,
      category: safeItem.category,
    } satisfies ScheduledItem;
  }

  if (updated.type === 'scheduled') {
    return updated;
  }

  if (updated.type === 'reservation') {
    return {
      ...updated,
      date: updated.date || safeFields.date || '',
      category: 'reservation',
    } satisfies ReservationItem;
  }

  return updated;
}

function getItemTargetDayId(item: TripItem, sourceDayId: string, fields?: EditableItemFields): string {
  if (fields?.date) return fields.date;
  const safeItem = normalizeTripItem(item);
  if (safeItem.type === 'reservation' && safeItem.date) return safeItem.date;
  return sourceDayId;
}

function getPlacementIndex(items: TripItem[], placement?: ItemPlacement): number {
  if (!placement || placement.mode === 'end' || !placement.targetItemId) return items.length;

  const targetIndex = items.findIndex((item) => item.id === placement.targetItemId);
  if (targetIndex < 0) return items.length;
  return placement.mode === 'before' ? targetIndex : targetIndex + 1;
}

function insertAddedItem(items: TripItem[], item: TripItem): TripItem[] {
  const nextItems = [...items];

  if (item.time) {
    const itemStart = getItemStart(item);
    const timeIndex = nextItems.findIndex((candidate) => candidate.time && getItemStart(candidate) > itemStart);
    if (timeIndex >= 0) {
      nextItems.splice(timeIndex, 0, item);
      return nextItems;
    }
  }

  nextItems.splice(getPlacementIndex(nextItems, item.placement), 0, item);
  return nextItems;
}

function getItemLandGroupIds(day: TripDay, item: TripItem): string[] {
  if (!('activities' in item) || !Array.isArray(item.activities)) return [];
  const activityBlock = item as TripItem & { activities: Activity[]; area?: string };
  const groupPrefix = `${getLandGroupId(day.id, item.id, '').replace(/__land$/, '')}__`;

  if (item.activities.length === 0) {
    const land = activityBlock.area || item.location;
    return [getLandGroupId(day.id, item.id, land)];
  }

  return [
    ...new Set(
      item.activities.map((activity) => {
        const inferredLand = getActivityLand(day.park, activityBlock, activity);
        const inferredGroupId = getLandGroupId(day.id, item.id, inferredLand);
        const hasStableGroup = activity.landGroupId?.startsWith(groupPrefix);
        const hasConflictingStableGroup = Boolean(hasStableGroup && activity.landGroupId && activity.landGroupId !== inferredGroupId && isDifferentKnownParkLand(day.park, inferredLand, activity.location));
        return hasStableGroup && activity.landGroupId && !hasConflictingStableGroup ? activity.landGroupId : inferredGroupId;
      }),
    ),
  ];
}

function applySingleLandItemOrder(day: TripDay, items: TripItem[], landGroupOrders: Record<string, LandGroupOrder>): TripItem[] {
  return [...items].sort((left, right) => {
    const leftIndex = items.findIndex((item) => item.id === left.id);
    const rightIndex = items.findIndex((item) => item.id === right.id);
    const leftGroups = getItemLandGroupIds(day, left);
    const rightGroups = getItemLandGroupIds(day, right);
    const leftOrder = leftGroups.length === 1 ? landGroupOrders[leftGroups[0]]?.displayOrder : undefined;
    const rightOrder = rightGroups.length === 1 ? landGroupOrders[rightGroups[0]]?.displayOrder : undefined;

    if (leftOrder === undefined && rightOrder === undefined) return leftIndex - rightIndex;
    return (leftOrder ?? leftIndex * 1000) - (rightOrder ?? rightIndex * 1000) || leftIndex - rightIndex;
  });
}

export function toEditableActivityFields(activity: Activity): EditableActivityFields {
  return {
    landGroupId: activity.landGroupId,
    title: activity.title,
    location: activity.location,
    notes: activity.notes ?? '',
    time: activity.time ?? '',
    endTime: activity.endTime ?? '',
    lightningLaneTime: activity.lightningLaneTime ?? activity.lightningLaneStart ?? '',
    lightningLaneEndTime: activity.lightningLaneEndTime ?? activity.lightningLaneEnd ?? '',
    lightningLaneStart: activity.lightningLaneStart ?? activity.lightningLaneTime ?? '',
    lightningLaneEnd: activity.lightningLaneEnd ?? activity.lightningLaneEndTime ?? '',
    lightningLaneLabel: activity.lightningLaneLabel ?? '',
    displayOrder: activity.displayOrder,
  };
}

export function createActivityFromFields(id: string, fields: EditableActivityFields): Activity {
  return {
    id,
    landGroupId: fields.landGroupId,
    title: fields.title.trim(),
    location: fields.location.trim(),
    notes: fields.notes?.trim() || undefined,
    time: fields.time || undefined,
    endTime: fields.endTime || undefined,
    lightningLaneTime: fields.lightningLaneTime || fields.lightningLaneStart || undefined,
    lightningLaneEndTime: fields.lightningLaneEndTime || fields.lightningLaneEnd || undefined,
    lightningLaneStart: fields.lightningLaneStart || fields.lightningLaneTime || undefined,
    lightningLaneEnd: fields.lightningLaneEnd || fields.lightningLaneEndTime || undefined,
    lightningLaneLabel: fields.lightningLaneLabel?.trim() || undefined,
    displayOrder: fields.displayOrder,
  };
}

function applyActivityEdits(
  day: TripDay,
  item: TripItem,
  activityEdits: Record<string, EditableActivityFields>,
  addedActivities: Record<string, Activity[]>,
  deletedActivityIds: Set<string>,
  deletedLandGroupIds: Set<string>,
): TripItem {
  if (!('activities' in item) || !Array.isArray(item.activities)) return item;
  const activityBlock = item as TripItem & { activities: Activity[]; area?: string };
  const parentGroupMarker = `__${slugifyLandGroupPart(item.id)}__`;
  const groupPrefix = `${getLandGroupId(day.id, item.id, '').replace(/__land$/, '')}__`;
  const baseActivityIds = new Set(item.activities.map((activity) => activity.id));
  const getActivityGroupId = (activity: Activity) => {
    const inferredGroupId = getLandGroupId(day.id, item.id, getActivityLand(day.park, activityBlock, activity));
    const inferredLand = getActivityLand(day.park, activityBlock, activity);
    if (activity.landGroupId?.startsWith(groupPrefix) && (activity.landGroupId === inferredGroupId || !isDifferentKnownParkLand(day.park, inferredLand, activity.location))) return activity.landGroupId;
    return inferredGroupId;
  };
  const groupedAddedActivities = Object.entries(addedActivities)
    .filter(([groupId]) => groupId !== item.id && groupId.includes(parentGroupMarker))
    .filter(([groupId]) => !deletedLandGroupIds.has(groupId))
    .flatMap(([, activities]) => activities);

  const activities = [
    ...new Map(
      [
        ...item.activities.filter((activity) => !deletedActivityIds.has(activity.id) && !deletedLandGroupIds.has(getActivityGroupId(activity))),
        ...(addedActivities[item.id] ?? []).filter((activity) => !baseActivityIds.has(activity.id) && !deletedActivityIds.has(activity.id) && !deletedLandGroupIds.has(getActivityGroupId(activity))),
        ...groupedAddedActivities.filter((activity) => !baseActivityIds.has(activity.id) && !deletedActivityIds.has(activity.id) && !deletedLandGroupIds.has(getActivityGroupId(activity))),
      ].map((activity) => [activity.id, activity]),
    ).values(),
  ]
    .map((activity) => {
      const fields = activityEdits[activity.id];
      if (!fields) return activity;

      const expectedGroupId = getActivityGroupId(activity);
      const editGroupId = fields.landGroupId;
      const inferredLand = getActivityLand(day.park, activityBlock, activity);
      const hasMismatchedBaseGroup = Boolean(!activity.landGroupId && editGroupId && editGroupId !== expectedGroupId && isDifferentKnownParkLand(day.park, inferredLand, fields.location));
      const safeFields = hasMismatchedBaseGroup
        ? {
            ...fields,
            landGroupId: expectedGroupId,
            location: inferredLand,
          }
        : fields;

      if (hasMismatchedBaseGroup) {
        warnUnknownPersistenceReference('ambiguous land group edit', `${activity.id} -> ${editGroupId}`);
      }

      const mergedActivity = { ...activity, ...createActivityFromFields(activity.id, safeFields) };
      console.log('Merge result for edited ride', {
        activityId: activity.id,
        payload: safeFields,
        mergedActivity,
      });
      return mergedActivity;
    })
    .sort((left, right) => {
      const leftOrder = left.displayOrder ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = right.displayOrder ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder;
    });

  return {
    ...item,
    activities,
  } as TripItem;
}

export function mergeTripEdits(
  baseDays: TripDay[],
  itemEdits: Record<string, EditableItemFields>,
  addedItems: Record<string, TripItem[]>,
  deletedItemIds: string[],
  activityEdits: Record<string, EditableActivityFields> = {},
  addedActivities: Record<string, Activity[]> = {},
  deletedActivityIds: string[] = [],
  deletedLandGroupIds: string[] = [],
  landGroupOrders: Record<string, LandGroupOrder> = {},
): TripDay[] {
  const deleted = new Set(deletedItemIds);
  const deletedActivities = new Set(deletedActivityIds);
  const deletedLandGroups = new Set(deletedLandGroupIds);
  const itemsByDay = new Map<string, TripItem[]>();
  const knownDayIds = new Set(baseDays.map((day) => day.id));
  const knownItemIds = new Set<string>();
  const knownActivityIds = new Set<string>();

  baseDays.forEach((day) => {
    itemsByDay.set(day.id, []);
    day.items.forEach((item) => {
      knownItemIds.add(item.id);
      if ('activities' in item && Array.isArray(item.activities)) {
        item.activities.forEach((activity) => knownActivityIds.add(activity.id));
      }
    });
  });

  Object.entries(addedItems).forEach(([dayId, items]) => {
    if (!knownDayIds.has(dayId)) {
      warnUnknownPersistenceReference('added item day', dayId);
    }

    items.forEach((item) => {
      knownItemIds.add(item.id);
      if ('activities' in item && Array.isArray(item.activities)) {
        item.activities.forEach((activity) => knownActivityIds.add(activity.id));
      }
    });
  });

  Object.entries(addedActivities).forEach(([parentItemId, activities]) => {
    const targetsKnownParent = knownItemIds.has(parentItemId);
    const targetsKnownGroup = [...knownItemIds].some((itemId) => parentItemId.includes(`__${slugifyLandGroupPart(itemId)}__`));
    if (!targetsKnownParent && !targetsKnownGroup) {
      warnUnknownPersistenceReference('added activity parent item', parentItemId);
    }

    activities.forEach((activity) => knownActivityIds.add(activity.id));
  });

  Object.keys(itemEdits).forEach((itemId) => {
    if (!knownItemIds.has(itemId)) {
      warnUnknownPersistenceReference('item edit', itemId);
    }
  });

  deletedItemIds.forEach((itemId) => {
    if (!knownItemIds.has(itemId)) {
      warnUnknownPersistenceReference('deleted item', itemId);
    }
  });

  Object.keys(activityEdits).forEach((activityId) => {
    if (!knownActivityIds.has(activityId)) {
      warnUnknownPersistenceReference('activity edit', activityId);
    }
  });

  deletedActivityIds.forEach((activityId) => {
    if (!knownActivityIds.has(activityId)) {
      warnUnknownPersistenceReference('deleted activity', activityId);
    }
  });

  deletedLandGroupIds.forEach((groupId) => {
    const targetsKnownGroup = [...knownItemIds].some((itemId) => groupId.includes(`__${slugifyLandGroupPart(itemId)}__`));
    if (!targetsKnownGroup) {
      warnUnknownPersistenceReference('deleted land group', groupId);
    }
  });

  Object.entries(landGroupOrders).forEach(([groupId, order]) => {
    const targetsKnownGroup = [...knownItemIds].some((itemId) => groupId.includes(`__${slugifyLandGroupPart(itemId)}__`));
    if (!targetsKnownGroup) {
      warnUnknownPersistenceReference('land group order', groupId, order);
    }
  });

  baseDays.forEach((day) => {
    day.items
      .filter((item) => !deleted.has(item.id))
      .forEach((item) => {
        const fields = itemEdits[item.id];
        const updated = applyEdit(item, fields);
        const targetDayId = getItemTargetDayId(updated, day.id, fields);
        itemsByDay.set(targetDayId, [...(itemsByDay.get(targetDayId) ?? []), updated]);
      });
  });

  const addedItemsById = new Map<string, { sourceDayId: string; item: TripItem }>();
  Object.entries(addedItems).forEach(([sourceDayId, items]) => {
    items.forEach((item) => {
      if (deleted.has(item.id)) return;
      addedItemsById.set(item.id, { sourceDayId, item });
    });
  });

  addedItemsById.forEach(({ sourceDayId, item }) => {
    const fields = itemEdits[item.id];
    const updated = applyEdit(normalizeTripItem(item), fields);
    const targetDayId = getItemTargetDayId(updated, sourceDayId, fields);
    const existingItems = itemsByDay.get(targetDayId) ?? [];
    const withoutDuplicate = existingItems.filter((candidate) => candidate.id !== updated.id);
    itemsByDay.set(targetDayId, insertAddedItem(withoutDuplicate, updated));
  });

  return baseDays.map((day) => {
    const items = applySingleLandItemOrder(day, (itemsByDay.get(day.id) ?? [])
      .map((item) => applyActivityEdits(day, item, activityEdits, addedActivities, deletedActivities, deletedLandGroups))
      .filter((item) => !('activities' in item) || !Array.isArray(item.activities) || item.activities.length > 0), landGroupOrders);

    return withTripDayGroups(
      {
        ...day,
        items,
      },
      landGroupOrders,
    );
  });
}

export function getReservations(days: TripDay[]) {
  return days.flatMap((day) =>
    day.items
      .filter(isReservationItem)
      .map((item) => ({ day, item })),
  ).sort((left, right) => {
    const dateCompare = left.day.date.localeCompare(right.day.date);
    return dateCompare || getItemStart(left.item) - getItemStart(right.item);
  });
}

export function getAttentionItems(days: TripDay[]) {
  return days.flatMap((day) =>
    day.items
      .filter((item) => {
        const text = `${item.title} ${item.location} ${item.notes ?? ''}`.toLowerCase();
        return (
          Boolean(item.needsAttention) ||
          text.includes('need reservation') ||
          text.includes('insert multi-pass') ||
          text.includes('add queue link')
        );
      })
      .map((item) => ({ day, item })),
  );
}
