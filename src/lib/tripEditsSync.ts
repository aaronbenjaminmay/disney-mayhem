import type { Activity, EditableActivityFields, EditableItemFields, ItemStatus, TripItem } from '../types';
import { createItemFromFields } from '../utils/itineraryEdits';
import { supabase, tripId } from './supabaseClient';

const statusEditType = 'status';
const activityEditType = 'activity';
const itemEditType = 'item';

type TripEditRow = {
  item_id?: string | null;
  type?: string | null;
  updated_at?: string | null;
  payload?: {
    status?: ItemStatus;
    action?: 'edit' | 'add' | 'delete' | 'delete-land-group';
    groupId?: string;
    landGroupId?: string;
    parentItemId?: string;
    dayId?: string;
    activity?: Activity;
    item?: TripItem;
    fields?: EditableActivityFields;
    itemFields?: EditableItemFields;
    activityId?: string;
    activityIds?: string[];
    saved_at?: string;
  } | null;
};

export type SupabaseStatusEdits = {
  statuses: Record<string, ItemStatus>;
  activityEdits: Record<string, EditableActivityFields>;
  addedActivities: Record<string, Activity[]>;
  deletedActivityIds: string[];
  deletedLandGroupIds: string[];
  itemEdits: Record<string, EditableItemFields>;
  addedItems: Record<string, TripItem[]>;
  deletedItemIds: string[];
  count: number;
  latestUpdatedAt: string | null;
};

function isItemStatus(value: unknown): value is ItemStatus {
  return value === 'todo' || value === 'done' || value === 'skipped';
}

function getRowTime(row: TripEditRow): number {
  if (row.updated_at) return Date.parse(row.updated_at);
  if (row.payload?.saved_at) return Date.parse(row.payload.saved_at);
  return 0;
}

