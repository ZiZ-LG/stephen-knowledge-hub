import { describe, expect, it } from 'vitest';
import { explainRagConditions, initialRagConditions } from './ragTeachingModel';

describe('RAG teaching conditions', () => {
  it('does not reveal customer terms to another seller or the service role', () => {
    for (const role of ['other_seller', 'service_engineer'] as const) {
      const result = explainRagConditions({ ...initialRagConditions, role });
      expect(result.documents.join(' ')).not.toContain('客户甲条款');
      expect(result.decision).toBe('missing_evidence');
      expect(result.answer).not.toContain('不存在');
    }
  });
  it('asks for missing inputs and does not treat outdated documents as current evidence', () => {
    expect(explainRagConditions({ ...initialRagConditions, detailsKnown: false }).decision).toBe('clarify');
    expect(explainRagConditions({ ...initialRagConditions, documents: 'outdated' }).decision).toBe('verify_version');
    expect(explainRagConditions({ ...initialRagConditions, documents: 'missing' }).decision).toBe('missing_evidence');
  });
  it('keeps a complete answer distinct from approval and distinguishes requested from accepted handoff', () => {
    const pending = explainRagConditions(initialRagConditions);
    const accepted = explainRagConditions({ ...initialRagConditions, humanAvailable: true });
    expect(pending.decision).toBe('approval');
    expect(pending.answer).toContain('不能替负责人');
    expect(pending.handoff).toContain('等待接单');
    expect(accepted.handoff).toContain('仍待决定');
    expect(accepted.answer).toEqual(pending.answer);
  });
});
