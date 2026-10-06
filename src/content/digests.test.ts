import { describe, expect, it } from 'vitest';

import type { SeedCandidate } from '../domain';
import { approvedSeedItems } from './items';
import { knowledgeTools } from './tools';
import {
  createDailyDigest,
  createWeeklyDigest,
} from './digests';

function approve(
  item: SeedCandidate,
  overrides: Partial<SeedCandidate> = {},
): SeedCandidate {
  return {
    ...item,
    updatedAt: item.publishedAt,
    ...overrides,
    editorialStatus: 'approved',
    review: {
      ...item.review,
      status: 'approved',
    },
  };
}

function asReviewCandidate(item: SeedCandidate): SeedCandidate {
  return {
    ...item,
    editorialStatus: 'candidate',
    review: {
      ...item.review,
      status: 'pending_owner_review',
    },
  };
}

describe('SAAS-603 reviewed digest projections', () => {
  it('only projects approved content and never leaks candidate or archived entries', () => {
    const approved = approve(approvedSeedItems[0]);
    const archived = {
      ...approve(approvedSeedItems[1]),
      editorialStatus: 'archived' as const,
    };
    const digest = createDailyDigest(
      [approved, asReviewCandidate(approvedSeedItems[2]), archived],
      { digestDate: '2026-08-23' },
    );

    expect(digest.entries.map((entry) => entry.item.id)).toEqual([approved.id]);
    expect(digest.entries.every((entry) => entry.item.editorialStatus === 'approved')).toBe(true);
  });

  it('selects at most five items and reports their actual domain coverage and action metadata', () => {
    const approved = approvedSeedItems.slice(0, 12).map((item) => approve(item));
    const digest = createDailyDigest(approved, { digestDate: '2026-08-23' });

    expect(digest.entries.length).toBeGreaterThan(0);
    expect(digest.entries.length).toBeLessThanOrEqual(5);
    expect(new Set(digest.coveredDomains))
      .toEqual(new Set(digest.entries.flatMap((entry) => entry.item.domains)));
    expect(digest.entries.every((entry) => entry.estimatedReadMinutes >= 1)).toBe(true);
    expect(digest.entries.every((entry) => entry.sourceCount >= 1)).toBe(true);
    expect(digest.entries.every((entry) => entry.action.zh.trim().length > 0)).toBe(true);
    expect(digest.estimatedReadMinutes).toBe(
      digest.entries.reduce((total, entry) => total + entry.estimatedReadMinutes, 0),
    );
    expect(digest.sourceCount).toBeGreaterThan(0);
  });

  it('keeps related events distinct while grouping the same canonical primary source', () => {
    const first = approve(approvedSeedItems[0], {
      id: 'DIGEST-EVENT-A',
      slug: 'digest-event-a',
      relatedItemIds: ['DIGEST-EVENT-B'],
    });
    const related = approve(approvedSeedItems[1], {
      id: 'DIGEST-EVENT-B',
      slug: 'digest-event-b',
      relatedItemIds: ['DIGEST-EVENT-A'],
    });
    const sameUrl = approve(approvedSeedItems[2], {
      id: 'DIGEST-SAME-URL',
      slug: 'digest-same-url',
      evidence: [{
        ...first.evidence[0],
        id: 'DIGEST-SAME-URL-E1',
        url: `${first.evidence[0].url}?utm_source=digest#top`,
      }],
    });

    const digest = createDailyDigest(
      [first, related, sameUrl],
      { digestDate: '2026-08-23' },
    );

    expect(digest.entries).toHaveLength(2);
    expect(digest.entries.some((entry) => entry.item.id === related.id)).toBe(true);
    const sourceGroup = digest.entries.find((entry) => entry.reports.some((item) => item.id === first.id));
    expect(sourceGroup?.reports.map((item) => item.id).sort()).toEqual([first.id, sameUrl.id].sort());
    expect(sourceGroup?.reports.flatMap((item) => item.evidence)).toContain(first.evidence[1]);
  });

  it('allows a short or empty edition instead of padding with unapproved content', () => {
    const twoApproved = approvedSeedItems.slice(0, 2).map((item) => approve(item));
    expect(createDailyDigest(twoApproved, { digestDate: '2026-08-23' }).entries)
      .toHaveLength(2);
    expect(createDailyDigest(approvedSeedItems.map(asReviewCandidate), { digestDate: '2026-08-23' }).entries)
      .toEqual([]);
  });

  it('builds a weekly view from publication or record-update dates in the selected week', () => {
    const weeklyItems = [
      approve(approvedSeedItems[10], {
        publishedAt: '2026-08-18T08:00:00.000Z',
        updatedAt: '2026-08-18T08:00:00.000Z',
        relatedItemIds: ['WEEK-CONTINUING'],
      }),
      approve(approvedSeedItems[20], {
        publishedAt: '2026-07-01T08:00:00.000Z',
        updatedAt: '2026-08-20T08:00:00.000Z',
      }),
      approve(approvedSeedItems[25], {
        publishedAt: '2026-08-22T08:00:00.000Z',
        updatedAt: '2026-08-22T08:00:00.000Z',
      }),
      approve(approvedSeedItems[5], {
        id: 'WEEK-CONTINUING',
        publishedAt: '2026-07-01T08:00:00.000Z',
        updatedAt: '2026-07-01T08:00:00.000Z',
      }),
    ];

    const digest = createWeeklyDigest(weeklyItems, {
      weekStart: '2026-08-17',
      weekEnd: '2026-08-23',
      validToolIds: knowledgeTools.map((tool) => tool.id),
    });

    expect(digest.entries).toHaveLength(3);
    expect(digest.mainThread?.item.editorialStatus).toBe('approved');
    expect(digest.themes.flatMap((theme) => theme.relatedHistory).map((entry) => entry.item.id))
      .toContain('WEEK-CONTINUING');
    expect(digest.roleChanges.length).toBeGreaterThan(0);
    expect(digest.recommendedToolIds.length).toBeGreaterThan(0);
    expect(digest.recommendedToolIds.every((id) =>
      knowledgeTools.some((tool) => tool.id === id))).toBe(true);
  });

  it('rejects invalid digest dates instead of silently using the current clock', () => {
    expect(() => createDailyDigest([], { digestDate: '08/23/2026' }))
      .toThrow('digestDate must use YYYY-MM-DD');
    expect(() => createWeeklyDigest([], {
      weekStart: '2026-08-24',
      weekEnd: '2026-08-23',
      validToolIds: [],
    })).toThrow('weekStart must not be after weekEnd');
  });
});