export async function fetchSupabaseStatusEdits(sinceUpdatedAt?: string | null): Promise<SupabaseStatusEdits | null> {
  if (!supabase || !tripId) {
    console.error('Supabase configuration missing');
    return null;
  }

  let query = supabase
    .from('trip_edits')
    .select('item_id,type,payload,updated_at')
    .eq('trip_id', tripId)
    .in('type', [statusEditType, activityEditType, itemEditType])
    .order('updated_at', { ascending: true });

  if (sinceUpdatedAt) {
    query = query.gt('updated_at', sinceUpdatedAt);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Supabase error', error);
    return null;
  }

  console.log('Supabase connected');
  console.log('Supabase edits fetched');
  console.log(`Supabase edits fetched: ${data?.length ?? 0}`);

  const statuses: Record<string, ItemStatus> = {};
  const activityEdits: Record<string, EditableActivityFields> = {};
  const addedActivities: Record<string, Activity[]> = {};
  const deletedActivityIds: string[] = [];
  const deletedLandGroupIds: string[] = [];
  const itemEdits: Record<string, EditableItemFields> = {};
  const addedItems: Record<string, TripItem[]> = {};
  const deletedItemIds: string[] = [];
  let latestUpdatedAt: string | null = sinceUpdatedAt ?? null;

  const rows = [...((data as TripEditRow[] | null) ?? [])].sort((a, b) => {
    return getRowTime(a) - getRowTime(b);
  });

  rows.forEach((row) => {
    const status = row.payload?.status;
    if (row.type === statusEditType && row.item_id && isItemStatus(status)) {
      statuses[row.item_id] = status;
    }
    if (row.type === activityEditType && row.item_id && !row.payload?.landGroupId && !row.payload?.groupId) {
      console.warn('Disney Mayhem persistence warning: legacy ride edit has no land group ID', {
        item_id: row.item_id,
        action: row.payload?.action,
        parentItemId: row.payload?.parentItemId,
      });
    }
    if (row.type === activityEditType && row.item_id && row.payload?.action === 'edit' && row.payload.fields) {
      const activityGroupKey = row.payload.landGroupId ?? row.payload.groupId ?? row.payload.parentItemId;
      activityEdits[row.item_id] = {
        ...row.payload.fields,
        landGroupId: row.payload.fields.landGroupId ?? row.payload.landGroupId ?? row.payload.groupId,
      };
      if (row.item_id.startsWith('local-activity-') && activityGroupKey) {
        const fields = activityEdits[row.item_id];
        const activity: Activity = {
          id: row.item_id,
          landGroupId: row.payload.landGroupId ?? row.payload.groupId,
          title: fields.title,
          location: fields.location,
          notes: fields.notes || undefined,
          time: fields.time || undefined,
          endTime: fields.endTime || undefined,
          lightningLaneTime: fields.lightningLaneTime || fields.lightningLaneStart || undefined,
          lightningLaneEndTime: fields.lightningLaneEndTime || fields.lightningLaneEnd || undefined,
          lightningLaneStart: fields.lightningLaneStart || fields.lightningLaneTime || undefined,
          lightningLaneEnd: fields.lightningLaneEnd || fields.lightningLaneEndTime || undefined,
          lightningLaneLabel: fields.lightningLaneLabel || undefined,
          displayOrder: fields.displayOrder,
        };
        addedActivities[activityGroupKey] = [...(addedActivities[activityGroupKey] ?? []), activity];
      }
    }
    if (row.type === activityEditType && row.payload?.action === 'add' && row.payload.parentItemId && row.payload.activity) {
      const activityGroupKey = row.payload.landGroupId ?? row.payload.groupId ?? row.payload.parentItemId;
      addedActivities[activityGroupKey] = [
        ...(addedActivities[activityGroupKey] ?? []),
        {
          ...row.payload.activity,
          landGroupId: row.payload.activity.landGroupId ?? row.payload.landGroupId ?? row.payload.groupId,
        },
      ];
    }
    if (row.type === activityEditType && row.item_id && row.payload?.action === 'delete') {
      deletedActivityIds.push(row.item_id);
    }
    if (row.type === activityEditType && row.payload?.action === 'delete-land-group' && (row.payload.landGroupId || row.payload.groupId || row.item_id)) {
      const groupId = row.payload.landGroupId ?? row.payload.groupId ?? row.item_id;
      if (groupId) deletedLandGroupIds.push(groupId);
      row.payload.activityIds?.forEach((activityId) => deletedActivityIds.push(activityId));
    }
    if (row.type === itemEditType && row.item_id && row.payload?.action === 'edit' && row.payload.itemFields) {
      itemEdits[row.item_id] = row.payload.itemFields;
      if (row.item_id.startsWith('local-')) {
        const targetDayId = row.payload.itemFields.type === 'reservation' && row.payload.itemFields.date ? row.payload.itemFields.date : row.payload.itemFields.date;
        if (targetDayId) {
          addedItems[targetDayId] = [
            ...(addedItems[targetDayId] ?? []),
            createItemFromFields(row.item_id, row.payload.itemFields),
          ];
        } else {
          console.warn('Disney Mayhem persistence warning: local item edit has no target day', {
            item_id: row.item_id,
            action: row.payload.action,
          });
        }
      }
    }
    if (row.type === itemEditType && row.payload?.action === 'add' && row.payload.dayId && row.payload.item) {
      addedItems[row.payload.dayId] = [...(addedItems[row.payload.dayId] ?? []), row.payload.item];
    }
    if (row.type === itemEditType && row.item_id && row.payload?.action === 'delete') {
      deletedItemIds.push(row.item_id);
    }
    if (row.updated_at && (!latestUpdatedAt || Date.parse(row.updated_at) > Date.parse(latestUpdatedAt))) {
      latestUpdatedAt = row.updated_at;
    }
  });

  return {
    statuses,
    activityEdits,
    addedActivities,
    deletedActivityIds,
    deletedLandGroupIds,
    itemEdits,
    addedItems,
    deletedItemIds,
    count: rows.length,
    latestUpdatedAt,
  };
}

async function saveSupabaseItemRow(itemId: string, payload: NonNullable<TripEditRow['payload']>): Promise<void> {
  if (!supabase || !tripId) {
    console.error('Supabase configuration missing');
    return;
  }

  const row = {
    trip_id: tripId,
    item_id: itemId,
    type: itemEditType,
    payload: { ...payload, saved_at: new Date().toISOString() },
  };

  const { error: upsertError } = await supabase.from('trip_edits').upsert(row, {
    onConflict: 'trip_id,item_id,type',
  });

  if (!upsertError) {
    console.log('Supabase item edit saved', { item_id: itemId, type: itemEditType, payload: row.payload });
    return;
  }

  console.error('Supabase item edit error', upsertError);

  const { error: insertError } = await supabase.from('trip_edits').insert(row);
  if (insertError) {
    console.error('Supabase item edit error', insertError);
    return;
  }

  console.log('Supabase item edit saved', { item_id: itemId, type: itemEditType, payload: row.payload });
}

