import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import type {
  DailyPublicationDraft,
  DailyReviewCandidate,
  DailyReviewLedger,
  DailyReviewManifest,
} from '../../scripts/stephen-daily-review';
import {
  buildApprovalSeal,
  promoteReviewedManifest,
  reviewedReleaseTag,
  verifyApprovalChain,
} from '../../scripts/stephen-reviewed-release';

const CANDIDATE_SHA = '1111111111111111111111111111111111111111';
const PROMOTION_SHA = '2222222222222222222222222222222222222222';
const SEAL_SHA = '3333333333333333333333333333333333333333';
const MANIFEST_DIGEST = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const LEDGER_DIGEST = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const APPROVED_AT = '2026-08-27T10:30:00.000Z';
const REVIEWED_RELEASE_CLI = decodeURIComponent(
  new URL('../../scripts/stephen-reviewed-release-cli.ts', import.meta.url).pathname,
);
const FIXTURE_MANIFEST = decodeURIComponent(
  new URL('../../scripts/fixtures/saas-608-review-manifest.json', import.meta.url).pathname,
);
const FIXTURE_LEDGER = decodeURIComponent(
  new URL('../../scripts/fixtures/saas-608-discovery-ledger.json', import.meta.url).pathname,
);

function publicationDraft(overrides: Partial<DailyPublicationDraft> = {}): DailyPublicationDraft {
  return {
    slug: 'latency-becomes-a-service-tier',
    kind: 'update',
    domains: ['ai_technology', 'enterprise_sales'],
    topicSlugs: ['agent-business-model'],
    tags: ['推理速度', '服务等级'],
    toolIds: ['poc-success-canvas'],
    audience: ['transitioning_seller', 'ai_ae'],
    freshness: 'current',
    conclusionScope: 'cross_organization',
    primaryEvidenceLevel: 'official',
    primaryEvidenceLanguage: 'en',
    primaryEvidenceDateBasis: 'published',
    additionalEvidence: [{
      sourceId: 'anthropic-news',
      title: 'Independent vendor service update',
      publisher: 'Anthropic',
      url: 'https://www.anthropic.com/news/example-service-update',
      publishedAt: '2026-08-26T09:00:00.000Z',
      level: 'official',
      language: 'en',
      dateBasis: 'published',
    }],
    supportingFacts: [{
      statement: 'OpenAI 将推理速度作为独立服务层提供。',
      evidenceIndexes: [1],
    }, {
      statement: '另一家模型厂商也为时延敏感型工作负载提供差异化服务。',
      evidenceIndexes: [2],
    }],
    deeperAnalysis: {
      mechanism: '多步 Agent 会串联每一步等待时间，关键路径延迟因此累积。',
      businessValue: '更低等待时间可以提高会话完成率和单位时间内完成的工作循环。',
      boundary: '离线批处理或人工审核占主导的流程未必值得支付加速溢价。',
    },
    changeWindow: 'within_30_days',
    factType: 'editorial_inference',
    verificationNotes: '所有事实均由仓库所有者在候选 SHA 上逐项核验。',
    ...overrides,
  };
}

