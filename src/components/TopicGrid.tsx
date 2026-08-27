import type { KnowledgeItem, KnowledgeTopic } from '../domain';
import { domainLabels, localize, type Language } from '../i18n';
import { selectTopicItems } from '../navigation';
import InternalLink from './InternalLink';

export default function TopicGrid({
  topics,
  items,
  language,
}: {
  readonly topics: readonly KnowledgeTopic[];
  readonly items: readonly KnowledgeItem[];
  readonly language: Language;
}) {
  return (
    <div className='topic-grid'>
      {topics.map((topic) => (
        <article className='topic-card' key={topic.slug}>
          <div className='domain-tags'>
            {topic.domains.map((domain) => (
              <span key={domain}>{localize(domainLabels[domain], language)}</span>
            ))}
          </div>
          <h3>
            <InternalLink href={`/topics/${encodeURIComponent(topic.slug)}/`}>
              {localize(topic.title, language)}
            </InternalLink>
          </h3>
          <p>{localize(topic.summary, language)}</p>
          <small>
            {language === 'zh'
              ? `${selectTopicItems(items, topic).length} 条关联内容 · ${topic.toolIds.length} 个工具`
              : `${selectTopicItems(items, topic).length} related items · ${topic.toolIds.length} tools`}
          </small>
        </article>
      ))}
    </div>
  );
}
