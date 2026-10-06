import {
  KNOWLEDGE_DOMAINS,
  type KnowledgeDomain,
  type KnowledgeItem,
  type KnowledgeTopic,
  type LocalizedText,
  type ReviewedKnowledgeItem,
} from '../domain';

export interface DigestEntry<T extends KnowledgeItem = KnowledgeItem> {
  readonly item: T;
  readonly eventKey: string;
  readonly estimatedReadMinutes: number;
  readonly sourceCount: number;
  readonly action: LocalizedText;
  /** Same primary source; individual reports retain their evidence and dates. */
  readonly reports: readonly T[];
}

export interface DigestTheme<T extends KnowledgeItem = KnowledgeItem> {
  readonly key: string;
  readonly topicSlug: string | null;
  readonly title: LocalizedText;
  readonly lead: DigestEntry<T>;
  readonly entries: readonly DigestEntry<T>[];
  readonly additionalEntries: readonly DigestEntry<T>[];
  readonly relatedHistory: readonly DigestEntry<T>[];
}

export interface DailyDigest<T extends KnowledgeItem = KnowledgeItem> {
  readonly kind: 'daily';
  readonly digestDate: string;
  readonly entries: readonly DigestEntry<T>[];
  readonly coveredDomains: readonly KnowledgeDomain[];
  readonly estimatedReadMinutes: number;
  readonly sourceCount: number;
  readonly todayAction: LocalizedText | null;
  readonly themes: readonly DigestTheme<T>[];
  readonly readingBudgetMinutes: number;
}

export interface WeeklyDigest<T extends KnowledgeItem = KnowledgeItem> {
  readonly kind: 'weekly';
  readonly weekStart: string;
  readonly weekEnd: string;
  readonly entries: readonly DigestEntry<T>[];
  readonly coveredDomains: readonly KnowledgeDomain[];
  readonly estimatedReadMinutes: number;
  readonly sourceCount: number;
  readonly mainThread: DigestEntry<T> | null;
  readonly continuingEvents: readonly DigestEntry<T>[];
  readonly roleChanges: readonly DigestEntry<T>[];
  readonly recommendedToolIds: readonly string[];
  readonly themes: readonly DigestTheme<T>[];
  readonly readingBudgetMinutes: number;
}

interface DigestReadingOptions {
  readonly limit?: number;
  readonly themeLimit?: number;
  readonly readingBudgetMinutes?: number;
  readonly topics?: readonly Pick<KnowledgeTopic, 'slug' | 'title'>[];
  /** Live views pass a clock cutoff; date-only historical projections stay supported. */
  readonly asOfTimestamp?: string;
}

interface DailyDigestOptions extends DigestReadingOptions {
  readonly digestDate: string;
}

interface WeeklyDigestOptions extends DigestReadingOptions {
  readonly weekStart: string;
  readonly weekEnd: string;
  readonly asOfDate?: string;
  readonly validToolIds: readonly string[];
}

const freshnessPriority: Readonly<Record<KnowledgeItem['freshness'], number>> = {
  breaking: 3,
  current: 2,
  evergreen: 1,
};

function validateDateOnly(value: string, label: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must use YYYY-MM-DD`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} must use YYYY-MM-DD`);
  }
}

function effectiveTimestamp(item: KnowledgeItem) {
  return Math.max(Date.parse(item.publishedAt), Date.parse(item.updatedAt));
}

function compareRecordedDates(left: KnowledgeItem, right: KnowledgeItem) {
  return effectiveTimestamp(left) - effectiveTimestamp(right)
    || Date.parse(left.publishedAt) - Date.parse(right.publishedAt);
}

function compareDigestValue<T extends KnowledgeItem>(left: T, right: T) {
  return freshnessPriority[right.freshness] - freshnessPriority[left.freshness]
    || compareRecordedDates(right, left)
    || left.id.localeCompare(right.id);
}

