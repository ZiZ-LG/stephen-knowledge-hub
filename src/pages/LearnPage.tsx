import { useState } from 'react';
import type { Language } from '../i18n';
import InternalLink from '../components/InternalLink';
import { learningUnits, searchLearningUnits } from '../learning/access';
import { useLearning } from '../learning/LearningContext';

const groups = [
  { id: 'all', title: '全部单元' }, { id: 'principles', title: '理解能力' },
  { id: 'customer', title: '判断客户问题' }, { id: 'practice', title: '验证与协作' },
] as const;
export default function LearnPage({ language }: { readonly language: Language }) {
  const [group, setGroup] = useState<string>('all');
  const [query, setQuery] = useState('');
  const { state, saveError } = useLearning();
  const units = searchLearningUnits(learningUnits, query).filter((unit) => group === 'all' || unit.group === group);
  const last = learningUnits.find((unit) => unit.slug === state.lastSlug);
  const completed = learningUnits.filter((unit) => state.completedIds.includes(unit.id)).length;
  const terms = [...new Map(learningUnits.flatMap((unit) => unit.concepts.map((term) => [term.term, { ...term, slug: unit.slug }] as const))).values()];
  return <>
    <section className='page-intro'>
      <p className='eyebrow'>LEARNING MAP</p>
      <h1>{language === 'zh' ? '把零散信息，变成能解释的判断。' : 'Turn scattered information into sound judgment.'}</h1>
      <p>从你正在遇到的问题开始。每个单元用原理、业务场景与自测讲清一个判断，再连接到行业观察和可编辑工具。</p>
      <div className='hero-actions'>
        {last && <InternalLink className='primary-action' href={`/learn/${last.slug}/`}>继续阅读：{last.title}</InternalLink>}
        <InternalLink className='secondary-action' href='/digest/'>先看主题简报 →</InternalLink>
      </div>
      <p className='learning-progress-note'>已标记完成自测 {completed} / {learningUnits.length} 个单元 · 进度仅保存在当前浏览器</p>
      {saveError && <p role='status'>学习进度暂时无法保存；原有记录没有被覆盖，本页仍可阅读。</p>}
    </section>
    {learningUnits.length > 0 && <section className='learning-starts' aria-label='按当前问题选择起点'>
      <InternalLink href='/learn/ai-foundations/'><span>01 · 听懂技术讨论</span><strong>模型到底能做什么？</strong><p>先理解模型、知识库和工具调用。</p></InternalLink>
      <InternalLink href='/learn/customer-discovery/'><span>02 · 准备客户会谈</span><strong>客户的流程卡在哪里？</strong><p>把模糊的 AI 兴趣变成可核实的问题。</p></InternalLink>
      <InternalLink href='/learn/pilot-evaluation/'><span>03 · 推进试点与协作</span><strong>怎样判断值得继续？</strong><p>连接效果验证、责任与采用条件。</p></InternalLink>
    </section>}
    <section className='section-block' aria-labelledby='learning-units-title'>
      <div className='section-heading'><p className='section-index'>BUILD YOUR UNDERSTANDING</p><h2 id='learning-units-title'>选择一个值得弄懂的问题</h2></div>
      <div className='learning-filter'>
        <div className='learning-tabs' aria-label='学习方向'>{groups.map((entry) => <button type='button' key={entry.id} aria-pressed={group === entry.id} onClick={() => setGroup(entry.id)}>{entry.title}</button>)}</div>
        <label>搜索概念或问题<input type='search' value={query} onChange={(event) => setQuery(event.target.value)} placeholder='例如：RAG、客户问题、评测' /></label>
      </div>
      <div className='learning-grid'>{units.map((unit) => <InternalLink className='learning-card' href={`/learn/${unit.slug}/`} key={unit.id}>
        <span className='section-index'>{groups.find((entry) => entry.id === unit.group)?.title} · 约 {unit.minutes} 分钟</span>
        <h3>{unit.title}</h3><p>{unit.summary}</p><span className='learning-card-footer'>{state.completedIds.includes(unit.id) ? '✓ 已标记完成自测' : '阅读、理解与自测'} →</span>
      </InternalLink>)}</div>
      {units.length === 0 && <p className='empty-state'>{learningUnits.length ? '没有匹配的单元，试试更短的关键词或切回全部。' : '新的学习内容正在审核。你仍可浏览已有主题与方法工具。'}</p>}
    </section>
    {terms.length > 0 && <section className='section-block' id='concepts'><div className='section-heading'><p className='section-index'>CONCEPTS IN CONTEXT</p><h2>碰到术语，回到它解决的问题</h2></div>
      <details className='learning-glossary'><summary>展开 {terms.length} 个概念的简短解释</summary><dl>{terms.map((term) => <div key={term.term}><dt><InternalLink href={`/learn/${term.slug}/`}>{term.term}</InternalLink></dt><dd>{term.meaning}</dd></div>)}</dl></details>
    </section>}
    <section className='section-block learning-origin'><h2>一套学习内容，连接日常工作</h2><p>原手册中可复用的概念、客户发现、价值判断、试点和职业证据，已按问题重新组织。旧岗位样本、未来年份预测与倒计时任务不再作为当前学习依据。</p><InternalLink href='/library/#legacy-learning'>查阅或导出旧版学习记录 →</InternalLink></section>
  </>;
}
