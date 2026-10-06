import { describe, expect, it } from 'vitest';
import { emptyLearningProgress, LEARNING_STORAGE_KEY, loadLearningProgress, updateLearningProgress, toggleLearningId } from './progress';

describe('learning progress preservation', () => {
  it('merges each operation into the latest record instead of a stale tab snapshot', () => {
    let raw: string | null = null;
    const storage = { getItem: () => raw, setItem: (_key: string, value: string) => { raw = value; } };
    const staleTab = loadLearningProgress(storage);
    updateLearningProgress(storage, (state) => toggleLearningId(state, 'bookmarkedIds', 'LU-001'));
    updateLearningProgress(storage, (state) => ({ ...state, lastSlug: 'another-lesson' }));
    expect(staleTab.state.bookmarkedIds).toEqual([]);
    expect(loadLearningProgress(storage).state.bookmarkedIds).toEqual(['LU-001']);
    raw = '{"version":2}';
    expect(updateLearningProgress(storage, (state) => toggleLearningId(state, 'completedIds', 'LU-002')).blocked).toBe(true);
    expect(raw).toBe('{"version":2}');
  });
  it('reads only its own key and preserves older course IDs', () => {
    const keys: string[] = [];
    const state = { version: 1, bookmarkedIds: ['retired-course'], completedIds: ['retired-course'], lastSlug: 'older-course' };
    const result = loadLearningProgress({ getItem: (key) => { keys.push(key); return JSON.stringify(state); } });
    expect(keys).toEqual([LEARNING_STORAGE_KEY]);
    expect(result.state).toEqual(state);
    expect(toggleLearningId(result.state, 'completedIds', 'new-course').completedIds).toEqual(['retired-course', 'new-course']);
  });
  it('keeps corrupt and future-format records untouched and disables saving over them', () => {
    for (const raw of ['{', 'null', '{"version":2}', '{"version":1,"bookmarkedIds":{},"completedIds":[]}']) {
      expect(loadLearningProgress({ getItem: () => raw })).toEqual({ state: emptyLearningProgress, writable: false });
    }
  });
  it('does not conflate reading, saving and completing a self-check', () => {
    const { state } = loadLearningProgress({ getItem: () => null });
    const saved = toggleLearningId(state, 'bookmarkedIds', 'course');
    expect(saved.completedIds).toEqual([]);
    expect(saved.lastSlug).toBeNull();
    const done = toggleLearningId(saved, 'completedIds', 'course');
    expect(toggleLearningId(done, 'completedIds', 'course')).toEqual(saved);
  });
});