function candidate(
  candidateId = 'ED-20260827-001',
  draft: DailyPublicationDraft = publicationDraft(),
): DailyReviewCandidate {
  return {
    candidateId,
    sourceId: 'openai-news-rss',
    sourceName: 'OpenAI News RSS',
    originalTitle: 'Previewing a faster inference service tier',
    canonicalUrl: `https://openai.com/index/${candidateId.toLowerCase()}`,
    publishedAt: '2026-08-27T08:00:00.000Z',
    fetchedAt: '2026-08-27T09:00:00.000Z',
    sourceSummary: 'The vendor introduced a faster inference service tier.',
    evidenceExcerpt: 'A bounded factual excerpt retained for owner review.',
    eventKey: `event-${candidateId.toLowerCase()}`,
    contentFingerprint: `fingerprint-${candidateId.toLowerCase()}`,
    riskLevel: 'medium',
    riskReasons: ['cross-organization conclusion requires owner review'],
    editorialDraft: {
      mode: 'ai',
      titleZh: '推理速度正在成为独立服务层',
      summaryZh: '两家厂商的独立动作表明，时延正从附属指标变为可采购服务等级。',
      whyItMattersZh: '时延会在多步业务流程中累积，并直接影响完成率。',
      salesImplicationZh: '销售应把首 Token、持续吞吐、并发和溢价写入同一验收表。',
      roleOrgImplicationZh: '产品、销售和财务需要共同判断哪些关键路径值得加速。',
      nextActionZh: '选择一个实时场景，对标准层和快速层做单位任务价值测算。',
    },
    publicationDraft: draft,
    reviewState: 'pending_owner_review',
    publicationState: 'not_published',
  };
}

function manifest(candidates: readonly DailyReviewCandidate[] = [candidate()]): DailyReviewManifest {
  return {
    schemaVersion: 1,
    task: 'SAAS-606',
    editorialDate: '2026-08-27',
    generatedAt: '2026-08-27T09:00:00.000Z',
    reviewState: 'pending_owner_review',
    publicationState: 'not_published',
    controls: { autoPublishingEnabled: false, stopSwitchEngaged: true },
    candidates,
    manualReviewRecords: [],
  };
}

function ledger(candidateIds = ['ED-20260827-001']): DailyReviewLedger {
  return {
    schemaVersion: 1,
    task: 'SAAS-606',
    editorialDate: '2026-08-27',
    seenCandidateIds: candidateIds,
    runs: [{
      fetchedAt: '2026-08-27T09:00:00.000Z',
      summary: {
        sourcesConfigured: 2,
        sourcesScanned: 2,
        sourcesFailed: 0,
        newDiscoveries: candidateIds.length,
        duplicates: 0,
        rejected: 0,
        manualReview: candidateIds.length,
        proposed: candidateIds.length,
      },
    }],
  };
}

function promotionInput(overrides: Record<string, unknown> = {}) {
  return {
    repository: 'ZiZ-LG/stephen-knowledge-hub',
    repositoryOwner: 'ZiZ-LG',
    approver: 'ZiZ-LG',
    prNumber: 42,
    candidateSha: CANDIDATE_SHA,
    currentHeadSha: CANDIDATE_SHA,
    approvedAt: APPROVED_AT,
    manifest: manifest(),
    ledger: ledger(),
    manifestSha256: MANIFEST_DIGEST,
    ledgerSha256: LEDGER_DIGEST,
    existingItems: [],
    ...overrides,
  };
}

