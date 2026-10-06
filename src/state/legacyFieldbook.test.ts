import { describe, expect, it, vi } from 'vitest';

import {
  LEGACY_FIELDBOOK_STORAGE_KEY,
  createLegacyFieldbookExport,
  readLegacyFieldbook,
} from './legacyFieldbook';

describe('read-only legacy fieldbook recovery', () => {
  it('reads only the legacy key and preserves all original fields and formatting without writes', () => {
    const raw = '{\n  "role": "senior", "plan": "14", "done": {"14-1": true, "14-2": false}, "extra": "原样保留"\n}\n';
    const storage = { getItem: vi.fn(() => raw), setItem: vi.fn(), removeItem: vi.fn() };
    const result = readLegacyFieldbook(storage);

    expect(storage.getItem).toHaveBeenCalledExactlyOnceWith(LEGACY_FIELDBOOK_STORAGE_KEY);
    expect(result).toEqual({
      status: 'available', raw, format: 'json',
      summary: { role: 'senior', plan: '14', checkedEntries: 1 },
    });
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
    if (result.status !== 'available') throw new Error('expected a retained record');
    expect(createLegacyFieldbookExport(result)).toEqual({
      filename: 'stephen-legacy-fieldbook.json',
      mimeType: 'application/json;charset=utf-8',
      content: raw,
    });
  });

  it.each(['{broken JSON', '', '\n malformed 中文'])('keeps damaged raw text intact: %j', (raw) => {
    const storage = { getItem: () => raw, setItem: vi.fn(), removeItem: vi.fn() };
    const result = readLegacyFieldbook(storage);
    expect(result).toEqual({ status: 'available', raw, format: 'text', summary: null });
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
    if (result.status !== 'available') throw new Error('expected retained raw text');
    expect(createLegacyFieldbookExport(result)).toEqual({
      filename: 'stephen-legacy-fieldbook-raw.txt',
      mimeType: 'text/plain;charset=utf-8',
      content: raw,
    });
  });

  it('distinguishes a missing record from a browser access error', () => {
    expect(readLegacyFieldbook({ getItem: () => null })).toEqual({ status: 'missing' });
    expect(readLegacyFieldbook({ getItem: () => { throw new Error('storage access denied'); } }))
      .toEqual({ status: 'unavailable' });
  });

  it.each(['null', '[]', '"old value"', '42'])('exports valid but unfamiliar JSON without inventing progress: %s', (raw) => {
    const result = readLegacyFieldbook({ getItem: () => raw });
    expect(result).toEqual({ status: 'available', raw, format: 'json', summary: null });
  });

  it('does not interpret unknown roles, plans, or non-boolean values as completed tasks', () => {
    const raw = JSON.stringify({ role: 'unknown', plan: 14, done: { a: true, b: 'true', c: 1, d: false } });
    expect(readLegacyFieldbook({ getItem: () => raw })).toMatchObject({
      status: 'available', raw,
      summary: { role: null, plan: null, checkedEntries: 1 },
    });
    expect(readLegacyFieldbook({ getItem: () => '{"done":[true]}' })).toMatchObject({
      summary: { checkedEntries: null },
    });
  });

  it('treats prototype-shaped JSON as data and retains it only in the raw export', () => {
    const raw = '{"__proto__":{"compromised":true},"role":"manager","plan":"7","done":{}}';
    const result = readLegacyFieldbook({ getItem: () => raw });
    expect(result).toMatchObject({
      status: 'available', raw,
      summary: { role: 'manager', plan: '7', checkedEntries: 0 },
    });
    expect(Object.prototype).not.toHaveProperty('compromised');
  });
});
