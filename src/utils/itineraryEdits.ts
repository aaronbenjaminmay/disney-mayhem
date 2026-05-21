import type { Activity, EditableActivityFields, EditableItemFields, ReservationItem, ScheduledItem, TripDay, TripItem } from '../types';
import { withTripDayGroups } from './landBlocks';
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
    area: item.type === 'reservation' ? item.area ?? '' : '',
    confirmationNumber: item.type === 'reservation' ? item.confirmationNumber ?? '' : '',
    notes: item.notes ?? '',
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
    area: fields.area?.trim() || undefined,
    confirmationNumber: fields.confirmationNumber?.trim() || undefined,
    notes: fields.notes?.trim() || undefined,
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
    time: time || '09:00',
    category: 'park',
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

export function toEditableActivityFields(activity: Activity): EditableActivityFields {
  return {
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
  item: TripItem,
  activityEdits: Record<string, EditableActivityFields>,
  addedActivities: Record<string, Activity[]>,
  deletedActivityIds: Set<string>,
): TripItem {
  if (!('activities' in item) || !Array.isArray(item.activities)) return item;

  const activities = [
    ...item.activities.filter((activity) => !deletedActivityIds.has(activity.id)),
    ...(addedActivities[item.id] ?? []).filter((activity) => !deletedActivityIds.has(activity.id)),
  ]
    .map((activity) => {
      const fields = activityEdits[activity.id];
      if (!fields) return activity;

      const mergedActivity = { ...activity, ...createActivityFromFields(activity.id, fields) };
      console.log('Merge result for edited ride', {
        activityId: activity.id,
        payload: fields,
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
): TripDay[] {
  const deleted = new Set(deletedItemIds);
  const deletedActivities = new Set(deletedActivityIds);
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
    if (!knownItemIds.has(parentItemId)) {
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
        itemsByDay.set(targetDayId, [...(itemsByDay.get(targetDayId) ?? []), updated]);
      });
  });

  return baseDays.map((day) => {
    const items = (itemsByDay.get(day.id) ?? []).map((item) => applyActivityEdits(item, activityEdits, addedActivities, deletedActivities));

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
