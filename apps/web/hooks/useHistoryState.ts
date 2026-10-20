import { useCallback, useRef, useState } from "react";

const MAX_HISTORY = 100;

interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

/**
 * Undo/redo state container.
 * - `set(next)` records a history step.
 * - `begin()` + `set(next, false)` lets continuous gestures (drag) become one undo step.
 * - `reset(next)` replaces state and clears history (e.g. after server resync).
 */
export function useHistoryState<T>(initial: T) {
  const [state, setState] = useState<HistoryState<T>>({ past: [], present: initial, future: [] });
  const presentRef = useRef(initial);
  presentRef.current = state.present;

  const set = useCallback((next: T | ((prev: T) => T), record: boolean = true) => {
    setState((s) => {
      const value = typeof next === "function" ? (next as (p: T) => T)(s.present) : next;
      if (Object.is(value, s.present)) return s;
      if (!record) return { ...s, present: value };
      return { past: [...s.past, s.present].slice(-MAX_HISTORY), present: value, future: [] };
    });
  }, []);

  const begin = useCallback(() => {
    setState((s) => ({
      past: [...s.past, s.present].slice(-MAX_HISTORY),
      present: s.present,
      future: [],
    }));
  }, []);

  /** Drop the step created by begin() when the gesture changed nothing. */
  const cancelIfUnchanged = useCallback(() => {
    setState((s) => {
      const last = s.past[s.past.length - 1];
      if (last !== undefined && JSON.stringify(last) === JSON.stringify(s.present)) {
        return { ...s, past: s.past.slice(0, -1) };
      }
      return s;
    });
  }, []);

  const undo = useCallback(() => {
    setState((s) => {
      if (!s.past.length) return s;
      const prev = s.past[s.past.length - 1];
      return { past: s.past.slice(0, -1), present: prev, future: [s.present, ...s.future] };
    });
  }, []);

  const redo = useCallback(() => {
    setState((s) => {
      if (!s.future.length) return s;
      const [next, ...rest] = s.future;
      return { past: [...s.past, s.present], present: next, future: rest };
    });
  }, []);

  const reset = useCallback((next: T) => {
    setState({ past: [], present: next, future: [] });
  }, []);

  return {
    value: state.present,
    presentRef,
    set,
    begin,
    cancelIfUnchanged,
    undo,
    redo,
    reset,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
