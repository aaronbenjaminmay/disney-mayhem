import type { Activity, EditableActivityFields, EditableItemFields, ItemPlacement, ReservationItem, ScheduledItem, TripDay, TripItem } from '../types';
import { getActivityLand, getLandGroupId, slugifyLandGroupPart, withTripDayGroups } from './landBlocks';
import { getItemStart } from './time';

const warnedPersistenceIds = new Set<string>();

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

export function toEditableFields(item: TripItem, dayDate?: string): EditableItemFields {
  return {
    date: item.type === 'reservation' ? item.date : dayDate,
    time: item.time ?? '',
    endTime: item.endTime ?? '',
    title: item.title,
    location: item.location,
    from: item.type === 'scheduled' ? item.from ?? '' : '',
    to: item.type === 'scheduled' ? item.to ?? '' : '',
    area: item.type === 'reservation' ? item.area ?? '' : '',
    confirmationNumber: item.type === 'reservation' ? item.confirmationNumber ?? '' : '',
    notes: item.notes ?? '',
    category: item.type === 'scheduled' ? item.category : undefined,
    placement: item.placement,
    type: isReservationItem(item) ? 'reservation' : item.type,
  };
}

export function createItemFromFields(id: string, fields: EditableItemFields): TripItem {
  const time = fields.time?.trim();
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
    confirmationNumber: fields.confirmationNumber?.trim() || undefined,
    notes: fields.notes?.trim() || undefined,
    placement: fields.placement,
  };

  if (fields.type === 'reservation') {
    return {
      ...base,
      type: 'reservation',
      date: fields.date || '',
      time: time || '09:00',
      category: 'reservation',
    } satisfies ReservationItem;
  }

  if (fields.type === 'flexible') {
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
  if (!fields) return item;

  const updated = createItemFromFields(item.id, fields);
  const existingActivities = 'activities' in item && Array.isArray(item.activities) ? item.activities : undefined;

  if (updated.type === 'flexible' && existingActivities) {
    return {
      ...item,
      ...updated,
      area: fields.location.trim() || ('area' in item ? item.area : undefined) || item.location || 'Flexible block',
      activities: existingActivities,
    };
  }

  if (updated.type === 'scheduled' && existingActivities) {
    return {
      ...item,
      ...updated,
      area: 'area' in item ? item.area : undefined,
      activities: existingActivities,
      category: updated.category,
    };
  }

  if (updated.type === 'scheduled' && item.type === 'scheduled') {
    return {
      ...item,
      ...updated,
      category: item.category,
    } satisfies ScheduledItem;
  }

  if (updated.type === 'reservation') {
    return {
      ...updated,
      date: updated.date || fields.date || '',
      category: 'reservation',
    } satisfies ReservationItem;
  }

  return updated;
}

function getItemTargetDayId(item: TripItem, sourceDayId: string, fields?: EditableItemFields): string {
  if (fields?.date) return fields.date;
  if (item.type === 'reservation' && item.date) return item.date;
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
    if (activity.landGroupId?.startsWith(groupPrefix) && activity.landGroupId === inferredGroupId) return activity.landGroupId;
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
      const hasMismatchedBaseGroup = Boolean(!activity.landGroupId && editGroupId && editGroupId !== expectedGroupId);
      const safeFields = hasMismatchedBaseGroup
        ? {
            ...fields,
            landGroupId: expectedGroupId,
            location: getActivityLand(day.park, activityBlock, activity),
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

  Object.entries(addedItems).forEach(([sourceDayId, items]) => {
    items
      .filter((item) => !deleted.has(item.id))
      .forEach((item) => {
        const fields = itemEdits[item.id];
        const updated = applyEdit(item, fields);
        const targetDayId = getItemTargetDayId(updated, sourceDayId, fields);
        itemsByDay.set(targetDayId, insertAddedItem(itemsByDay.get(targetDayId) ?? [], updated));
      });
  });

  return baseDays.map((day) => {
    const items = (itemsByDay.get(day.id) ?? [])
      .map((item) => applyActivityEdits(day, item, activityEdits, addedActivities, deletedActivities, deletedLandGroups))
      .filter((item) => !('activities' in item) || !Array.isArray(item.activities) || item.activities.length > 0);

    return withTripDayGroups({
      ...day,
      items,
    });
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
