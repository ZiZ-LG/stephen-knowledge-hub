export const LEGACY_FIELDBOOK_STORAGE_KEY = 'ai-sales-interview-fieldbook-v2';

export interface LegacyFieldbookStorage {
  getItem(key: string): string | null;
}

export interface LegacyFieldbookSummary {
  readonly role: 'senior' | 'manager' | null;
  readonly plan: '3' | '7' | '14' | '30' | null;
  readonly checkedEntries: number | null;
}

export type LegacyFieldbookReadResult =
  | { readonly status: 'missing' }
  | { readonly status: 'unavailable' }
  | {
    readonly status: 'available';
    readonly raw: string;
    readonly format: 'json' | 'text';
    readonly summary: LegacyFieldbookSummary | null;
  };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function summarize(value: unknown): LegacyFieldbookSummary | null {
  if (!isRecord(value)) return null;
  return {
    role: value.role === 'senior' || value.role === 'manager' ? value.role : null,
    plan: value.plan === '3' || value.plan === '7' || value.plan === '14' || value.plan === '30'
      ? value.plan : null,
    checkedEntries: isRecord(value.done)
      ? Object.values(value.done).filter((done) => done === true).length
      : null,
  };
}

// This adapter deliberately has no write or delete capability. Even unreadable
// legacy payloads remain available for an exact-text export.
export function readLegacyFieldbook(storage: LegacyFieldbookStorage): LegacyFieldbookReadResult {
  let raw: string | null;
  try {
    raw = storage.getItem(LEGACY_FIELDBOOK_STORAGE_KEY);
  } catch {
    return { status: 'unavailable' };
  }
  if (raw === null) return { status: 'missing' };
  try {
    const parsed: unknown = JSON.parse(raw);
    return { status: 'available', raw, format: 'json', summary: summarize(parsed) };
  } catch {
    return { status: 'available', raw, format: 'text', summary: null };
  }
}

export function createLegacyFieldbookExport(
  record: Extract<LegacyFieldbookReadResult, { readonly status: 'available' }>,
) {
  return {
    filename: record.format === 'json' ? 'stephen-legacy-fieldbook.json' : 'stephen-legacy-fieldbook-raw.txt',
    mimeType: record.format === 'json' ? 'application/json;charset=utf-8' : 'text/plain;charset=utf-8',
    content: record.raw,
  } as const;
}
