import type { ReactNode } from 'react';

export interface ExplainerSection {
  readonly id: string;
  readonly title: string;
  readonly content: ReactNode;
}

/** Present reviewed teaching material; this component does not publish or generate facts. */
export default function ThemeExplainer({
  title, summary, asOfDate, context, sections, takeaway, question, answer, sources, history,
}: {
  readonly title: string;
  readonly summary: string;
  readonly asOfDate: string;
  readonly context: string;
  readonly sections: readonly ExplainerSection[];
  readonly takeaway: string;
  readonly question: string;
  readonly answer: ReactNode;
  readonly sources: ReactNode;
  readonly history: ReactNode;
}) {
  return (
    <article className='theme-explainer'>
      <header className='theme-explainer-intro'>
        <p className='eyebrow'>行业 AI · 把一个问题讲清楚</p>
        <h1>{title}</h1>
        <p className='lead'>{summary}</p>
        <p className='theme-reading-note'>信息截至 <time dateTime={asOfDate}>{asOfDate}</time> · 主文与演示约 5–8 分钟（估计）</p>
        <p>{context}</p>
        <nav className='theme-outline' aria-label='本篇内容'>
          {sections.map((section) => <a href={`#${section.id}`} key={section.id}>{section.title}</a>)}
        </nav>
      </header>
      {sections.map((section, index) => (
        <section className='theme-section' id={section.id} aria-labelledby={`${section.id}-title`} key={section.id}>
          <p className='section-index'>{String(index + 1).padStart(2, '0')}</p>
          <h2 id={`${section.id}-title`}>{section.title}</h2>
          {section.content}
        </section>
      ))}
      <section className='theme-takeaway'>
        <p className='section-index'>最值得记住</p>
        <h2>{takeaway}</h2>
        <p>{question}</p>
        <details><summary>展开参考解释</summary>{answer}</details>
      </section>
      <details className='theme-reading-more'>
        <summary>与此前内容有什么联系</summary>
        {history}
      </details>
      <details className='theme-reading-more' id='theme-sources'>
        <summary>原始资料、日期与证据边界</summary>
        {sources}
      </details>
    </article>
  );
}
