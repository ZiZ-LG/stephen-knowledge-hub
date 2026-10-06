export interface LearningUnit {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly minutes: number;
  readonly group: 'principles' | 'customer' | 'practice';
  readonly concepts: readonly { readonly term: string; readonly meaning: string }[];
  readonly explanation: readonly string[];
  readonly example: {
    readonly scene: string;
    readonly input: string;
    readonly ai: string;
    readonly human: string;
    readonly next: string;
    readonly conditions: string;
  };
  readonly judgments: readonly string[];
  readonly steps: readonly { readonly title: string; readonly detail: string }[];
  readonly takeaway: string;
  readonly quiz: { readonly question: string; readonly answer: string };
  readonly sources: readonly {
    readonly title: string;
    readonly url: string;
    readonly checkedAt: string;
    readonly scope: string;
  }[];
  readonly topicSlugs: readonly string[];
  readonly toolIds: readonly string[];
  readonly relatedItemIds: readonly string[];
  readonly legacySections: readonly string[];
}
