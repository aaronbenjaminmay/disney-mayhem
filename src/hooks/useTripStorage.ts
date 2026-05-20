import { useEffect, useMemo, useState } from 'react';
import type { ItemStatus, PersistedState } from '../types';

const storageKey = 'disney-mayhem-state-v1';
const defaultState: PersistedState = { statuses: {}, notes: {} };

function loadState(): PersistedState {
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return defaultState;

    const parsed = JSON.parse(stored) as Partial<PersistedState>;
    return {
      statuses: parsed.statuses ?? {},
      notes: parsed.notes ?? {},
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
    }),
    [state],
  );
}