function normalizeEvidenceUrl(value: string) {
  try {
    const url = new URL(value);
    // Only remove tracking keys: other query parameters may identify a document.
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_/i.test(key) || /^(fbclid|gclid)$/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    url.hash = '';
    url.hostname = url.hostname.toLocaleLowerCase();
    url.pathname = url.pathname === '/' ? '/' : url.pathname.replace(/\/+$/, '');
    return url.href;
  } catch {
    return '';
  }
}

function dedupeApprovedItems<T extends KnowledgeItem>(items: readonly T[]) {
  const groups = new Map<string, Map<string, T>>();
  for (const item of items.filter((entry) => entry.editorialStatus === 'approved')) {
    const primaryUrl = normalizeEvidenceUrl(item.evidence[0]?.url ?? '');
    const key = primaryUrl ? `source:${primaryUrl}` : `item:${item.id}`;
    const reports = groups.get(key) ?? new Map<string, T>();
    reports.set(item.id, item);
    groups.set(key, reports);
  }
  return [...groups.entries()]
    .map(([eventKey, group]) => {
      const reports = [...group.values()].sort((left, right) =>
        effectiveTimestamp(right) - effectiveTimestamp(left) || compareDigestValue(left, right));
      return { eventKey, item: reports[0], reports };
    })
    .sort((left, right) => compareDigestValue(left.item, right.item));
}

function estimateReadMinutes(item: KnowledgeItem) {
  const reviewed = item as KnowledgeItem & Partial<Pick<ReviewedKnowledgeItem, 'supportingFacts' | 'deeperAnalysis'>>;
  const text = [
    item.title.zh,
    item.summary.zh,
    item.whyItMatters.zh,
    item.salesImplication.zh,
    item.roleOrgImplication.zh,
    item.nextAction.zh,
    ...(reviewed.supportingFacts?.map((fact) => fact.statement) ?? []),
    reviewed.deeperAnalysis?.mechanism ?? '',
    reviewed.deeperAnalysis?.businessValue ?? '',
    reviewed.deeperAnalysis?.boundary ?? '',
    ...item.evidence.flatMap((evidence) => [evidence.title, evidence.publisher]),
  ].join(' ');
  const cjkCharacters = text.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const latinWords = text.replace(/[\u3400-\u9fff]/g, ' ').match(/[A-Za-z0-9]+/g)?.length ?? 0;
  return Math.max(1, Math.ceil(cjkCharacters / 350 + latinWords / 180));
}

function toDigestEntry<T extends KnowledgeItem>(
  entry: { readonly eventKey: string; readonly item: T; readonly reports: readonly T[] },
): DigestEntry<T> {
  return {
    item: entry.item,
    eventKey: entry.eventKey,
    reports: entry.reports,
    estimatedReadMinutes: estimateReadMinutes(entry.item),
    sourceCount: new Set(entry.reports.flatMap((report) => report.evidence.map((evidence) => evidence.sourceId))).size,
    action: entry.item.nextAction,
  };
}

function summarizeEntries<T extends KnowledgeItem>(entries: readonly DigestEntry<T>[]) {
  const domains = new Set(entries.flatMap((entry) => entry.item.domains));
  const sources = new Set(entries.flatMap((entry) =>
    entry.reports.flatMap((report) => report.evidence.map((evidence) => evidence.sourceId))));
  return {
    coveredDomains: KNOWLEDGE_DOMAINS.filter((domain) => domains.has(domain)),
    estimatedReadMinutes: entries.reduce(
      (total, entry) => total + entry.estimatedReadMinutes,
      0,
    ),
    sourceCount: sources.size,
  };
}

function availableBy(item: KnowledgeItem, asOfDate: string, asOfTimestamp?: string) {
  return item.editorialStatus === 'approved'
    && Number.isFinite(Date.parse(item.publishedAt))
    && Number.isFinite(Date.parse(item.updatedAt))
    && dateOnly(item.publishedAt) <= asOfDate
    && dateOnly(item.updatedAt) <= asOfDate
    && (asOfTimestamp === undefined || effectiveTimestamp(item) <= Date.parse(asOfTimestamp));
}

