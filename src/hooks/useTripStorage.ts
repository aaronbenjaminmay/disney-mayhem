import { useEffect, useMemo, useRef, useState } from 'react';
import type { Activity, EditableActivityFields, EditableItemFields, ItemStatus, PersistedState, TripItem } from '../types';
import {
  fetchSupabaseStatusEdits,
  saveSupabaseActivityAdd,
  saveSupabaseActivityDelete,
  saveSupabaseActivityEdit,
  saveSupabaseStatus,
  type SupabaseStatusEdits,
} from '../lib/tripEditsSync';

const storageKey = 'disney-mayhem-state-v1';
const defaultState: PersistedState = {
  statuses: {},
  notes: {},
  itemEdits: {},
  addedItems: {},
  deletedItemIds: [],
  activityEdits: {},
  addedActivities: {},
  deletedActivityIds: [],
};

function loadState(): PersistedState {
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return defaultState;

    const parsed = JSON.parse(stored) as Partial<PersistedState>;
    return {
      statuses: parsed.statuses ?? {},
      notes: parsed.notes ?? {},
      itemEdits: parsed.itemEdits ?? {},
      addedItems: parsed.addedItems ?? {},
      deletedItemIds: parsed.deletedItemIds ?? [],
      activityEdits: parsed.activityEdits ?? {},
      addedActivities: parsed.addedActivities ?? {},
      deletedActivityIds: parsed.deletedActivityIds ?? [],
    };
  } catch {
    return defaultState;
  }
}

function statusesAreEqual(left: Record<string, ItemStatus>, right: Record<string, ItemStatus>) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length && leftKeys.every((key) => left[key] === right[key]);
}

function mergeAddedActivities(current: Record<string, Activity[]>, incoming: Record<string, Activity[]>) {
  const merged = { ...current };

  Object.entries(incoming).forEach(([parentItemId, activities]) => {
    const existing = merged[parentItemId] ?? [];
    const byId = new Map(existing.map((activity) => [activity.id, activity]));
    activities.forEach((activity) => byId.set(activity.id, activity));
    merged[parentItemId] = [...byId.values()];
  });

  return merged;
}

export function useTripStorage() {
  const [state, setState] = useState<PersistedState>(() => loadState());
  const lastSupabaseUpdatedAtRef = useRef<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    let isPolling = false;

    function applySupabaseEdits(edits: SupabaseStatusEdits, replaceStatuses: boolean) {
      if (edits.latestUpdatedAt) {
        lastSupabaseUpdatedAtRef.current = edits.latestUpdatedAt;
      }

      if (edits.count === 0) return;

      setState((current) => {
        const nextStatuses = replaceStatuses ? edits.statuses : { ...current.statuses, ...edits.statuses };
        const nextActivityEdits = { ...current.activityEdits, ...edits.activityEdits };
        const nextAddedActivities = mergeAddedActivities(current.addedActivities, edits.addedActivities);
        const nextDeletedActivityIds = [...new Set([...current.deletedActivityIds, ...edits.deletedActivityIds])];
        if (
          statusesAreEqual(current.statuses, nextStatuses) &&
          JSON.stringify(current.activityEdits) === JSON.stringify(nextActivityEdits) &&
          JSON.stringify(current.addedActivities) === JSON.stringify(nextAddedActivities) &&
          current.deletedActivityIds.length === nextDeletedActivityIds.length
        ) {
          return current;
        }

        return {
          ...current,
          statuses: nextStatuses,
          activityEdits: nextActivityEdits,
          addedActivities: nextAddedActivities,
          deletedActivityIds: nextDeletedActivityIds,
        };
      });
    }

    async function syncFromSupabase({ initial = false } = {}) {
      if (isPolling) return;
      isPolling = true;

      try {
        const edits = await fetchSupabaseStatusEdits(initial ? null : lastSupabaseUpdatedAtRef.current);
        if (!isMounted || !edits) return;

        if (initial) {
          applySupabaseEdits(edits, Object.keys(edits.statuses).length > 0);
          return;
        }

        applySupabaseEdits(edits, false);
      } finally {
        isPolling = false;
      }
    }

    void syncFromSupabase({ initial: true });
    const poller = window.setInterval(() => {
      void syncFromSupabase();
    }, 3_000);

    return () => {
      isMounted = false;
      window.clearInterval(poller);
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  }, [state]);

  return useMemo(
    () => ({
      statuses: state.statuses,
      notes: state.notes,
      itemEdits: state.itemEdits,
      addedItems: state.addedItems,
      deletedItemIds: state.deletedItemIds,
      activityEdits: state.activityEdits,
      addedActivities: state.addedActivities,
      deletedActivityIds: state.deletedActivityIds,
      setStatus(id: string, status: ItemStatus) {
        setState((current) => ({
          ...current,
          statuses: {
            ...current.statuses,
            [id]: status,
          },
        }));
        void saveSupabaseStatus(id, status);
      },
      cycleStatus(id: string) {
        setState((current) => {
          const nextStatus: Record<ItemStatus | 'unset', ItemStatus> = {
            unset: 'done',
            todo: 'done',
            done: 'skipped',
            skipped: 'todo',
          };
          const currentStatus = current.statuses[id] ?? 'unset';
          const next = nextStatus[currentStatus];

          void saveSupabaseStatus(id, next);

          return {
            ...current,
            statuses: {
              ...current.statuses,
              [id]: next,
            },
          };
        });
      },
      setNote(id: string, note: string) {
        setState((current) => ({
          ...current,
          notes: {
            ...current.notes,
            [id]: note,
          },
        }));
      },
      saveItemEdit(id: string, fields: EditableItemFields) {
        setState((current) => ({
          ...current,
          itemEdits: {
            ...current.itemEdits,
            [id]: fields,
          },
        }));
      },
      addItem(dayId: string, item: TripItem) {
        setState((current) => ({
          ...current,
          addedItems: {
            ...current.addedItems,
            [dayId]: [...(current.addedItems[dayId] ?? []), item],
          },
        }));
      },
      deleteItem(id: string) {
        setState((current) => ({
          ...current,
          deletedItemIds: current.deletedItemIds.includes(id) ? current.deletedItemIds : [...current.deletedItemIds, id],
        }));
      },
      saveActivityEdit(dayId: string, parentItemId: string, activityId: string, fields: EditableActivityFields) {
        setState((current) => ({
          ...current,
          activityEdits: {
            ...current.activityEdits,
            [activityId]: fields,
          },
        }));
        void saveSupabaseActivityEdit(activityId, parentItemId, dayId, fields);
      },
      addActivity(dayId: string, parentItemId: string, activity: Activity) {
        setState((current) => ({
          ...current,
          addedActivities: {
            ...current.addedActivities,
            [parentItemId]: [...(current.addedActivities[parentItemId] ?? []).filter((existing) => existing.id !== activity.id), activity],
          },
        }));
        void saveSupabaseActivityAdd(parentItemId, dayId, activity);
      },
      deleteActivity(dayId: string, parentItemId: string, activityId: string) {
        setState((current) => ({
          ...current,
          deletedActivityIds: current.deletedActivityIds.includes(activityId) ? current.deletedActivityIds : [...current.deletedActivityIds, activityId],
        }));
        void saveSupabaseActivityDelete(activityId, parentItemId, dayId);
      },
    }),
    [state],
  );
}
