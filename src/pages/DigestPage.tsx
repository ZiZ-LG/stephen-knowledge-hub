import { useMemo } from 'react';

import type { KnowledgeTool, ReviewedKnowledgeItem } from '../domain';
import { createDailyDigest, createWeeklyDigest, type DigestEntry, type DigestTheme } from '../content/digests';
import { knowledgeTopics } from '../content/topics';
import { localize, type Language } from '../i18n';
import InternalLink from '../components/InternalLink';

function shanghaiDateOnly(now: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${read('year')}-${read('month')}-${read('day')}`;
}

function weekRange(dateOnly: string) {
  const anchor = new Date(`${dateOnly}T00:00:00.000Z`);
  const day = anchor.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(anchor);
  monday.setUTCDate(anchor.getUTCDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return {
    weekStart: monday.toISOString().slice(0, 10),
    weekEnd: sunday.toISOString().slice(0, 10),
  };
}

function displayDate(value: string, language: Language) {
  return new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function EntryLinks({
  entries,
  language,
  emptyText,
  showSummary = false,
}: {
  readonly entries: readonly DigestEntry<ReviewedKnowledgeItem>[];
  readonly language: Language;
  readonly emptyText: string;
  readonly showSummary?: boolean;
}) {
  if (entries.length === 0) return <p className='digest-empty-line'>{emptyText}</p>;
  return (
    <div className='digest-link-list'>
      {entries.map((entry) => (
        <InternalLink href={`/items/${entry.item.slug}/`} key={entry.item.id}>
          <strong>{localize(entry.item.title, language)}</strong>
          {showSummary && <span>{localize(entry.item.summary, language)}</span>}
          <span>
            {displayDate(entry.item.publishedAt.slice(0, 10), language)} · {entry.sourceCount} {language === 'zh' ? '个来源' : 'sources'}
            {entry.item.updatedAt.slice(0, 10) !== entry.item.publishedAt.slice(0, 10)
              && ` · ${language === 'zh' ? '记录更新' : 'Record updated'} ${displayDate(entry.item.updatedAt.slice(0, 10), language)}`}
          </span>
        </InternalLink>
      ))}
    </div>
  );
}

function ThemePanels({ themes, language }: {
  readonly themes: readonly DigestTheme<ReviewedKnowledgeItem>[];
  readonly language: Language;
}) {
  return <div className='digest-panel-grid'>
    {themes.map((theme) => {
      const otherReports = theme.entries.flatMap((entry) => entry.reports
        .filter((report) => report.id !== entry.item.id));
      return <article className='digest-panel' key={theme.key}>
        <p className='section-index'>{language === 'zh' ? '值得理解的主题' : 'A TOPIC TO UNDERSTAND'}</p>
        <h3>{theme.topicSlug && knowledgeTopics.some((topic) => topic.slug === theme.topicSlug)
          ? <InternalLink href={`/topics/${theme.topicSlug}/`}>{localize(theme.title, language)}</InternalLink>
          : localize(theme.title, language)}</h3>
        <p className='digest-empty-line'>
          {language === 'zh' ? '先读这条主要变化，再按需展开同主题材料。'
            : 'Start with this development, then explore the related material as needed.'}
        </p>
        <InternalLink href={`/items/${theme.lead.item.slug}/`}>
          <strong>{localize(theme.lead.item.title, language)}</strong>
        </InternalLink>
        <p>{localize(theme.lead.item.summary, language)}</p>
        <p>{localize(theme.lead.item.whyItMatters, language)}</p>
        <p className='digest-empty-line'>
          {displayDate(theme.lead.item.publishedAt.slice(0, 10), language)}
          {theme.lead.item.updatedAt.slice(0, 10) !== theme.lead.item.publishedAt.slice(0, 10)
            && ` · ${language === 'zh' ? '记录更新' : 'Record updated'} ${displayDate(theme.lead.item.updatedAt.slice(0, 10), language)}`}
        </p>
        {theme.entries.length > 1 && <details>
          <summary>{language === 'zh' ? `展开同主题的其他变化（${theme.entries.length - 1}）` : `Other developments (${theme.entries.length - 1})`}</summary>
          <EntryLinks entries={theme.entries.slice(1)} language={language} emptyText='' showSummary />
        </details>}
        {otherReports.length > 0 && <details>
          <summary>{language === 'zh' ? `同来源的其他已审记录（${otherReports.length}）` : `Other reviewed records for these sources (${otherReports.length})`}</summary>
          <div className='digest-link-list'>{otherReports.map((report) =>
            <InternalLink href={`/items/${report.slug}/`} key={report.id}>
              <strong>{localize(report.title, language)}</strong>
              <span>{localize(report.summary, language)}</span>
              <span>{displayDate(report.publishedAt.slice(0, 10), language)} · {language === 'zh' ? '核对各自的证据与适用边界' : 'Check the evidence and scope of each record'}</span>
            </InternalLink>)}</div>
        </details>}
        {theme.additionalEntries.length > 0 && <details>
          <summary>{language === 'zh' ? `更多同主题材料（${theme.additionalEntries.length}，扩展阅读）` : `More on this topic (${theme.additionalEntries.length}, optional)`}</summary>
          <EntryLinks entries={theme.additionalEntries} language={language} emptyText='' showSummary />
        </details>}
        {theme.relatedHistory.length > 0 && <details>
          <summary>{language === 'zh' ? '回看相关背景' : 'Related background'}</summary>
          <EntryLinks entries={theme.relatedHistory} language={language} emptyText='' />
        </details>}
      </article>;
    })}
  </div>;
}

export default function DigestPage({
  items,
  tools,
  language,
}: {
  readonly items: readonly ReviewedKnowledgeItem[];
  readonly tools: readonly KnowledgeTool[];
  readonly language: Language;
}) {
  const now = new Date();
  const asOfDate = shanghaiDateOnly(now);
  const asOfTimestamp = now.toISOString();
  const range = weekRange(asOfDate);
  const daily = useMemo(
    () => createDailyDigest(items, { digestDate: asOfDate, asOfTimestamp, topics: knowledgeTopics }),
    [asOfDate, asOfTimestamp, items],
  );
  const weekly = useMemo(
    () => createWeeklyDigest(items, {
      ...range,
      asOfDate,
      asOfTimestamp,
      topics: knowledgeTopics,
      validToolIds: tools.map((tool) => tool.id),
    }),
    [asOfDate, asOfTimestamp, items, range.weekEnd, range.weekStart, tools],
  );
  const recommendedTools = weekly.recommendedToolIds
    .map((id) => tools.find((tool) => tool.id === id))
    .filter((tool): tool is KnowledgeTool => tool !== undefined);

  return (
    <>
      <section className='page-intro digest-intro'>
        <p className='eyebrow'>REVIEWED DIGESTS</p>
        <h1>{language === 'zh' ? '按值得理解的主题，读懂行业 AI。' : 'Understand AI in business, one topic at a time.'}</h1>
        <p>
          {language === 'zh'
            ? '先读少量主题，按所选条目的完整内容估算 5–8 分钟阅读量；短报可以更短。其他变化、来源记录与历史可按需展开。'
            : 'Start with a few topics selected for an estimated 5–8 minutes of full-item reading. Short editions stay short; supporting records and history are optional.'}
        </p>
      </section>

      <section className='section-block' aria-labelledby='daily-digest-title'>
        <div className='section-heading section-heading-row'>
          <div>
            <p className='section-index'>DAILY DIGEST</p>
            <h2 id='daily-digest-title'>{language === 'zh' ? '主题简报' : 'Topic digest'}</h2>
          </div>
          <span className='result-count'>{language === 'zh' ? '选编截至 ' : 'Selected as of '}{displayDate(daily.digestDate, language)}</span>
        </div>

        <div className='digest-metrics' aria-label={language === 'zh' ? '今日简报指标' : 'Daily digest metrics'}>
          <article><strong>{daily.themes.length}</strong><span>{language === 'zh' ? '个主题' : 'topics'}</span></article>
          <article><strong>{daily.estimatedReadMinutes}</strong><span>{language === 'zh' ? '分钟所选条目阅读估计' : 'estimated selected-item minutes'}</span></article>
          <article><strong>{daily.sourceCount}</strong><span>{language === 'zh' ? '个信源' : 'sources'}</span></article>
          <article><strong>{daily.coveredDomains.length}/3</strong><span>{language === 'zh' ? '知识域' : 'domains'}</span></article>
        </div>

        {daily.entries.length > 0 ? (
          <>
            <ThemePanels themes={daily.themes} language={language} />
            <div className='digest-action-callout'>
              <p className='section-index'>{language === 'zh' ? '理解与应用' : 'UNDERSTAND & APPLY'}</p>
              <strong>{daily.todayAction ? localize(daily.todayAction, language) : ''}</strong>
            </div>
          </>
        ) : (
          <div className='empty-state'>
            <strong>{language === 'zh' ? '暂无可发布的今日简报' : 'No publishable daily digest yet'}</strong>
            <p>
              {language === 'zh'
                ? '今天没有符合简报规则的已批准内容；系统不会用候选或低价值条目凑数。'
                : 'No approved item meets today’s digest rules; candidates and low-value filler stay out.'}
            </p>
          </div>
        )}
      </section>

      <section className='section-block' aria-labelledby='weekly-digest-title'>
        <div className='section-heading section-heading-row'>
          <div>
            <p className='section-index'>WEEKLY DIGEST</p>
            <h2 id='weekly-digest-title'>{language === 'zh' ? '本周复盘' : 'Weekly review'}</h2>
          </div>
          <span className='result-count'>
            {displayDate(weekly.weekStart, language)} – {displayDate(weekly.weekEnd, language)}
          </span>
        </div>

        {weekly.entries.length > 0 ? (
          <details>
            <summary>{language === 'zh'
              ? `展开本周 ${weekly.themes.length} 个主题 · 主阅读约 ${weekly.estimatedReadMinutes} 分钟（扩展资料另计）`
              : `Explore ${weekly.themes.length} weekly topics · about ${weekly.estimatedReadMinutes} minutes, plus optional material`}</summary>
            <ThemePanels themes={weekly.themes} language={language} />
            <details>
            <summary>{language === 'zh' ? '按用途查阅本周条目与工具（扩展阅读）' : 'Browse weekly items and tools by purpose (optional)'}</summary>
            <div className='digest-panel-grid'>
            <article className='digest-panel digest-main-thread'>
              <p className='section-index'>MAIN THREAD</p>
              <h3>{language === 'zh' ? '本周主条目' : 'This week’s lead item'}</h3>
              {weekly.mainThread && (
                <>
                  <InternalLink href={`/items/${weekly.mainThread.item.slug}/`}>
                    {localize(weekly.mainThread.item.title, language)}
                  </InternalLink>
                  <p>{localize(weekly.mainThread.item.whyItMatters, language)}</p>
                </>
              )}
            </article>
            <article className='digest-panel'>
              <p className='section-index'>RELATED HISTORY</p>
              <h3>{language === 'zh' ? '有关联历史的主题' : 'Topics with related history'}</h3>
              <EntryLinks
                entries={weekly.continuingEvents}
                language={language}
                emptyText={language === 'zh' ? '本周条目暂无可核对的关联历史。' : 'No related history is available for this week’s entries.'}
              />
            </article>
            <article className='digest-panel'>
              <p className='section-index'>ROLE CHANGE</p>
              <h3>{language === 'zh' ? '岗位与组织变化' : 'Role and organization change'}</h3>
              <EntryLinks
                entries={weekly.roleChanges}
                language={language}
                emptyText={language === 'zh' ? '本周没有已批准的岗位变化条目。' : 'No approved role-change item this week.'}
              />
            </article>
            <article className='digest-panel'>
              <p className='section-index'>RECOMMENDED TOOLS</p>
              <h3>{language === 'zh' ? '推荐工具' : 'Recommended tools'}</h3>
              {recommendedTools.length > 0 ? (
                <div className='digest-link-list'>
                  {recommendedTools.map((tool) => (
                    <InternalLink href={`/tools/#${tool.id}`} key={tool.id}>
                      <strong>{localize(tool.title, language)}</strong>
                      <span>{tool.estimatedMinutes} min · Markdown</span>
                    </InternalLink>
                  ))}
                </div>
              ) : (
                <p className='digest-empty-line'>
                  {language === 'zh' ? '本周条目尚未形成工具推荐。' : 'No tool recommendation is available this week.'}
                </p>
              )}
            </article>
            </div>
            </details>
          </details>
        ) : (
          <div className='empty-state'>
            <strong>{language === 'zh' ? '本周暂无已批准更新' : 'No approved update this week'}</strong>
            <p>
              {language === 'zh'
                ? '周报按公开条目的发布时间或记录更新时间选取；日期不说明修订原因，没有足够元数据时不称为实质新增或纠错。'
                : 'The weekly review uses publication or record-update dates. Dates alone do not establish a substantive change or correction.'}
            </p>
          </div>
        )}
      </section>

      <section className='digest-policy-note'>
        <div>
          <p className='section-index'>EDITORIAL CONTROL</p>
          <h2>{language === 'zh' ? '摘要不是新的事实来源。' : 'A digest is not a new source of facts.'}</h2>
        </div>
        <p>
          {language === 'zh'
            ? '每条内容仍保留原始证据、风险与审核状态。自动发布默认关闭，来源冲突和中高风险内容始终进入人工队列。'
            : 'Every item retains its evidence, risk and review state. Automatic publishing stays disabled by default; conflicts and medium/high risk always require review.'}
        </p>
      </section>
    </>
  );
}
