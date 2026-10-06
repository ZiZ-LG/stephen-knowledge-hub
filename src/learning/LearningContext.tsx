import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { emptyLearningProgress, LEARNING_STORAGE_KEY, loadLearningProgress, updateLearningProgress, toggleLearningId, type LearningProgress } from './progress';

interface LearningContextValue {
  readonly state: LearningProgress;
  readonly saveError: boolean;
  readonly toggleBookmark: (id: string) => void;
  readonly toggleComplete: (id: string) => void;
  readonly visit: (slug: string) => void;
}
const LearningContext = createContext<LearningContextValue>({ state: emptyLearningProgress, saveError: false, toggleBookmark: () => {}, toggleComplete: () => {}, visit: () => {} });
export function LearningProvider({ children }: { readonly children: ReactNode }) {
  const [initial] = useState(() => loadLearningProgress({ getItem: (key) => window.localStorage.getItem(key) }));
  const [state, setState] = useState(initial.state);
  const current = useRef(state);
  const [saveError, setSaveError] = useState(!initial.writable);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== LEARNING_STORAGE_KEY && event.key !== null) return;
      const latest = loadLearningProgress({ getItem: (key) => window.localStorage.getItem(key) });
      if (latest.writable) { current.current = latest.state; setState(latest.state); }
      setSaveError(!latest.writable);
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  const change = useCallback((update: (value: LearningProgress) => LearningProgress) => {
    // Re-read before applying this operation so another tab's work is retained.
    const result = updateLearningProgress({
      getItem: (key) => window.localStorage.getItem(key),
      setItem: (key, value) => window.localStorage.setItem(key, value),
    }, update);
    const next = result.blocked ? update(current.current) : result.state;
    current.current = next;
    setState(next);
    setSaveError(!result.saved);
  }, []);
  const toggleBookmark = useCallback((id: string) => change((value) => toggleLearningId(value, 'bookmarkedIds', id)), [change]);
  const toggleComplete = useCallback((id: string) => change((value) => toggleLearningId(value, 'completedIds', id)), [change]);
  const visit = useCallback((slug: string) => change((value) => value.lastSlug === slug ? value : { ...value, lastSlug: slug }), [change]);
  const value = useMemo(() => ({ state, saveError, toggleBookmark, toggleComplete, visit }), [state, saveError, toggleBookmark, toggleComplete, visit]);
  return <LearningContext.Provider value={value}>{children}</LearningContext.Provider>;
}
export const useLearning = () => useContext(LearningContext);