describe('SAAS-608 exact-SHA promotion', () => {
  it('requires a full current candidate SHA and the repository owner', () => {
    expect(() => promoteReviewedManifest(promotionInput({ candidateSha: '1111111' })))
      .toThrow('candidate SHA must be a full lowercase Git SHA');
    expect(() => promoteReviewedManifest(promotionInput({ currentHeadSha: PROMOTION_SHA })))
      .toThrow('candidate SHA does not match current PR head');
    expect(() => promoteReviewedManifest(promotionInput({ approver: 'other-user' })))
      .toThrow('only the repository owner can approve reviewed content');
  });

  it('fails closed on unresolved manual review or an incomplete publication draft', () => {
    const unresolved = {
      ...manifest(),
      manualReviewRecords: [{ candidateId: 'ED-MANUAL' }],
    } as unknown as DailyReviewManifest;
    expect(() => promoteReviewedManifest(promotionInput({ manifest: unresolved })))
      .toThrow('manualReviewRecords must be empty before approval');

    const incomplete = candidate('ED-INCOMPLETE', {
      ...publicationDraft(),
      slug: '',
    });
    expect(() => promoteReviewedManifest(promotionInput({
      manifest: manifest([incomplete]),
      ledger: ledger(['ED-INCOMPLETE']),
    }))).toThrow('publicationDraft.slug must be a non-empty string');
  });

  it('promotes every retained candidate while preserving source and risk provenance', () => {
    const second = candidate('ED-20260827-002', publicationDraft({
      slug: 'enterprise-ai-value-proof',
    }));
    const result = promoteReviewedManifest(promotionInput({
      manifest: manifest([candidate(), second]),
      ledger: ledger(['ED-20260827-001', 'ED-20260827-002']),
    }));

    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      id: 'ED-20260827-001',
      seedContent: false,
      editorialStatus: 'approved',
      publicationMode: 'manual',
      riskLevel: 'medium',
      review: { status: 'approved', verifiedAt: APPROVED_AT },
      audit: {
        sourceFingerprint: 'fingerprint-ed-20260827-001',
        ruleVersion: 'saas-608-owner-approved-v1',
      },
      evidence: [{ sourceId: 'openai-news-rss' }, { sourceId: 'anthropic-news' }],
    });
    expect(result.record).toMatchObject({
      candidateSha: CANDIDATE_SHA,
      manifestSha256: MANIFEST_DIGEST,
      ledgerSha256: LEDGER_DIGEST,
      promotedItemIds: ['ED-20260827-001', 'ED-20260827-002'],
    });
  });

  it('rejects duplicate or already-published IDs, slugs and fingerprints', () => {
    const duplicateSlug = candidate('ED-20260827-002', publicationDraft());
    expect(() => promoteReviewedManifest(promotionInput({
      manifest: manifest([candidate(), duplicateSlug]),
      ledger: ledger(['ED-20260827-001', 'ED-20260827-002']),
    }))).toThrow('duplicate promoted slug');

    const first = promoteReviewedManifest(promotionInput()).items[0];
    expect(() => promoteReviewedManifest(promotionInput({ existingItems: [first] })))
      .toThrow('candidate is already published');
  });
});

describe('SAAS-608 approval seal chain', () => {
  function validChain() {
    const promotion = promoteReviewedManifest(promotionInput()).record;
    const seal = buildApprovalSeal({ promotion, promotionSha: PROMOTION_SHA });
    return {
      promotion,
      seal,
      candidateSha: CANDIDATE_SHA,
      promotionSha: PROMOTION_SHA,
      sealSha: SEAL_SHA,
      promotionParentSha: CANDIDATE_SHA,
      sealParentSha: PROMOTION_SHA,
      prHeadSha: SEAL_SHA,
      repository: 'ZiZ-LG/stephen-knowledge-hub',
      releaseTag: reviewedReleaseTag('2026-08-27', SEAL_SHA),
    };
  }

  it('derives a deterministic release tag only after the seal SHA exists', () => {
    expect(reviewedReleaseTag('2026-08-27', SEAL_SHA))
      .toBe('stephen-content-2026-08-27-333333333333');
    expect(verifyApprovalChain(validChain())).toMatchObject({
      candidateSha: CANDIDATE_SHA,
      promotionSha: PROMOTION_SHA,
      sealSha: SEAL_SHA,
      releaseTag: 'stephen-content-2026-08-27-333333333333',
    });
  });

  it.each([
    ['promotion parent', { promotionParentSha: SEAL_SHA }],
    ['seal parent', { sealParentSha: CANDIDATE_SHA }],
    ['PR head', { prHeadSha: PROMOTION_SHA }],
    ['repository identity', { repository: 'other/repository' }],
    ['release tag', { releaseTag: 'stephen-content-2026-08-27-wrong' }],
  ])('rejects a mismatched %s', (_label, override) => {
    expect(() => verifyApprovalChain({ ...validChain(), ...override })).toThrow();
  });

  it('rejects altered promoted IDs or input digests', () => {
    const chain = validChain();
    expect(() => verifyApprovalChain({
      ...chain,
      seal: { ...chain.seal, promotedItemIds: ['ED-OTHER'] },
    })).toThrow('approval seal promoted IDs do not match promotion');
    expect(() => verifyApprovalChain({
      ...chain,
      seal: { ...chain.seal, manifestSha256: LEDGER_DIGEST },
    })).toThrow('approval seal input digests do not match promotion');
  });
});

