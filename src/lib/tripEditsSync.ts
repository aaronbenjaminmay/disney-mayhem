import type { Activity, EditableActivityFields, ItemStatus } from '../types';
import { supabase, tripId } from './supabaseClient';

const statusEditType = 'status';
const activityEditType = 'activity';

type TripEditRow = {
  item_id?: string | null;
  type?: string | null;
  updated_at?: string | null;
  payload?: {
    status?: ItemStatus;
    action?: 'edit' | 'add' | 'delete';
    parentItemId?: string;
    dayId?: string;
    activity?: Activity;
    fields?: EditableActivityFields;
    activityId?: string;
    saved_at?: string;
  } | null;
};

export type SupabaseStatusEdits = {
  statuses: Record<string, ItemStatus>;
  activityEdits: Record<string, EditableActivityFields>;
  addedActivities: Record<string, Activity[]>;
  deletedActivityIds: string[];
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
    .in('type', [statusEditType, activityEditType])
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
  let latestUpdatedAt: string | null = sinceUpdatedAt ?? null;

  const rows = [...((data as TripEditRow[] | null) ?? [])].sort((a, b) => {
    return getRowTime(a) - getRowTime(b);
  });

  rows.forEach((row) => {
    const status = row.payload?.status;
    if (row.type === statusEditType && row.item_id && isItemStatus(status)) {
      statuses[row.item_id] = status;
    }
    if (row.type === activityEditType && row.item_id && row.payload?.action === 'edit' && row.payload.fields) {
      activityEdits[row.item_id] = row.payload.fields;
      if (row.item_id.startsWith('local-activity-') && row.payload.parentItemId) {
        const fields = row.payload.fields;
        const activity: Activity = {
          id: row.item_id,
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
        addedActivities[row.payload.parentItemId] = [...(addedActivities[row.payload.parentItemId] ?? []), activity];
      }
    }
    if (row.type === activityEditType && row.payload?.action === 'add' && row.payload.parentItemId && row.payload.activity) {
      addedActivities[row.payload.parentItemId] = [...(addedActivities[row.payload.parentItemId] ?? []), row.payload.activity];
    }
    if (row.type === activityEditType && row.item_id && row.payload?.action === 'delete') {
      deletedActivityIds.push(row.item_id);
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
    count: rows.length,
    latestUpdatedAt,
  };
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

export async function saveSupabaseActivityEdit(activityId: string, parentItemId: string, dayId: string, fields: EditableActivityFields): Promise<void> {
  await saveSupabaseActivityRow(activityId, {
    action: 'edit',
    activityId,
    parentItemId,
    dayId,
    fields,
  });
}

export async function saveSupabaseActivityAdd(parentItemId: string, dayId: string, activity: Activity): Promise<void> {
  await saveSupabaseActivityRow(activity.id, {
    action: 'add',
    activityId: activity.id,
    parentItemId,
    dayId,
    activity,
  });
}

export async function saveSupabaseActivityDelete(activityId: string, parentItemId: string, dayId: string): Promise<void> {
  await saveSupabaseActivityRow(activityId, {
    action: 'delete',
    activityId,
    parentItemId,
    dayId,
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
