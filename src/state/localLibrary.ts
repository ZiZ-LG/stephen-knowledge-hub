import type { LocalLibraryState, ToolMaterial } from '../domain';

export const LIBRARY_STORAGE_KEY = 'stephen-knowledge-library-v1';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface LibraryScope {
  readonly itemIds: readonly string[];
  readonly toolIds: readonly string[];
  readonly now: string;
}

function uniqueValidIds(value: unknown, validIds: ReadonlySet<string>) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string =>
    typeof id === 'string' && validIds.has(id)))];
}

function validStatus(value: unknown): value is ToolMaterial['status'] {
  return value === 'not_started' || value === 'in_progress' || value === 'completed';
}

function normalizeToolMaterials(value: unknown, validToolIds: ReadonlySet<string>) {
  if (!Array.isArray(value)) return [];
  const materials = new Map<string, ToolMaterial>();
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object') continue;
    const material = candidate as Partial<ToolMaterial>;
    if (
      typeof material.toolId !== 'string'
      || !validToolIds.has(material.toolId)
      || typeof material.title !== 'string'
      || typeof material.bodyMarkdown !== 'string'
      || typeof material.updatedAt !== 'string'
      || !validStatus(material.status)
    ) {
      continue;
    }
    materials.set(material.toolId, {
      toolId: material.toolId,
      title: material.title,
      status: material.status,
      bodyMarkdown: material.bodyMarkdown,
      updatedAt: material.updatedAt,
    });
  }
  return [...materials.values()];
}

export function createEmptyLibraryState(now = new Date().toISOString()): LocalLibraryState {
  return {
    version: 1,
    bookmarkedIds: [],
    readIds: [],
    toolMaterials: [],
    updatedAt: now,
  };
}

function parseStoredLibrary(raw: string): Omit<LocalLibraryState, 'version'> & { readonly version: 0 | 1 } {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid local library');
  const value = parsed as Record<string, unknown>;
  const ids = (input: unknown) => Array.isArray(input) && input.every((id) => typeof id === 'string');
  const materialIsValid = (input: unknown) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
    const material = input as Record<string, unknown>;
    return typeof material.toolId === 'string' && typeof material.title === 'string'
      && typeof material.bodyMarkdown === 'string' && typeof material.updatedAt === 'string'
      && validStatus(material.status);
  };
  if ((value.version !== 0 && value.version !== 1)
    || !ids(value.bookmarkedIds) || !ids(value.readIds)
    || !Array.isArray(value.toolMaterials) || !value.toolMaterials.every(materialIsValid)
    || typeof value.updatedAt !== 'string') throw new Error('unsupported or damaged local library');
  return value as unknown as Omit<LocalLibraryState, 'version'> & { readonly version: 0 | 1 };
}

export function readLibraryState(
  storage: Pick<StorageLike, 'getItem'>,
  { itemIds, toolIds, now }: LibraryScope,
): { readonly state: LocalLibraryState; readonly writable: boolean } {
  try {
    const raw = storage.getItem(LIBRARY_STORAGE_KEY);
    if (raw === null) return { state: createEmptyLibraryState(now), writable: true };
    const parsed = parseStoredLibrary(raw);
    const validItemIds = new Set(itemIds);
    const validToolIds = new Set(toolIds);
    return {
      state: {
        version: 1,
        bookmarkedIds: uniqueValidIds(parsed.bookmarkedIds, validItemIds),
        readIds: uniqueValidIds(parsed.readIds, validItemIds),
        toolMaterials: normalizeToolMaterials(parsed.toolMaterials, validToolIds),
        updatedAt: parsed.updatedAt,
      },
      writable: true,
    };
  } catch {
    // Reading must never repair, erase or replace unavailable, damaged or newer data.
    return { state: createEmptyLibraryState(now), writable: false };
  }
}

export function loadLibraryState(storage: Pick<StorageLike, 'getItem'>, scope: LibraryScope): LocalLibraryState {
  return readLibraryState(storage, scope).state;
}

export function saveLibraryState(storage: StorageLike, state: LocalLibraryState) {
  try {
    // A record may have become unreadable since the page opened. Do not replace it.
    const existing = storage.getItem(LIBRARY_STORAGE_KEY);
    if (existing !== null) parseStoredLibrary(existing);
    storage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function clearLibraryState(storage: StorageLike) {
  try {
    storage.removeItem(LIBRARY_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function setBookmark(
  state: LocalLibraryState,
  itemId: string,
  bookmarked: boolean,
  validItemIds: readonly string[],
  now = new Date().toISOString(),
): LocalLibraryState {
  if (!validItemIds.includes(itemId)) return state;
  const ids = new Set(state.bookmarkedIds);
  if (bookmarked) ids.add(itemId);
  else ids.delete(itemId);
  return { ...state, bookmarkedIds: [...ids], updatedAt: now };
}

export function toggleBookmark(
  state: LocalLibraryState,
  itemId: string,
  validItemIds: readonly string[],
  now = new Date().toISOString(),
) {
  return setBookmark(state, itemId, !state.bookmarkedIds.includes(itemId), validItemIds, now);
}

export function markRead(
  state: LocalLibraryState,
  itemId: string,
  validItemIds: readonly string[],
  now = new Date().toISOString(),
): LocalLibraryState {
  if (!validItemIds.includes(itemId) || state.readIds.includes(itemId)) return state;
  return { ...state, readIds: [...state.readIds, itemId], updatedAt: now };
}

export function upsertToolMaterial(
  state: LocalLibraryState,
  material: Omit<ToolMaterial, 'updatedAt'>,
  validToolIds: readonly string[],
  now = new Date().toISOString(),
): LocalLibraryState {
  if (!validToolIds.includes(material.toolId)) return state;
  const next: ToolMaterial = { ...material, updatedAt: now };
  const existingIndex = state.toolMaterials.findIndex((entry) => entry.toolId === material.toolId);
  const toolMaterials = [...state.toolMaterials];
  if (existingIndex === -1) toolMaterials.push(next);
  else toolMaterials[existingIndex] = next;
  return { ...state, toolMaterials, updatedAt: now };
}

export function removeToolMaterial(
  state: LocalLibraryState,
  toolId: string,
  now = new Date().toISOString(),
): LocalLibraryState {
  const toolMaterials = state.toolMaterials.filter((entry) => entry.toolId !== toolId);
  if (toolMaterials.length === state.toolMaterials.length) return state;
  return { ...state, toolMaterials, updatedAt: now };
}
