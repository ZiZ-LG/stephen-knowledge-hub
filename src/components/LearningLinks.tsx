import { learningUnits } from '../learning/access';
import type { Language } from '../i18n';
import InternalLink from './InternalLink';

export default function LearningLinks({ topicSlugs, toolId, language }: { readonly topicSlugs?: readonly string[]; readonly toolId?: string; readonly language: Language }) {
  const units = learningUnits.filter((unit) => toolId ? unit.toolIds.includes(toolId) : unit.topicSlugs.some((slug) => topicSlugs?.includes(slug)));
  if (!units.length) return null;
  return <aside className='learning-connections'><p className='section-index'>{language === 'zh' ? '补上理解这一问题所需的基础' : 'UNDERSTAND THE FOUNDATIONS'}</p>
    <div className='link-stack'>{units.slice(0, 3).map((unit) => <InternalLink href={`/learn/${unit.slug}/`} key={unit.id}><strong>{unit.title}</strong><span>{unit.summary}</span></InternalLink>)}</div>
    {units.length > 3 && <details className='learning-more'><summary>{language === 'zh' ? `再看 ${units.length - 3} 个相关单元` : `Show ${units.length - 3} more lessons`}</summary><div className='link-stack'>{units.slice(3).map((unit) => <InternalLink href={`/learn/${unit.slug}/`} key={unit.id}><strong>{unit.title}</strong><span>{unit.summary}</span></InternalLink>)}</div></details>}
  </aside>;
}
