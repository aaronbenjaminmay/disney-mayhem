import { useEffect, useMemo, useRef, useState } from 'react';
import type { Activity, EditableActivityFields, EditableItemFields, ItemStatus, LandGroupOrder, PersistedState, ReservationDayCard, TripItem } from '../types';
import {
  fetchSupabaseStatusEdits,
  saveSupabaseActivityAdd,
  saveSupabaseActivityDelete,
  saveSupabaseActivityEdit,
  saveSupabaseLandGroupDelete,
  saveSupabaseLandGroupOrder,
  saveSupabaseItemAdd,
  saveSupabaseItemDelete,
  saveSupabaseItemEdit,
  saveSupabaseReservationDayCard,
  saveSupabaseStatus,
  type SupabaseStatusEdits,
} from '../lib/tripEditsSync';

const storageKey = 'disney-mayhem-state-v1';
const defaultState: PersistedState = {
  statuses: {},
  itemEdits: {},
  addedItems: {},
  deletedItemIds: [],
  activityEdits: {},
  addedActivities: {},
  deletedActivityIds: [],
  deletedLandGroupIds: [],
  landGroupOrders: {},
  reservationDayCards: {},
};

function loadState(): PersistedState {
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return defaultState;

    const parsed = JSON.parse(stored) as Partial<PersistedState>;
    return {
      statuses: parsed.statuses ?? {},
      itemEdits: parsed.itemEdits ?? {},
      addedItems: parsed.addedItems ?? {},
      deletedItemIds: parsed.deletedItemIds ?? [],
      activityEdits: parsed.activityEdits ?? {},
      addedActivities: parsed.addedActivities ?? {},
      deletedActivityIds: parsed.deletedActivityIds ?? [],
      deletedLandGroupIds: parsed.deletedLandGroupIds ?? [],
      landGroupOrders: parsed.landGroupOrders ?? {},
      reservationDayCards: parsed.reservationDayCards ?? {},
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

    function mergeAddedItems(current: Record<string, TripItem[]>, incoming: Record<string, TripItem[]>) {
      const merged = { ...current };

      Object.entries(incoming).forEach(([dayId, items]) => {
        const existing = merged[dayId] ?? [];
        const byId = new Map(existing.map((item) => [item.id, item]));
        items.forEach((item) => byId.set(item.id, item));
        merged[dayId] = [...byId.values()];
      });

      return merged;
    }

    function applySupabaseEdits(edits: SupabaseStatusEdits, preferSupabaseSnapshot: boolean) {
      if (edits.latestUpdatedAt) {
        lastSupabaseUpdatedAtRef.current = edits.latestUpdatedAt;
      }

      if (edits.count === 0) return;

      setState((current) => {
        const nextStatuses = preferSupabaseSnapshot ? edits.statuses : { ...current.statuses, ...edits.statuses };
        const nextActivityEdits = preferSupabaseSnapshot ? edits.activityEdits : { ...current.activityEdits, ...edits.activityEdits };
        const nextAddedActivities = preferSupabaseSnapshot ? edits.addedActivities : mergeAddedActivities(current.addedActivities, edits.addedActivities);
        const nextDeletedActivityIds = preferSupabaseSnapshot ? edits.deletedActivityIds : [...new Set([...current.deletedActivityIds, ...edits.deletedActivityIds])];
        const nextDeletedLandGroupIds = preferSupabaseSnapshot ? edits.deletedLandGroupIds : [...new Set([...current.deletedLandGroupIds, ...edits.deletedLandGroupIds])];
        const nextLandGroupOrders = preferSupabaseSnapshot ? edits.landGroupOrders : { ...current.landGroupOrders, ...edits.landGroupOrders };
        const nextItemEdits = preferSupabaseSnapshot ? edits.itemEdits : { ...current.itemEdits, ...edits.itemEdits };
        const nextAddedItems = preferSupabaseSnapshot ? edits.addedItems : mergeAddedItems(current.addedItems, edits.addedItems);
        const nextDeletedItemIds = preferSupabaseSnapshot ? edits.deletedItemIds : [...new Set([...current.deletedItemIds, ...edits.deletedItemIds])];
        const nextReservationDayCards = preferSupabaseSnapshot ? edits.reservationDayCards : { ...current.reservationDayCards, ...edits.reservationDayCards };
        if (
          statusesAreEqual(current.statuses, nextStatuses) &&
          JSON.stringify(current.itemEdits) === JSON.stringify(nextItemEdits) &&
          JSON.stringify(current.addedItems) === JSON.stringify(nextAddedItems) &&
          JSON.stringify(current.deletedItemIds) === JSON.stringify(nextDeletedItemIds) &&
          JSON.stringify(current.activityEdits) === JSON.stringify(nextActivityEdits) &&
          JSON.stringify(current.addedActivities) === JSON.stringify(nextAddedActivities) &&
          JSON.stringify(current.deletedActivityIds) === JSON.stringify(nextDeletedActivityIds) &&
          JSON.stringify(current.deletedLandGroupIds) === JSON.stringify(nextDeletedLandGroupIds) &&
          JSON.stringify(current.landGroupOrders) === JSON.stringify(nextLandGroupOrders) &&
          JSON.stringify(current.reservationDayCards) === JSON.stringify(nextReservationDayCards)
        ) {
          return current;
        }

        return {
          ...current,
          statuses: nextStatuses,
          itemEdits: nextItemEdits,
          addedItems: nextAddedItems,
          deletedItemIds: nextDeletedItemIds,
          activityEdits: nextActivityEdits,
          addedActivities: nextAddedActivities,
          deletedActivityIds: nextDeletedActivityIds,
          deletedLandGroupIds: nextDeletedLandGroupIds,
          landGroupOrders: nextLandGroupOrders,
          reservationDayCards: nextReservationDayCards,
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
          applySupabaseEdits(edits, edits.count > 0);
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
      itemEdits: state.itemEdits,
      addedItems: state.addedItems,
      deletedItemIds: state.deletedItemIds,
      activityEdits: state.activityEdits,
      addedActivities: state.addedActivities,
      deletedActivityIds: state.deletedActivityIds,
      deletedLandGroupIds: state.deletedLandGroupIds,
      landGroupOrders: state.landGroupOrders,
      reservationDayCards: state.reservationDayCards,
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
          const currentStatus = current.statuses[id] ?? 'todo';
          const next: ItemStatus = currentStatus === 'done' ? 'todo' : 'done';

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
      saveItemEdit(id: string, fields: EditableItemFields) {
        setState((current) => ({
          ...current,
          itemEdits: {
            ...current.itemEdits,
            [id]: fields,
          },
        }));
        void saveSupabaseItemEdit(id, fields);
      },
      addItem(dayId: string, item: TripItem) {
        setState((current) => ({
          ...current,
          addedItems: {
            ...current.addedItems,
            [dayId]: [...(current.addedItems[dayId] ?? []), item],
          },
        }));
        void saveSupabaseItemAdd(dayId, item);
      },
      deleteItem(id: string) {
        setState((current) => ({
          ...current,
          deletedItemIds: current.deletedItemIds.includes(id) ? current.deletedItemIds : [...current.deletedItemIds, id],
        }));
        void saveSupabaseItemDelete(id);
      },
      saveActivityEdit(dayId: string, parentItemId: string, activityId: string, fields: EditableActivityFields, groupId?: string) {
        setState((current) => ({
          ...current,
          activityEdits: {
            ...current.activityEdits,
            [activityId]: {
              ...fields,
              landGroupId: groupId ?? fields.landGroupId,
            },
          },
        }));
        void saveSupabaseActivityEdit(activityId, parentItemId, dayId, fields, groupId);
      },
      addActivity(dayId: string, parentItemId: string, activity: Activity, groupId?: string) {
        const storageGroupId = groupId ?? parentItemId;
        const activityWithGroup = {
          ...activity,
          landGroupId: groupId ?? activity.landGroupId,
        };
        setState((current) => ({
          ...current,
          addedActivities: {
            ...current.addedActivities,
            [storageGroupId]: [...(current.addedActivities[storageGroupId] ?? []).filter((existing) => existing.id !== activity.id), activityWithGroup],
          },
        }));
        void saveSupabaseActivityAdd(parentItemId, dayId, activityWithGroup, groupId);
      },
      deleteActivity(dayId: string, parentItemId: string, activityId: string, groupId?: string) {
        setState((current) => ({
          ...current,
          deletedActivityIds: current.deletedActivityIds.includes(activityId) ? current.deletedActivityIds : [...current.deletedActivityIds, activityId],
        }));
        void saveSupabaseActivityDelete(activityId, parentItemId, dayId, groupId);
      },
      deleteLandGroup(dayId: string, parentItemId: string, groupId: string, activityIds: string[]) {
        setState((current) => ({
          ...current,
          deletedLandGroupIds: current.deletedLandGroupIds.includes(groupId) ? current.deletedLandGroupIds : [...current.deletedLandGroupIds, groupId],
          deletedActivityIds: [...new Set([...current.deletedActivityIds, ...activityIds])],
        }));
        void saveSupabaseLandGroupDelete(groupId, parentItemId, dayId, activityIds);
      },
      saveLandGroupOrder(groupId: string, order: LandGroupOrder) {
        setState((current) => ({
          ...current,
          landGroupOrders: {
            ...current.landGroupOrders,
            [groupId]: order,
          },
        }));
        void saveSupabaseLandGroupOrder(groupId, order);
      },
      saveReservationDayCard(card: ReservationDayCard) {
        setState((current) => ({
          ...current,
          reservationDayCards: {
            ...current.reservationDayCards,
            [card.date]: card,
          },
        }));
        void saveSupabaseReservationDayCard(card);
      },
    }),
    [state],
  );
}
