import { useMemo, useReducer, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';

export type FieldSetters<S> = { [K in keyof S as `set${Capitalize<string & K>}`]: Dispatch<SetStateAction<S[K]>> };
export type WorkflowPhase = 'idle' | 'loading' | 'previewing' | 'ready' | 'executing' | 'reconciliation' | 'completed';
export type ModelAction<S> =
  | { type: 'field'; key: keyof S; value: SetStateAction<S[keyof S]> }
  | { type: 'patch'; patch: Partial<S> }
  | { type: 'transition'; phase: WorkflowPhase; patch: Partial<S> };

export function workflowModelReducer<S>(state: S, action: ModelAction<S>): S {
  if (action.type === 'transition') return { ...state, ...action.patch, phase: action.phase };
  if (action.type === 'patch') return { ...state, ...action.patch };
  const value =
    typeof action.value === 'function'
      ? (action.value as (previous: S[keyof S]) => S[keyof S])(state[action.key])
      : action.value;
  return { ...state, [action.key]: value };
}

/** Stable field adapters retain existing callers while transitions can update the model atomically. */
export function useWorkflowModel<S extends object>(initial: () => S) {
  const [state, dispatch] = useReducer(workflowModelReducer<S>, undefined, initial);
  const keys = useRef(Object.keys(state)).current;
  const setters = useMemo(
    () =>
      Object.fromEntries(
        keys.map((key) => [
          `set${key[0].toUpperCase()}${key.slice(1)}`,
          (value: SetStateAction<S[keyof S]>) => dispatch({ type: 'field', key: key as keyof S, value }),
        ])
      ) as FieldSetters<S>,
    [keys]
  ); // The model schema is fixed for the lifetime of a workflow.
  return { state, setters, dispatch };
}
