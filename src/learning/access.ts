import { learningDraftUnits } from './catalog';
import { learningPracticeDrafts, type LearningPractice } from './practice';
import type { LearningUnit } from './types';

// This batch awaits the owner's review; a successful build is not approval.
export const LEARNING_RELEASE_APPROVED = __LEARNING_RELEASE_APPROVED__;
export const learningPreview = import.meta.env.DEV && !__LEARNING_RELEASE_APPROVED__;
export const learningUnits: readonly LearningUnit[] = import.meta.env.DEV || __LEARNING_RELEASE_APPROVED__
  ? learningDraftUnits : [];
export const learningPractices: readonly LearningPractice[] = import.meta.env.DEV || __LEARNING_RELEASE_APPROVED__
  ? learningPracticeDrafts : [];
export const findLearningUnit = (slug: string) => learningUnits.find((unit) => unit.slug === slug) ?? null;

export function searchLearningUnits(units: readonly LearningUnit[], query: string) {
  const words = query.normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return units.filter((unit) => {
    const text = [unit.title, unit.summary, ...unit.concepts.flatMap((term) => [term.term, term.meaning]),
      ...unit.explanation, ...Object.values(unit.example), ...unit.judgments,
      ...unit.steps.flatMap((step) => [step.title, step.detail]), unit.takeaway, unit.quiz.question, unit.quiz.answer,
      ...learningPractices.filter((practice) => practice.lessonSlug === unit.slug).flatMap((practice) => [practice.title, practice.question, ...practice.guide])]
      .join(' ').normalize('NFKC').toLocaleLowerCase();
    return words.every((word) => text.includes(word));
  });
}