describe('SAAS-608 bounded filesystem CLI', () => {
  it('promotes fixture files, removes only reviewed inputs, seals once and refuses overwrite', async () => {
    const root = await mkdtemp(join(tmpdir(), 'saas-608-reviewed-release-'));
    const manifestPath = join(root, 'review-candidates/2026-08-27/review-manifest.json');
    const ledgerPath = join(root, 'review-candidates/2026-08-27/discovery-ledger.json');
    const promotionPath = join(
      root,
      `editorial-releases/2026-08-27/${CANDIDATE_SHA.slice(0, 12)}/promotion.json`,
    );
    const approvalPath = join(dirname(promotionPath), 'approval.json');
    const publishedPath = join(root, 'src/content/published/ED-FIXTURE-REVIEWED.json');
    const manifestBytes = await readFile(FIXTURE_MANIFEST, 'utf8');
    const ledgerBytes = await readFile(FIXTURE_LEDGER, 'utf8');

    const installInputs = async () => {
      await mkdir(dirname(manifestPath), { recursive: true });
      await mkdir(dirname(publishedPath), { recursive: true });
      await writeFile(manifestPath, manifestBytes, 'utf8');
      await writeFile(ledgerPath, ledgerBytes, 'utf8');
    };
    const run = (args: readonly string[]) => spawnSync(
      process.execPath,
      ['--experimental-strip-types', REVIEWED_RELEASE_CLI, ...args],
      { encoding: 'utf8' },
    );

    try {
      await installInputs();
      const promoteArgs = [
        'promote',
        '--root', root,
        '--manifest', 'review-candidates/2026-08-27/review-manifest.json',
        '--ledger', 'review-candidates/2026-08-27/discovery-ledger.json',
        '--candidate-sha', CANDIDATE_SHA,
        '--current-head-sha', CANDIDATE_SHA,
        '--approver', 'ZiZ-LG',
        '--repository-owner', 'ZiZ-LG',
        '--repository', 'ZiZ-LG/stephen-knowledge-hub',
        '--approved-at', APPROVED_AT,
        '--pr-number', '42',
      ] as const;
      const promoted = run(promoteArgs);
      expect(promoted.status, promoted.stderr).toBe(0);
      expect(JSON.parse(promoted.stdout)).toMatchObject({
        task: 'SAAS-608',
        command: 'promote',
        candidateSha: CANDIDATE_SHA,
        promotedItemIds: ['ED-FIXTURE-REVIEWED'],
      });
      expect(JSON.parse(await readFile(publishedPath, 'utf8'))).toMatchObject({
        id: 'ED-FIXTURE-REVIEWED',
        editorialStatus: 'approved',
        seedContent: false,
      });
      expect(JSON.parse(await readFile(promotionPath, 'utf8'))).toMatchObject({
        candidateSha: CANDIDATE_SHA,
      });
      await expect(readFile(manifestPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(readFile(ledgerPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });

      const sealed = run([
        'seal',
        '--root', root,
        '--promotion-record', `editorial-releases/2026-08-27/${CANDIDATE_SHA.slice(0, 12)}/promotion.json`,
        '--promotion-sha', PROMOTION_SHA,
      ]);
      expect(sealed.status, sealed.stderr).toBe(0);
      expect(JSON.parse(await readFile(approvalPath, 'utf8'))).toMatchObject({
        candidateSha: CANDIDATE_SHA,
        promotionSha: PROMOTION_SHA,
      });

      await installInputs();
      const duplicate = run(promoteArgs);
      expect(duplicate.status).toBe(1);
      expect(duplicate.stderr).toContain('candidate is already published');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
