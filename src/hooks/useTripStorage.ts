import { useEffect, useMemo, useState } from 'react';
import type { EditableItemFields, ItemStatus, PersistedState, TripItem } from '../types';

const storageKey = 'disney-mayhem-state-v1';
const defaultState: PersistedState = { statuses: {}, notes: {}, itemEdits: {}, addedItems: {}, deletedItemIds: [] };

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
    };
  } catch {
    return defaultState;
  }
}

export function useTripStorage() {
  const [state, setState] = useState<PersistedState>(() => loadState());

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
      setStatus(id: string, status: ItemStatus) {
        setState((current) => ({
          ...current,
          statuses: {
            ...current.statuses,
            [id]: status,
          },
        }));
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

          return {
            ...current,
            statuses: {
              ...current.statuses,
              [id]: nextStatus[currentStatus],
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
    }),
    [state],
  );
}
