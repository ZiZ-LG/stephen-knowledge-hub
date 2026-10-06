import type { KnowledgeTool, KnowledgeTopic, ReviewedKnowledgeItem } from '../domain';
import { localize, type Language } from '../i18n';
import { selectTodayItems } from '../navigation';
import { learningUnits } from '../learning/access';
import InternalLink from '../components/InternalLink';
import KnowledgeCard from '../components/KnowledgeCard';
import TopicGrid from '../components/TopicGrid';

export default function TodayPage({ items, topics, tools, language }: {
  readonly items: readonly ReviewedKnowledgeItem[];
  readonly topics: readonly KnowledgeTopic[];
  readonly tools: readonly KnowledgeTool[];
  readonly language: Language;
}) {
  const selection = selectTodayItems(items, { limit: 3 });
  const featured = learningUnits.find((unit) => unit.slug === 'knowledge-answers');
  return <>
    <section className='hero page-hero unified-hero' aria-labelledby='hero-title'>
      <div><p className='eyebrow'>AI · CUSTOMERS · JUDGMENT</p><h1 id='hero-title'>{language === 'zh' ? '看懂 AI 变化，读懂客户的新问题。' : 'Understand AI. Understand your customers.'}</h1>
        <p className='hero-copy'>{language === 'zh' ? '为有客户与业务经验的大客户销售而写。用主题简报了解变化，用学习单元补齐原理，再把理解带进客户流程与采购判断。' : 'Briefings, explanations and practical methods for experienced enterprise sellers navigating AI.'}</p>
        <div className='hero-actions'><InternalLink className='primary-action' href='/digest/'>{language === 'zh' ? '阅读主题简报 · 约 5–8 分钟' : 'Read the topic briefing'}</InternalLink><InternalLink className='secondary-action' href='/learn/'>{language === 'zh' ? '从一个问题开始学' : 'Start with a question'}</InternalLink></div>
      </div>
      <aside className='home-learning-loop' aria-label='阅读与应用路径'><span>一次阅读，留下一个判断</span><ol><li><strong>看变化</strong><p>发生了什么，依据在哪里</p></li><li><strong>懂原理</strong><p>怎么工作，哪些条件不可缺</p></li><li><strong>问客户</strong><p>影响哪个流程，由谁决定</p></li></ol></aside>
    </section>
    {featured && <section className='section-block featured-lesson'><div><p className='section-index'>START HERE · 一个问题讲清楚</p><h2>知识库有了答案，就能替客户作决定吗？</h2><p>从一个售后场景看清资料、权限、回答和审批的关系。改变条件，观察回答为何要变化。</p><InternalLink className='primary-action' href={`/learn/${featured.slug}/`}>读讲解，试一试 →</InternalLink></div><div className='featured-sequence' aria-label='知识库业务流程'><span>获准使用的资料</span><b aria-hidden='true'>↓</b><span>带依据的回答</span><b aria-hidden='true'>↓</b><span>有责任人的下一步</span></div></section>}
    <section className='section-block' aria-labelledby='reading-title'><div className='section-heading section-heading-row'><div><p className='section-index'>REVIEWED READING</p><h2 id='reading-title'>带着原理，回看真实变化</h2></div><InternalLink href='/radar/'>全部行业观察 →</InternalLink></div><p className='section-description'>已审核内容按原始日期呈现。较早的观察可作背景，不代表今天的新消息；遇到产品能力或数字，回到来源核对适用时间。</p><div className='knowledge-grid'>{selection.map((item) => <KnowledgeCard key={item.id} item={item} language={language} />)}</div>{selection.length === 0 && <p className='empty-state'>当前没有已批准的行业观察。</p>}</section>
    <section className='section-block' aria-labelledby='home-topics'><div className='section-heading section-heading-row'><div><p className='section-index'>CUSTOMER QUESTIONS</p><h2 id='home-topics'>从客户正在遇到的问题进入</h2></div><InternalLink href='/topics/'>全部专题 →</InternalLink></div><TopicGrid topics={topics.slice(0, 3)} items={items} language={language} /></section>
    <section className='section-block split-block'><div><p className='section-index'>FROM UNDERSTANDING TO PRACTICE</p><h2>需要推进工作时，再打开工具</h2><p>保留八个可编辑工具。把访谈、价值假设或试点标准写成材料，自动保存在当前浏览器，也可以复制下载。</p><InternalLink href='/learn/'>先找到对应学习单元 →</InternalLink></div><div className='link-stack'>{tools.filter((tool) => ['discovery-interview', 'value-hypothesis-one-pager', 'poc-success-canvas'].includes(tool.id)).map((tool) => <InternalLink key={tool.id} href={`/tools/#${tool.id}`}><strong>{localize(tool.title, language)}</strong><span>{localize(tool.scenario, language)}</span></InternalLink>)}</div></section>
  </>;
}
