import type { ReviewedKnowledgeItem } from '../domain';
import { validateApprovedReviewedItems } from './validate';

const publishedModules = import.meta.glob<{ default: ReviewedKnowledgeItem }>(
  './published/*.json',
  { eager: true },
);

export const approvedDailyItems: readonly ReviewedKnowledgeItem[] = Object.entries(publishedModules)
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([, module]) => module.default);

if (approvedDailyItems.some((item) => item.seedContent)) {
  throw new Error('daily published collection cannot contain seed content');
}

validateApprovedReviewedItems(approvedDailyItems);
