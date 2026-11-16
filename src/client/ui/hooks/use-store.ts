import { useSyncExternalStore } from 'react';
import type { Store } from '../../lib/store.ts';

export const useStore = <T,>(store: Store<T>): T => useSyncExternalStore(store.subscribe, store.get, store.get);

export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
