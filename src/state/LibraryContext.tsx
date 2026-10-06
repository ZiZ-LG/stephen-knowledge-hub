import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { LocalLibraryState, ToolMaterial } from '../domain';
import {
  clearLibraryState,
  createEmptyLibraryState,
  readLibraryState,
  markRead as markReadState,
  removeToolMaterial as removeToolMaterialState,
  saveLibraryState,
  toggleBookmark as toggleBookmarkState,
  upsertToolMaterial,
  type StorageLike,
} from './localLibrary';

interface LibraryContextValue {
  readonly state: LocalLibraryState;
  readonly saveStatus: 'saved' | 'error';
  readonly toggleBookmark: (itemId: string) => void;
  readonly markRead: (itemId: string) => void;
  readonly updateToolMaterial: (
    material: Omit<ToolMaterial, 'updatedAt'>,
  ) => void;
  readonly removeToolMaterial: (toolId: string) => void;
  readonly clearAll: () => void;
}

const fallbackState = createEmptyLibraryState('1970-01-01T00:00:00.000Z');
const LibraryContext = createContext<LibraryContextValue>({
  state: fallbackState,
  saveStatus: 'saved',
  toggleBookmark: () => undefined,
  markRead: () => undefined,
  updateToolMaterial: () => undefined,
  removeToolMaterial: () => undefined,
  clearAll: () => undefined,
});

// Access the browser property only inside the guarded storage operations.
const browserStorage: StorageLike = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
  removeItem: (key) => window.localStorage.removeItem(key),
};

export function LibraryProvider({
  itemIds,
  toolIds,
  children,
}: {
  readonly itemIds: readonly string[];
  readonly toolIds: readonly string[];
  readonly children: ReactNode;
}) {
  const [initial] = useState(() => {
    if (typeof window === 'undefined') return { state: createEmptyLibraryState(), writable: true };
    return readLibraryState(browserStorage, {
      itemIds,
      toolIds,
      now: new Date().toISOString(),
    });
  });
  const [state, setState] = useState<LocalLibraryState>(initial.state);
  const writable = useRef(initial.writable);
  const lastSavedState = useRef(initial.state);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'error'>(initial.writable ? 'saved' : 'error');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!writable.current) { setSaveStatus('error'); return; }
    // Merely opening the site must not normalize and rewrite saved work.
    if (state === lastSavedState.current) return;
    const saved = saveLibraryState(browserStorage, state);
    if (saved) lastSavedState.current = state;
    setSaveStatus(saved ? 'saved' : 'error');
  }, [state]);

  const toggleBookmark = useCallback((itemId: string) => {
    setState((current) => toggleBookmarkState(current, itemId, itemIds));
  }, [itemIds]);

  const markRead = useCallback((itemId: string) => {
    setState((current) => markReadState(current, itemId, itemIds));
  }, [itemIds]);

  const updateToolMaterial = useCallback((material: Omit<ToolMaterial, 'updatedAt'>) => {
    setState((current) => upsertToolMaterial(current, material, toolIds));
  }, [toolIds]);

  const removeToolMaterial = useCallback((toolId: string) => {
    setState((current) => removeToolMaterialState(current, toolId));
  }, []);

  const clearAll = useCallback(() => {
    if (typeof window !== 'undefined' && !clearLibraryState(browserStorage)) {
      setSaveStatus('error');
      return;
    }
    writable.current = true;
    const empty = createEmptyLibraryState();
    lastSavedState.current = empty;
    setState(empty);
    setSaveStatus('saved');
  }, []);

  const value = useMemo<LibraryContextValue>(() => ({
    state,
    saveStatus,
    toggleBookmark,
    markRead,
    updateToolMaterial,
    removeToolMaterial,
    clearAll,
  }), [
    clearAll,
    markRead,
    removeToolMaterial,
    saveStatus,
    state,
    toggleBookmark,
    updateToolMaterial,
  ]);

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary() {
  return useContext(LibraryContext);
}
