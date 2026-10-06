import { afterEach, describe, expect, it, vi } from 'vitest';
import { learningDraftUnits } from './catalog';
import { learningPracticeDrafts } from './practice';
import { knowledgeTopics } from '../content/topics';
import { knowledgeTools } from '../content/tools';
import { approvedSeedItems } from '../content/items';

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
describe('integrated learning catalog', () => {
  it('keeps every lesson connected to real topics, tools, history and primary sources', () => {
    expect(new Set(learningDraftUnits.map((unit) => unit.slug)).size).toBe(8);
    expect(new Set(learningDraftUnits.map((unit) => unit.id)).size).toBe(8);
    for (const unit of learningDraftUnits) {
      for (const id of unit.toolIds) expect(knowledgeTools.some((tool) => tool.id === id), `${unit.slug}: tool ${id}`).toBe(true);
      for (const slug of unit.topicSlugs) expect(knowledgeTopics.some((topic) => topic.slug === slug), `${unit.slug}: topic ${slug}`).toBe(true);
      for (const id of unit.relatedItemIds) expect(approvedSeedItems.some((item) => item.id === id), `${unit.slug}: item ${id}`).toBe(true);
      expect(unit.example.scene).toContain('虚构');
      expect(unit.sources.length).toBeGreaterThan(0);
      for (const source of unit.sources) {
        expect(new URL(source.url).protocol).toBe('https:');
        expect(source.scope.trim().length).toBeGreaterThan(10);
      }
    }
  });
  it('exposes the owner-approved learning revision in the production runtime', async () => {
    vi.stubEnv('DEV', false);
    const access = await import('./access');
    expect(access.LEARNING_RELEASE_APPROVED).toBe(true);
    expect(access.learningPreview).toBe(false);
    expect(access.learningUnits).toEqual(learningDraftUnits);
    expect(access.learningPractices).toEqual(learningPracticeDrafts);
    expect(access.findLearningUnit('ai-foundations')?.id).toBe('LU-001');
  });
  it('finds lessons through a concept rather than requiring their exact title', async () => {
    const { searchLearningUnits } = await import('./access');
    expect(searchLearningUnits(learningDraftUnits, 'ＲＡＧ').map((unit) => unit.slug)).toContain('knowledge-answers');
    expect(searchLearningUnits(learningDraftUnits, 'MCP').map((unit) => unit.slug)).toContain('workflow-agents');
    expect(searchLearningUnits(learningDraftUnits, 'Function Calling').map((unit) => unit.slug)).toContain('workflow-agents');
    expect(searchLearningUnits(learningDraftUnits, '降价').map((unit) => unit.slug)).toContain('value-and-cost');
    expect(searchLearningUnits(learningDraftUnits, '不存在的词')).toEqual([]);
  });
  it('connects every optional scenario to a real lesson and editable tool', () => {
    expect(new Set(learningPracticeDrafts.map((practice) => practice.id)).size).toBe(14);
    for (const practice of learningPracticeDrafts) {
      expect(learningDraftUnits.some((unit) => unit.slug === practice.lessonSlug)).toBe(true);
      expect(knowledgeTools.some((tool) => tool.id === practice.toolId)).toBe(true);
      expect(practice.guide.length).toBeGreaterThan(2);
    }
  });
});