function validateClockCutoff(value: string | undefined) {
  if (value !== undefined && !Number.isFinite(Date.parse(value))) {
    throw new Error('asOfTimestamp must be a valid timestamp');
  }
}

function boundedOption(value: number | undefined, fallback: number, maximum: number) {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(Math.floor(value), maximum));
}

function projectThemes<T extends KnowledgeItem>(
  items: readonly T[],
  history: readonly T[],
  options: DigestReadingOptions,
  historyWindowStart?: string,
) {
  const historyEvents = dedupeApprovedItems(history).map(toDigestEntry);
  const historyByKey = new Map(historyEvents.map((entry) => [entry.eventKey, entry]));
  const events = dedupeApprovedItems(items).map((entry) => toDigestEntry({
    ...entry,
    reports: historyByKey.get(entry.eventKey)?.reports ?? entry.reports,
  }));
  const limit = boundedOption(options.limit, 5, 5);
  const themeLimit = boundedOption(options.themeLimit, 3, 3);
  const readingBudgetMinutes = boundedOption(options.readingBudgetMinutes, 8, 8);
  const topicBySlug = new Map(options.topics?.map((topic) => [topic.slug, topic]));
  const topicCounts = new Map<string, number>();
  for (const entry of events) {
    for (const slug of new Set(entry.item.topicSlugs)) {
      topicCounts.set(slug, (topicCounts.get(slug) ?? 0) + 1);
    }
  }
  // An entry appears once. Prefer a shared explicit topic, with author order as
  // the tie-breaker; never infer a topic from similar wording or related IDs.
  const topicFor = (entry: DigestEntry<T>) => [...new Set(entry.item.topicSlugs)]
    .sort((left, right) => (topicCounts.get(right) ?? 0) - (topicCounts.get(left) ?? 0))[0] ?? null;
  const selected: DigestEntry<T>[] = [];
  const selectedKeys = new Set<string>();
  const selectedThemes = new Set<string>();
  let minutes = 0;
  const add = (entry: DigestEntry<T>) => {
    const topicSlug = topicFor(entry);
    const key = topicSlug ? `topic:${topicSlug}` : entry.eventKey;
    if (selectedKeys.has(entry.eventKey) || selected.length >= limit
      || minutes + entry.estimatedReadMinutes > readingBudgetMinutes
      || (!selectedThemes.has(key) && selectedThemes.size >= themeLimit)) return;
    selected.push(entry);
    selectedKeys.add(entry.eventKey);
    selectedThemes.add(key);
    minutes += entry.estimatedReadMinutes;
  };
  // Reviewed items retain their freshness/date order; no domain quota overrides it.
  events.forEach(add);
  const groups = new Map<string, DigestEntry<T>[]>();
  for (const entry of selected) {
    const slug = topicFor(entry);
    const key = slug ? `topic:${slug}` : entry.eventKey;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  const themes: DigestTheme<T>[] = [...groups.entries()].map(([key, entries]) => {
    const topicSlug = topicFor(entries[0]);
    const ids = new Set(entries.flatMap((entry) => entry.reports.map((report) => report.id)));
    const relatedIds = new Set(entries.flatMap((entry) => entry.reports.flatMap((report) => report.relatedItemIds)));
    const earliestSelected = [...entries]
      .sort((left, right) => compareRecordedDates(left.item, right.item))[0].item;
    const relatedHistory = historyEvents.filter((entry) =>
      !selectedKeys.has(entry.eventKey)
      && (historyWindowStart === undefined
        ? compareRecordedDates(entry.item, earliestSelected) < 0
        : effectiveDate(entry.item) < historyWindowStart)
      && entry.reports.some((report) => relatedIds.has(report.id)
        || report.relatedItemIds.some((id) => ids.has(id))
        || (topicSlug !== null && report.topicSlugs.includes(topicSlug))));
    return {
      key,
      topicSlug,
      title: (topicSlug ? topicBySlug.get(topicSlug)?.title : undefined) ?? entries[0].item.title,
      lead: entries[0],
      entries,
      additionalEntries: events.filter((entry) => !selectedKeys.has(entry.eventKey)
        && topicSlug !== null && topicFor(entry) === topicSlug),
      relatedHistory,
    };
  });
  const historicalKeys = new Set(themes.flatMap((theme) => theme.relatedHistory.map((entry) => entry.eventKey)));
  return {
    entries: selected,
    themes: themes.map((theme) => ({
      ...theme,
      additionalEntries: theme.additionalEntries.filter((entry) => !historicalKeys.has(entry.eventKey)),
    })),
    readingBudgetMinutes,
  };
}

export function createDailyDigest<T extends KnowledgeItem>(
  items: readonly T[],
  options: DailyDigestOptions,
): DailyDigest<T> {
  validateDateOnly(options.digestDate, 'digestDate');
  validateClockCutoff(options.asOfTimestamp);
  const available = items.filter((item) => availableBy(item, options.digestDate, options.asOfTimestamp));
  const { entries, themes, readingBudgetMinutes } = projectThemes(available, available, options);
  const summary = summarizeEntries(entries);
  return {
    kind: 'daily',
    digestDate: options.digestDate,
    entries,
    themes,
    readingBudgetMinutes,
    ...summary,
    todayAction: entries[0]?.action ?? null,
  };
}

function dateOnly(timestamp: string) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function effectiveDate(item: KnowledgeItem) {
  return dateOnly(new Date(effectiveTimestamp(item)).toISOString());
}

function extractToolIds(item: KnowledgeItem) {
  const candidate = item as KnowledgeItem & { readonly toolIds?: unknown };
  if (!Array.isArray(candidate.toolIds)) return [];
  return candidate.toolIds.filter((id): id is string => typeof id === 'string');
}

export function createWeeklyDigest<T extends KnowledgeItem>(
  items: readonly T[],
  options: WeeklyDigestOptions,
): WeeklyDigest<T> {
  validateDateOnly(options.weekStart, 'weekStart');
  validateDateOnly(options.weekEnd, 'weekEnd');
  if (options.weekStart > options.weekEnd) {
    throw new Error('weekStart must not be after weekEnd');
  }

  const asOfDate = options.asOfDate ?? options.weekEnd;
  validateDateOnly(asOfDate, 'asOfDate');
  validateClockCutoff(options.asOfTimestamp);
  const available = items.filter((item) => availableBy(item, asOfDate, options.asOfTimestamp));
  const inWindow = available.filter((item) => {
    const effective = effectiveDate(item);
    return effective >= options.weekStart && effective <= options.weekEnd;
  });
  const { entries, themes, readingBudgetMinutes } = projectThemes(inWindow, available, options, options.weekStart);
  const summary = summarizeEntries(entries);
  const validToolIds = new Set(options.validToolIds);
  const recommendedToolIds = [...new Set(entries.flatMap((entry) =>
    extractToolIds(entry.item).filter((toolId) => validToolIds.has(toolId))))];

  return {
    kind: 'weekly',
    weekStart: options.weekStart,
    weekEnd: options.weekEnd,
    entries,
    themes,
    readingBudgetMinutes,
    ...summary,
    mainThread: entries[0] ?? null,
    // Compatibility field: explicit related history is not proof of a continuing
    // event or a correction. The view labels it as history, not a new claim.
    continuingEvents: themes.filter((theme) => theme.relatedHistory.length > 0).map((theme) => theme.lead),
    roleChanges: entries.filter((entry) => entry.item.domains.includes('role_org')),
    recommendedToolIds,
  };
}
