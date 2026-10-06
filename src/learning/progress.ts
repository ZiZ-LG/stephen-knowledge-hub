import type { StorageLike } from '../state/localLibrary';

export const LEARNING_STORAGE_KEY = 'stephen-learning-progress-v1';
export interface LearningProgress {
  readonly version: 1;
  readonly bookmarkedIds: readonly string[];
  readonly completedIds: readonly string[];
  readonly lastSlug: string | null;
}
export const emptyLearningProgress: LearningProgress = {
  version: 1, bookmarkedIds: [], completedIds: [], lastSlug: null,
};
export function loadLearningProgress(storage: Pick<StorageLike, 'getItem'>): { state: LearningProgress; writable: boolean } {
  try {
    const raw = storage.getItem(LEARNING_STORAGE_KEY);
    if (!raw) return { state: emptyLearningProgress, writable: true };
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') throw new Error('invalid progress');
    const record = value as Record<string, unknown>;
    const ids = (input: unknown): string[] => {
      if (!Array.isArray(input) || input.some((id) => typeof id !== 'string')) throw new Error('invalid ids');
      return [...new Set(input)] as string[];
    };
    if (record.version !== 1 || (record.lastSlug !== null && typeof record.lastSlug !== 'string')) throw new Error('unsupported progress');
    return { state: { version: 1, bookmarkedIds: ids(record.bookmarkedIds), completedIds: ids(record.completedIds), lastSlug: record.lastSlug }, writable: true };
  } catch {
    // Do not delete or overwrite malformed or newer-format saved work.
    return { state: emptyLearningProgress, writable: false };
  }
}
export function toggleLearningId(state: LearningProgress, key: 'bookmarkedIds' | 'completedIds', id: string): LearningProgress {
  const values = new Set(state[key]);
  if (values.has(id)) values.delete(id); else values.add(id);
  return { ...state, [key]: [...values] };
}

export function updateLearningProgress(
  storage: Pick<StorageLike, 'getItem' | 'setItem'>,
  update: (value: LearningProgress) => LearningProgress,
): { state: LearningProgress; saved: boolean; blocked: boolean } {
  const latest = loadLearningProgress(storage);
  if (!latest.writable) return { state: latest.state, saved: false, blocked: true };
  const next = update(latest.state);
  try {
    if (next !== latest.state) storage.setItem(LEARNING_STORAGE_KEY, JSON.stringify(next));
    return { state: next, saved: true, blocked: false };
  } catch {
    return { state: next, saved: false, blocked: false };
  }
}
