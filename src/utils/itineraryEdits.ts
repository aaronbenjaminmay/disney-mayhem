import type { EditableItemFields, ScheduledItem, TripDay, TripItem } from '../types';

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

export function mergeTripEdits(
  baseDays: TripDay[],
  itemEdits: Record<string, EditableItemFields>,
  addedItems: Record<string, TripItem[]>,
  deletedItemIds: string[],
): TripDay[] {
  const deleted = new Set(deletedItemIds);

  return baseDays.map((day) => ({
    ...day,
    items: [
      ...day.items.filter((item) => !deleted.has(item.id)).map((item) => applyEdit(item, itemEdits[item.id])),
      ...(addedItems[day.id] ?? []).filter((item) => !deleted.has(item.id)).map((item) => applyEdit(item, itemEdits[item.id])),
    ],
  }));
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
