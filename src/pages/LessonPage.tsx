import { lazy, Suspense, useEffect } from 'react';
import type { Language } from '../i18n';
import type { LearningUnit } from '../learning/types';
import { learningUnits, learningPractices } from '../learning/access';
import { useLearning } from '../learning/LearningContext';
import { knowledgeTools } from '../content/tools';
import { knowledgeTopics } from '../content/topics';
import { approvedKnowledgeItems } from '../content/publicItems';
import InternalLink from '../components/InternalLink';
import ThemeExplainer from '../components/ThemeExplainer';

const RagLesson = import.meta.env.DEV || __LEARNING_RELEASE_APPROVED__ ? lazy(() => import('../examples/RagThemeExample')) : null;
const legacyLabels: Readonly<Record<string, string>> = {
  definition: '职业定位', profile: '能力框架', literacy: '技术概念', preparation: '准备路线',
  answering: '案例表达', questions: '情境问题', 'interview-day': '面试准备', future: '长期能力', sources: '岗位研究',
};

export default function LessonPage({ unit, language }: { readonly unit: LearningUnit; readonly language: Language }) {
  const { state, toggleBookmark, toggleComplete, visit, saveError } = useLearning();
  useEffect(() => visit(unit.slug), [unit.slug, visit]);
  const bookmarked = state.bookmarkedIds.includes(unit.id);
  const completed = state.completedIds.includes(unit.id);
  const tools = knowledgeTools.filter((tool) => unit.toolIds.includes(tool.id));
  const related = approvedKnowledgeItems.filter((item) => unit.relatedItemIds.includes(item.id));
  const topics = knowledgeTopics.filter((topic) => unit.topicSlugs.includes(topic.slug));
  const practices = learningPractices.filter((practice) => practice.lessonSlug === unit.slug);
  const next = learningUnits[learningUnits.findIndex((entry) => entry.id === unit.id) + 1];
  return <>
    <div className='lesson-toolbar'><InternalLink className='back-link' href='/learn/'>← 学习地图</InternalLink><button type='button' aria-pressed={bookmarked} onClick={() => toggleBookmark(unit.id)}>{bookmarked ? '★ 已收藏此单元' : '☆ 收藏此单元'}</button></div>
    {language === 'en' && <p className='language-fallback'>This learning edition is available in Chinese.</p>}
    {unit.slug === 'knowledge-answers' && RagLesson ? <Suspense fallback={<p>正在加载讲解…</p>}><RagLesson /></Suspense> : <ThemeExplainer
      title={unit.title} summary={unit.summary} asOfDate='2026-10-05' readingMinutes={unit.minutes}
      context='通用企业场景。行业背景待补充：具体业务环节、资料类型、责任分工与错误后果。下文的方法属于编辑建议，真实项目需要按客户情况验证。'
      sections={[
        { id: 'understand', title: '先把概念说清楚', content: <dl className='lesson-concepts'>{unit.concepts.map((concept) => <div key={concept.term}><dt>{concept.term}</dt><dd>{concept.meaning}</dd></div>)}</dl> },
        { id: 'mechanism', title: '原来怎样做，现在什么变了', content: <>{unit.explanation.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}<ol className='lesson-steps'>{unit.steps.map((step) => <li key={step.title}><strong>{step.title}</strong><p>{step.detail}</p></li>)}</ol></> },
        { id: 'scenario', title: '放进一个业务场景', content: <><p><strong>虚构示例：</strong>{unit.example.scene.replace(/^虚构示例[:：]\s*/, '')}</p><dl className='lesson-scenario'>{[
          ['输入什么', unit.example.input], ['AI 完成什么', unit.example.ai], ['人负责什么', unit.example.human], ['输出交给谁', unit.example.next], ['效果取决于什么', unit.example.conditions],
        ].map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl></> },
        { id: 'judgment', title: '带着这些问题了解客户', content: <><p>以下问题用于验证业务条件，不能替代客户事实或证明已取得收益。</p><ul>{unit.judgments.map((judgment) => <li key={judgment}>{judgment}</li>)}</ul></> },
      ]}
      takeaway={unit.takeaway} question={unit.quiz.question} answer={<p>{unit.quiz.answer}</p>}
      history={<><p>本单元将原手册的{unit.legacySections.map((section) => legacyLabels[section] ?? '相关内容').join('、')}改写为可反复使用的判断方法。旧招聘快照与年份预测不作为当前事实。</p><div className='link-stack'>{related.map((item) => <InternalLink href={`/items/${item.slug}/`} key={item.id}><strong>{item.title.zh}</strong><span>历史观察 · {item.publishedAt.slice(0, 10)} · 请结合资料日期阅读</span></InternalLink>)}</div></>}
      sources={<><p>来源用于核对原理与条件；练习步骤、虚构场景和客户问题是本站的教学组织，不是来源宣称的部署效果。</p><ol className='theme-source-list'>{unit.sources.map((source) => <li key={source.url}><a href={source.url} target='_blank' rel='noopener noreferrer'>{source.title}</a><p>核对日期：{source.checkedAt}。{source.scope}</p></li>)}</ol></>}
    />}
    {practices.length > 0 && <section className='section-block optional-practices' aria-labelledby='practice-title'><p className='section-index'>TRY A SITUATION</p><h2 id='practice-title'>换一个情境，你会怎样判断？</h2><p>可选练习，不计入主文阅读时间，也不要求按天打卡。先想一想，再展开参考思路。参考思路是编辑建议；个人经历必须由你自己提供。</p>{practices.map((practice) => <details className='practice-card' id={practice.id.toLowerCase()} key={practice.id}><summary>{practice.title}</summary><p className='practice-question'>{practice.question}</p><h3>参考思路</h3><ol>{practice.guide.map((step) => <li key={step}>{step}</li>)}</ol><InternalLink href={`/tools/#${practice.toolId}`}>用「{knowledgeTools.find((tool) => tool.id === practice.toolId)?.title.zh ?? '方法工具'}」整理你的判断 →</InternalLink></details>)}</section>}
    <section className='section-block lesson-practice'><p className='section-index'>PUT UNDERSTANDING TO WORK</p><h2>需要整理判断时，再用一份工具</h2><p>阅读与自测本身就是有效学习。不必为了完成单元填写客户资料；需要练习时，优先使用虚构或脱敏场景。</p><div className='link-stack'>{tools.map((tool) => <InternalLink href={`/tools/#${tool.id}`} key={tool.id}><strong>{tool.title.zh}</strong><span>{tool.scenario.zh}</span></InternalLink>)}</div></section>
    <section className='lesson-finish'><div><h2>你能用自己的话解释了吗？</h2><p>阅读不会自动标为完成；自测后由你记录。收藏和自测进度只保存在当前浏览器。</p>{saveError && <p role='status'>本机保存失败或原记录无法读取；原记录没有被覆盖。</p>}</div><button type='button' aria-pressed={completed} onClick={() => toggleComplete(unit.id)}>{completed ? '✓ 已完成自测（点击撤销）' : '标记已完成自测'}</button></section>
    <section className='section-block'><p className='section-index'>FOLLOW THE CHANGES</p><h2>回到行业里，看这些判断如何被检验</h2><div className='link-stack'>{topics.map((topic) => <InternalLink key={topic.slug} href={`/topics/${topic.slug}/`}><strong>{topic.title.zh}</strong><span>{topic.summary.zh}</span></InternalLink>)}</div></section>
    <nav className='lesson-next' aria-label='继续学习'><InternalLink href='/learn/'>返回学习地图</InternalLink>{next && <InternalLink href={`/learn/${next.slug}/`}>下一个问题：{next.title} →</InternalLink>}</nav>
  </>;
}
