import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { approvedSeedItems } from '../content/items';
import { knowledgeTools } from '../content/tools';
import {
  LIBRARY_STORAGE_KEY,
  clearLibraryState,
  createEmptyLibraryState,
  loadLibraryState,
  readLibraryState,
  markRead,
  saveLibraryState,
  setBookmark,
  upsertToolMaterial,
} from './localLibrary';
import { sanitizeMarkdownFilename, searchKnowledge } from './search';
import { LibraryProvider, useLibrary } from './LibraryContext';

afterEach(() => vi.unstubAllGlobals());

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

const itemIds = approvedSeedItems.map((item) => item.id);
const toolIds = knowledgeTools.map((tool) => tool.id);
const now = '2026-08-23T20:00:00.000Z';

describe('SAAS-603 local Stephen library', () => {
  it('searches Chinese fields and English original titles case-insensitively', () => {
    expect(searchKnowledge(approvedSeedItems, '数据保留').map((item) => item.id))
      .toContain('ST-003');
    expect(searchKnowledge(approvedSeedItems, 'FORWARD DEPLOYED ENGINEER').map((item) => item.id))
      .toContain('ST-020');
    expect(searchKnowledge(approvedSeedItems, 'poc 成功').length).toBeGreaterThan(0);
    expect(searchKnowledge(approvedSeedItems, '不存在的关键词')).toEqual([]);
  });

  it('combines search with explicit AND and OR domain filters', () => {
    const andResult = searchKnowledge(approvedSeedItems, 'AI', {
      domains: ['ai_technology', 'enterprise_sales'],
      mode: 'and',
    });
    expect(andResult.length).toBeGreaterThan(0);
    expect(andResult.every((item) =>
      item.domains.includes('ai_technology') && item.domains.includes('enterprise_sales')))
      .toBe(true);

    const orResult = searchKnowledge(approvedSeedItems, 'AI', {
      domains: ['ai_technology', 'role_org'],
      mode: 'or',
    });
    expect(orResult.length).toBeGreaterThanOrEqual(andResult.length);
  });

  it('keeps corrupt storage intact and refuses to overwrite it with an empty fallback', () => {
    const storage = new MemoryStorage();
    storage.setItem(LIBRARY_STORAGE_KEY, '{broken json');

    const state = loadLibraryState(storage, { itemIds, toolIds, now });
    expect(state).toEqual(createEmptyLibraryState(now));
    expect(readLibraryState(storage, { itemIds, toolIds, now }).writable).toBe(false);
    expect(saveLibraryState(storage, state)).toBe(false);
    expect(storage.getItem(LIBRARY_STORAGE_KEY)).toBe('{broken json');
  });

  it.each(['', 'null', '[]', '{"version":2}', '{"version":1,"bookmarkedIds":{}}'])(
    'preserves damaged or unsupported records without repair: %j', (raw) => {
      const storage = new MemoryStorage();
      storage.setItem(LIBRARY_STORAGE_KEY, raw);
      expect(readLibraryState(storage, { itemIds, toolIds, now })).toEqual({
        state: createEmptyLibraryState(now), writable: false,
      });
      expect(saveLibraryState(storage, createEmptyLibraryState(now))).toBe(false);
      expect(storage.getItem(LIBRARY_STORAGE_KEY)).toBe(raw);
    },
  );

  it('keeps reading available when the storage API denies access, without attempting writes', () => {
    const storage = {
      getItem: vi.fn(() => { throw new Error('storage denied'); }),
      setItem: vi.fn(), removeItem: vi.fn(),
    };
    expect(readLibraryState(storage, { itemIds, toolIds, now })).toEqual({
      state: createEmptyLibraryState(now), writable: false,
    });
    expect(saveLibraryState(storage, createEmptyLibraryState(now))).toBe(false);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it('renders provider children when the localStorage property itself throws', () => {
    const browser = Object.defineProperty({}, 'localStorage', {
      get() { throw new Error('localStorage property denied'); },
    });
    vi.stubGlobal('window', browser);
    function ReadableChild() {
      const { saveStatus } = useLibrary();
      return createElement('p', null, `Still readable; storage: ${saveStatus}`);
    }
    expect(renderToString(createElement(LibraryProvider, {
      itemIds, toolIds, children: createElement(ReadableChild),
    }))).toContain('Still readable; storage: error');
  });

  it('reports write and deletion failures while preserving the saved payload', () => {
    const raw = JSON.stringify(createEmptyLibraryState(now));
    const storage = {
      getItem: () => raw,
      setItem: () => { throw new Error('quota exceeded'); },
      removeItem: () => { throw new Error('deletion denied'); },
    };
    expect(saveLibraryState(storage, setBookmark(createEmptyLibraryState(now), 'ST-001', true, itemIds))).toBe(false);
    expect(clearLibraryState(storage)).toBe(false);
    expect(storage.getItem()).toBe(raw);
  });

  it('does not touch legacy fieldbook or learning-progress keys when saving or explicitly clearing the library', () => {
    const storage = new MemoryStorage();
    storage.setItem('ai-sales-interview-fieldbook-v2', 'original legacy record');
    storage.setItem('stephen-learning-progress-v1', 'original learning record');
    expect(saveLibraryState(storage, createEmptyLibraryState(now))).toBe(true);
    expect(clearLibraryState(storage)).toBe(true);
    expect(storage.getItem('ai-sales-interview-fieldbook-v2')).toBe('original legacy record');
    expect(storage.getItem('stephen-learning-progress-v1')).toBe('original learning record');
  });

  it('keeps still-valid bookmarks across schema versions and drops removed ids', () => {
    const storage = new MemoryStorage();
    storage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify({
      version: 0,
      bookmarkedIds: ['ST-001', 'removed-item'],
      readIds: ['ST-002', 'removed-item'],
      toolMaterials: [],
      updatedAt: '2026-01-01T00:00:00.000Z',
    }));

    expect(loadLibraryState(storage, { itemIds, toolIds, now })).toMatchObject({
      version: 1,
      bookmarkedIds: ['ST-001'],
      readIds: ['ST-002'],
    });
  });

  it('updates bookmarks and read state idempotently', () => {
    let state = createEmptyLibraryState(now);
    state = setBookmark(state, 'ST-001', true, itemIds, now);
    state = setBookmark(state, 'ST-001', true, itemIds, now);
    expect(state.bookmarkedIds).toEqual(['ST-001']);

    state = setBookmark(state, 'missing-item', false, itemIds, now);
    state = markRead(state, 'ST-001', itemIds, now);
    state = markRead(state, 'ST-001', itemIds, now);
    expect(state.readIds).toEqual(['ST-001']);
  });

  it('autosaves one tool material per valid tool and supports a full local clear', () => {
    const storage = new MemoryStorage();
    let state = createEmptyLibraryState(now);
    state = upsertToolMaterial(state, {
      toolId: 'poc-success-canvas',
      title: 'POC 成功标准',
      status: 'in_progress',
      bodyMarkdown: '# POC 成功标准\n',
    }, toolIds, now);
    state = upsertToolMaterial(state, {
      toolId: 'poc-success-canvas',
      title: 'POC 成功标准',
      status: 'completed',
      bodyMarkdown: '# POC 成功标准\n\n已完成',
    }, toolIds, now);
    expect(state.toolMaterials).toHaveLength(1);
    expect(state.toolMaterials[0].status).toBe('completed');

    saveLibraryState(storage, state);
    expect(storage.getItem(LIBRARY_STORAGE_KEY)).toContain('poc-success-canvas');
    clearLibraryState(storage);
    expect(storage.getItem(LIBRARY_STORAGE_KEY)).toBeNull();
  });

  it('creates safe deterministic Markdown filenames', () => {
    expect(sanitizeMarkdownFilename('POC 成功标准 / 客户:A')).toBe('POC-成功标准-客户-A.md');
    expect(sanitizeMarkdownFilename('   ')).toBe('stephen-tool.md');
  });
});
