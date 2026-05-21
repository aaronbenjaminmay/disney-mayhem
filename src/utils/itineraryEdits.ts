import type { Activity, EditableActivityFields, EditableItemFields, FlexibleBlock, ScheduledItem, TripDay, TripItem } from '../types';
import { withTripDayGroups } from './landBlocks';

export function toEditableFields(item: TripItem): EditableItemFields {
  return {
    time: item.time ?? '',
    title: item.title,
    location: item.location,
    notes: item.notes ?? '',
    type: item.type,
  };
}

export function createItemFromFields(id: string, fields: EditableItemFields): TripItem {
  const time = fields.time?.trim();
  const base = {
    id,
    time: time || undefined,
    title: fields.title.trim() || 'New item',
    location: fields.location.trim(),
    notes: fields.notes?.trim() || undefined,
  };

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

  if (updated.type === 'flexible' && item.type === 'flexible') {
    return {
      ...item,
      ...updated,
      area: fields.location.trim() || item.area,
      activities: item.activities,
    };
  }

  if (updated.type === 'scheduled' && item.type === 'scheduled') {
    return {
      ...item,
      ...updated,
      category: item.category,
    } satisfies ScheduledItem;
  }

  return updated;
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
  if (item.type !== 'flexible') return item;

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
  } satisfies FlexibleBlock;
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

  return baseDays.map((day) => {
    const items = [
      ...day.items.filter((item) => !deleted.has(item.id)).map((item) => applyEdit(item, itemEdits[item.id])),
      ...(addedItems[day.id] ?? []).filter((item) => !deleted.has(item.id)).map((item) => applyEdit(item, itemEdits[item.id])),
    ].map((item) => applyActivityEdits(item, activityEdits, addedActivities, deletedActivities));

    return withTripDayGroups({
      ...day,
      items,
    });
  });
}

export function getReservations(days: TripDay[]) {
  return days.flatMap((day) =>
    day.items
      .filter((item): item is ScheduledItem => item.type === 'scheduled' && item.category === 'reservation')
      .map((item) => ({ day, item })),
  );
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