export async function saveSupabaseItemEdit(itemId: string, fields: EditableItemFields): Promise<void> {
  await saveSupabaseItemRow(itemId, {
    action: 'edit',
    itemFields: fields,
  });
}

export async function saveSupabaseItemAdd(dayId: string, item: TripItem): Promise<void> {
  await saveSupabaseItemRow(item.id, {
    action: 'add',
    dayId,
    item,
  });
}

export async function saveSupabaseItemDelete(itemId: string): Promise<void> {
  await saveSupabaseItemRow(itemId, {
    action: 'delete',
  });
}

async function saveSupabaseActivityRow(itemId: string, payload: NonNullable<TripEditRow['payload']>): Promise<void> {
  if (!supabase || !tripId) {
    console.error('Supabase configuration missing');
    return;
  }

  const row = {
    trip_id: tripId,
    item_id: itemId,
    type: activityEditType,
    payload: { ...payload, saved_at: new Date().toISOString() },
  };

  const { error: upsertError } = await supabase.from('trip_edits').upsert(row, {
    onConflict: 'trip_id,item_id,type',
  });

  if (!upsertError) {
    console.log('Supabase ride edit saved', { item_id: itemId, type: activityEditType, payload: row.payload });
    return;
  }

  console.error('Supabase ride edit error', upsertError);

  const { error: insertError } = await supabase.from('trip_edits').insert(row);
  if (insertError) {
    console.error('Supabase ride edit error', insertError);
    return;
  }

  console.log('Supabase ride edit saved', { item_id: itemId, type: activityEditType, payload: row.payload });
}

export async function saveSupabaseActivityEdit(activityId: string, parentItemId: string, dayId: string, fields: EditableActivityFields, groupId?: string): Promise<void> {
  await saveSupabaseActivityRow(activityId, {
    action: 'edit',
    activityId,
    groupId,
    landGroupId: groupId,
    parentItemId,
    dayId,
    fields: {
      ...fields,
      landGroupId: groupId ?? fields.landGroupId,
    },
  });
}

export async function saveSupabaseActivityAdd(parentItemId: string, dayId: string, activity: Activity, groupId?: string): Promise<void> {
  await saveSupabaseActivityRow(activity.id, {
    action: 'add',
    activityId: activity.id,
    groupId,
    landGroupId: groupId,
    parentItemId,
    dayId,
    activity: {
      ...activity,
      landGroupId: groupId ?? activity.landGroupId,
    },
  });
}

export async function saveSupabaseActivityDelete(activityId: string, parentItemId: string, dayId: string, groupId?: string): Promise<void> {
  await saveSupabaseActivityRow(activityId, {
    action: 'delete',
    activityId,
    groupId,
    landGroupId: groupId,
    parentItemId,
    dayId,
  });
}

export async function saveSupabaseLandGroupDelete(groupId: string, parentItemId: string, dayId: string, activityIds: string[]): Promise<void> {
  await saveSupabaseActivityRow(groupId, {
    action: 'delete-land-group',
    groupId,
    landGroupId: groupId,
    parentItemId,
    dayId,
    activityIds,
  });
}

export async function saveSupabaseStatus(itemId: string, status: ItemStatus): Promise<void> {
  if (!supabase || !tripId) {
    console.error('Supabase configuration missing');
    return;
  }

  const row = {
    trip_id: tripId,
    item_id: itemId,
    type: statusEditType,
    payload: { status, saved_at: new Date().toISOString() },
  };

  const { error: upsertError } = await supabase.from('trip_edits').upsert(row, {
    onConflict: 'trip_id,item_id,type',
  });

  if (!upsertError) {
    console.log('Supabase status saved', { item_id: itemId, type: statusEditType, payload: row.payload });
    return;
  }

  console.error('Supabase error', upsertError);

  const { error: insertError } = await supabase.from('trip_edits').insert(row);

  if (insertError) {
    console.error('Supabase error', insertError);
    return;
  }

  console.log('Supabase status saved', { item_id: itemId, type: statusEditType, payload: row.payload });
}