function topicItem(id: string, overrides: Partial<SeedCandidate> = {}): SeedCandidate {
  return approve(approvedSeedItems[0], {
    id,
    slug: id.toLowerCase(),
    title: { zh: `${id} 已审结论` },
    summary: { zh: '来源明确说明的一项变化。' },
    whyItMatters: { zh: '先核对适用条件。' },
    salesImplication: { zh: '确认客户流程。' },
    roleOrgImplication: { zh: '确认责任分工。' },
    nextAction: { zh: '阅读原始证据。' },
    supportingFacts: [],
    deeperAnalysis: { mechanism: '', businessValue: '', boundary: '' },
    domains: ['ai_technology'],
    topicSlugs: ['rag-adoption'],
    publishedAt: '2026-09-28T08:00:00.000Z',
    updatedAt: '2026-09-28T08:00:00.000Z',
    relatedItemIds: [],
    evidence: [{ ...approvedSeedItems[0].evidence[0], id: `${id}-e1`, url: `https://example.org/${id}` }],
    ...overrides,
  });
}

describe('reviewed understanding themes and reading budget', () => {
  it('groups distinct events by an explicit shared topic without synthesizing a conclusion', () => {
    const first = topicItem('A', { topicSlugs: ['private-topic', 'rag-adoption'], relatedItemIds: ['B'] });
    const second = topicItem('B');
    const third = topicItem('C', { topicSlugs: [] });
    const fourth = topicItem('D', { topicSlugs: [] });
    const digest = createDailyDigest([first, second, third, fourth], {
      digestDate: '2026-09-29',
      topics: [{ slug: 'rag-adoption', title: { zh: 'RAG 如何进入工作流程' } }],
    });
    expect(digest.entries).toHaveLength(4);
    expect(digest.themes).toHaveLength(3);
    const theme = digest.themes.find((entry) => entry.topicSlug === 'rag-adoption');
    expect(theme?.entries.map((entry) => entry.item.id)).toEqual(['A', 'B']);
    expect(theme?.title.zh).toBe('RAG 如何进入工作流程');
    expect(theme?.lead.item.summary).toBe(first.summary);
    expect(digest.themes.filter((entry) => entry.topicSlug === null)).toHaveLength(2);
  });

  it('preserves same-source revisions and their evidence while showing one event', () => {
    const earlier = topicItem('EARLIER', {
      publishedAt: '2026-09-01T08:00:00.000Z', updatedAt: '2026-09-01T08:00:00.000Z',
    });
    const revision = topicItem('REVISION', {
      evidence: [{ ...earlier.evidence[0], id: 'revision-e1', url: `${earlier.evidence[0].url}/?utm_source=digest#top` },
        { ...earlier.evidence[0], id: 'revision-e2', sourceId: 'independent-study', url: 'https://example.org/study' }],
    });
    const digest = createWeeklyDigest([earlier, revision], {
      weekStart: '2026-09-28', weekEnd: '2026-10-04', asOfDate: '2026-09-29', validToolIds: [],
    });
    expect(digest.entries).toHaveLength(1);
    expect(digest.entries[0].item.id).toBe('REVISION');
    expect(digest.entries[0].reports.map((item) => item.id)).toEqual(['REVISION', 'EARLIER']);
    expect(digest.entries[0].sourceCount).toBe(2);
  });

  it('does not collapse different documents identified by query parameters', () => {
    const one = topicItem('ONE', { evidence: [{ ...approvedSeedItems[0].evidence[0], url: 'https://example.org/doc?id=1' }] });
    const two = topicItem('TWO', { evidence: [{ ...one.evidence[0], url: 'https://example.org/doc?id=2' }] });
    expect(createDailyDigest([one, two], { digestDate: '2026-09-29' }).entries).toHaveLength(2);
  });

  it('excludes candidates, future publications, future revisions and invalid dates from every projection', () => {
    const current = topicItem('CURRENT', { relatedItemIds: ['CANDIDATE', 'FUTURE', 'REVISION', 'INVALID'] });
    const hidden = [
      asReviewCandidate(topicItem('CANDIDATE')),
      topicItem('FUTURE', { publishedAt: '2026-10-01T00:00:00.000Z' }),
      topicItem('REVISION', { updatedAt: '2026-10-01T00:00:00.000Z' }),
      topicItem('INVALID', { publishedAt: 'not-a-date' }),
    ];
    const daily = createDailyDigest([current, ...hidden], { digestDate: '2026-09-29' });
    const weekly = createWeeklyDigest([current, ...hidden], {
      weekStart: '2026-09-28', weekEnd: '2026-10-04', asOfDate: '2026-09-29', validToolIds: [],
    });
    for (const digest of [daily, weekly]) {
      expect(digest.entries.map((entry) => entry.item.id)).toEqual(['CURRENT']);
      expect(digest.themes.flatMap((theme) => [...theme.relatedHistory, ...theme.additionalEntries])).toEqual([]);
      expect(digest.entries.flatMap((entry) => entry.reports).map((item) => item.id)).toEqual(['CURRENT']);
    }
  });

  it('keeps the main selection within eight minutes and exposes remaining topic material separately', () => {
    const entries = Array.from({ length: 7 }, (_, index) => topicItem(`ITEM-${index}`, {
      summary: { zh: '证'.repeat(500) },
    }));
    const digest = createDailyDigest(entries, { digestDate: '2026-09-29' });
    expect(digest.readingBudgetMinutes).toBe(8);
    expect(digest.estimatedReadMinutes).toBe(8);
    expect(digest.entries).toHaveLength(4);
    expect(digest.themes).toHaveLength(1);
    expect(digest.themes[0].additionalEntries).toHaveLength(3);
    expect(new Set([...digest.entries, ...digest.themes[0].additionalEntries].map((entry) => entry.item.id)).size).toBe(7);
    expect(createDailyDigest(entries, { digestDate: '2026-09-29', readingBudgetMinutes: 2 }).estimatedReadMinutes).toBe(2);
    expect(createDailyDigest(entries, { digestDate: '2026-09-29', readingBudgetMinutes: 0 }).entries).toEqual([]);
  });

  it('excludes publications and revisions later on the same day in a live projection', () => {
    const current = topicItem('CURRENT');
    const later = topicItem('LATER', { publishedAt: '2026-09-29T18:00:00.000Z' });
    const revision = topicItem('REVISION', { updatedAt: '2026-09-29T18:00:00.000Z' });
    const asOfTimestamp = '2026-09-29T08:00:00.000Z';
    const daily = createDailyDigest([current, later, revision], { digestDate: '2026-09-29', asOfTimestamp });
    const weekly = createWeeklyDigest([current, later, revision], {
      weekStart: '2026-09-28', weekEnd: '2026-10-04', asOfDate: '2026-09-29', asOfTimestamp, validToolIds: [],
    });
    expect(daily.entries.map((entry) => entry.item.id)).toEqual(['CURRENT']);
    expect(weekly.entries.map((entry) => entry.item.id)).toEqual(['CURRENT']);
    expect(() => createDailyDigest([], { digestDate: '2026-09-29', asOfTimestamp: 'invalid' }))
      .toThrow('asOfTimestamp must be a valid timestamp');
  });

  it('allows a shorter edition without padding and limits the number of visible themes', () => {
    const items = Array.from({ length: 6 }, (_, index) => topicItem(`TOPIC-${index}`, { topicSlugs: [`topic-${index}`] }));
    expect(createDailyDigest(items, { digestDate: '2026-09-29' }).themes).toHaveLength(3);
    const short = createDailyDigest(items.slice(0, 1), { digestDate: '2026-09-29' });
    expect(short.estimatedReadMinutes).toBe(1);
    expect(short.entries).toHaveLength(1);
  });

  it('uses actual earlier approved items for related history, never a bare related ID', () => {
    const current = topicItem('CURRENT', { relatedItemIds: ['OLD', 'MISSING'] });
    const old = topicItem('OLD', { publishedAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-02T00:00:00.000Z' });
    const digest = createWeeklyDigest([current, old], {
      weekStart: '2026-09-28', weekEnd: '2026-10-04', asOfDate: '2026-09-29', validToolIds: [],
    });
    expect(digest.themes[0].relatedHistory.map((entry) => entry.item.id)).toEqual(['OLD']);
    expect(digest.themes[0].relatedHistory[0].item.updatedAt).toBe(old.updatedAt);
    expect(digest.continuingEvents.map((entry) => entry.item.id)).toEqual(['CURRENT']);
  });

  it('places earlier daily background in related history without duplicating optional material', () => {
    const lead = topicItem('LEAD', { relatedItemIds: ['RELATED', 'MISSING'] });
    const old = topicItem('OLD', { publishedAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' });
    const related = topicItem('RELATED', { ...old, id: 'RELATED', slug: 'related', topicSlugs: [],
      evidence: [{ ...old.evidence[0], url: 'https://example.org/RELATED' }] });
    const sameDay = topicItem('SAME-DAY');
    const digest = createDailyDigest([lead, old, related, sameDay], { digestDate: '2026-09-29', limit: 1 });
    expect(digest.entries.map((entry) => entry.item.id)).toEqual(['LEAD']);
    expect(digest.themes[0].relatedHistory.map((entry) => entry.item.id).sort()).toEqual(['OLD', 'RELATED']);
    expect(digest.themes[0].additionalEntries.map((entry) => entry.item.id)).toEqual(['SAME-DAY']);
  });

  it('retains earlier seed background when owner approval gave both records the same update time', () => {
    const earlier = approvedSeedItems[0];
    const later = approvedSeedItems[1];
    expect(earlier.updatedAt).toBe('2026-08-24T04:39:04.000Z');
    expect(later.updatedAt).toBe(earlier.updatedAt);
    expect(Date.parse(earlier.publishedAt)).toBeLessThan(Date.parse(later.publishedAt));
    const digest = createDailyDigest([earlier, later], { digestDate: '2026-08-25', limit: 1 });
    expect(digest.entries.map((entry) => entry.item.id)).toEqual([later.id]);
    expect(digest.themes[0].relatedHistory.map((entry) => entry.item.id)).toEqual([earlier.id]);
    expect(digest.themes[0].additionalEntries).toEqual([]);
  });

  it('uses the weekly boundary for history even when the lead was originally published earlier', () => {
    const lead = topicItem('LEAD', { publishedAt: '2026-07-01T00:00:00.000Z' });
    const old = topicItem('OLD', { publishedAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' });
    const current = topicItem('CURRENT', { publishedAt: '2026-09-28T07:00:00.000Z', updatedAt: '2026-09-28T07:00:00.000Z' });
    const digest = createWeeklyDigest([lead, old, current], {
      weekStart: '2026-09-28', weekEnd: '2026-10-04', asOfDate: '2026-09-29', validToolIds: [], limit: 1,
    });
    expect(digest.themes[0].relatedHistory.map((entry) => entry.item.id)).toEqual(['OLD']);
    expect(digest.themes[0].additionalEntries.map((entry) => entry.item.id)).toEqual(['CURRENT']);
  });

  it('does not repeat a related history record in another topic’s optional material', () => {
    const recent = topicItem('RECENT', { topicSlugs: ['topic-a'] });
    const olderLead = topicItem('OLDER-LEAD', { topicSlugs: ['topic-b'],
      publishedAt: '2026-09-25T08:00:00.000Z', updatedAt: '2026-09-25T08:00:00.000Z' });
    const background = topicItem('BACKGROUND', { topicSlugs: ['topic-b', 'topic-a'], summary: { zh: '证'.repeat(3000) },
      publishedAt: '2026-09-26T08:00:00.000Z', updatedAt: '2026-09-26T08:00:00.000Z' });
    const digest = createDailyDigest([recent, olderLead, background], { digestDate: '2026-09-29' });
    expect(digest.themes.flatMap((theme) => theme.relatedHistory).map((entry) => entry.item.id)).toEqual(['BACKGROUND']);
    expect(digest.themes.flatMap((theme) => theme.additionalEntries)).toEqual([]);
  });

  it('keeps newer reviewed items ahead of other domains instead of filling domain quotas', () => {
    const recent = [topicItem('NEW-A'), topicItem('NEW-B')];
    const older = [
      topicItem('SALES', { domains: ['enterprise_sales'], publishedAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' }),
      topicItem('ROLE', { domains: ['role_org'], publishedAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' }),
    ];
    const digest = createDailyDigest([...older, ...recent], { digestDate: '2026-09-29', limit: 2 });
    expect(digest.entries.map((entry) => entry.item.id)).toEqual(['NEW-A', 'NEW-B']);
    expect(digest.coveredDomains).toEqual(['ai_technology']);
  });

  it('counts supporting facts, deeper analysis and source text in the article reading estimate', () => {
    const short = topicItem('SHORT');
    const long = topicItem('LONG', {
      supportingFacts: [{ id: 'fact', statement: '论'.repeat(350), evidenceIds: ['evidence'] }],
      deeperAnalysis: { mechanism: '机'.repeat(350), businessValue: '值'.repeat(350), boundary: '界'.repeat(350) },
      evidence: [{ ...short.evidence[0], title: '源'.repeat(350), publisher: '出版社' }],
    });
    const shortEstimate = createDailyDigest([short], { digestDate: '2026-09-29' }).estimatedReadMinutes;
    const longEstimate = createDailyDigest([long], { digestDate: '2026-09-29' }).estimatedReadMinutes;
    expect(longEstimate).toBeGreaterThanOrEqual(shortEstimate + 4);
    expect(createDailyDigest([long], { digestDate: '2026-09-29', readingBudgetMinutes: 4 }).entries).toEqual([]);
  });
});
