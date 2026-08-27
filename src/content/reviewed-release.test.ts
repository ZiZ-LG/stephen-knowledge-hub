import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
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
  evaluateReviewedApprovalRequest,
  evaluateReviewedReleaseRequest,
  promoteReviewedManifest,
  reviewedReleaseTag,
  verifyApprovalChain,
} from '../../scripts/stephen-reviewed-release';

const CANDIDATE_SHA = '1111111111111111111111111111111111111111';
const PROMOTION_SHA = '2222222222222222222222222222222222222222';
const SEAL_SHA = '3333333333333333333333333333333333333333';
const MERGE_SHA = '4444444444444444444444444444444444444444';
const CONTROL_SHA = '5555555555555555555555555555555555555555';
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

    const duplicateFingerprint = {
      ...candidate('ED-20260827-002', publicationDraft({ slug: 'second-reviewed-item' })),
      contentFingerprint: candidate().contentFingerprint,
    };
    expect(() => promoteReviewedManifest(promotionInput({
      manifest: manifest([candidate(), duplicateFingerprint]),
      ledger: ledger(['ED-20260827-001', 'ED-20260827-002']),
    }))).toThrow('duplicate promoted content fingerprint');

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
    const sitemapPath = join(root, 'public/sitemap.xml');
    const manifestBytes = await readFile(FIXTURE_MANIFEST, 'utf8');
    const ledgerBytes = await readFile(FIXTURE_LEDGER, 'utf8');
    const baseSitemap = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      '  <url><loc>https://stephen.lake2ocean.top/</loc></url>',
      '  <url><loc>https://stephen.lake2ocean.top/items/seed-item/</loc></url>',
      '</urlset>',
      '',
    ].join('\n');

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

    try {
      await installInputs();
      await mkdir(dirname(sitemapPath), { recursive: true });
      await writeFile(sitemapPath, baseSitemap, 'utf8');
      await chmod(manifestPath, 0o755);
      const executable = run(promoteArgs);
      expect(executable.status).toBe(1);
      expect(executable.stderr).toContain('review manifest must be a regular non-executable file');
      await chmod(manifestPath, 0o644);

      await writeFile(sitemapPath, `${baseSitemap}unexpected trailing content`, 'utf8');
      const malformedSitemap = run(promoteArgs);
      expect(malformedSitemap.status).toBe(1);
      expect(malformedSitemap.stderr)
        .toContain('public sitemap must contain exactly one final urlset closing tag');
      await expect(readFile(manifestPath, 'utf8')).resolves.toBe(manifestBytes);
      await expect(readFile(publishedPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });

      const promotedLocation = 'https://stephen.lake2ocean.top/items/fixture-reviewed-inference-tier/';
      await writeFile(
        sitemapPath,
        baseSitemap.replace('</urlset>', `  <url><loc>${promotedLocation}</loc></url>\n</urlset>`),
        'utf8',
      );
      const duplicateSitemap = run(promoteArgs);
      expect(duplicateSitemap.status).toBe(1);
      expect(duplicateSitemap.stderr)
        .toContain('public sitemap already contains promoted item: fixture-reviewed-inference-tier');
      await expect(readFile(ledgerPath, 'utf8')).resolves.toBe(ledgerBytes);
      await expect(readFile(promotionPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });

      await writeFile(sitemapPath, baseSitemap, 'utf8');
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
      const promotedSitemap = await readFile(sitemapPath, 'utf8');
      expect(promotedSitemap.match(
        /https:\/\/stephen\.lake2ocean\.top\/items\/fixture-reviewed-inference-tier\//g,
      )).toEqual([promotedLocation]);
      expect(promotedSitemap).toContain('<lastmod>2026-08-27</lastmod>');
      expect(promotedSitemap).toContain('https://stephen.lake2ocean.top/items/seed-item/');
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

  it('rejects path traversal and symlinked publication directories without consuming inputs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'saas-608-reviewed-paths-'));
    const outside = await mkdtemp(join(tmpdir(), 'saas-608-reviewed-outside-'));
    const manifestPath = join(root, 'review-candidates/2026-08-27/review-manifest.json');
    const ledgerPath = join(root, 'review-candidates/2026-08-27/discovery-ledger.json');
    const run = (args: readonly string[]) => spawnSync(
      process.execPath,
      ['--experimental-strip-types', REVIEWED_RELEASE_CLI, ...args],
      { encoding: 'utf8' },
    );
    const promoteArgs = (manifest = 'review-candidates/2026-08-27/review-manifest.json') => [
      'promote',
      '--root', root,
      '--manifest', manifest,
      '--ledger', 'review-candidates/2026-08-27/discovery-ledger.json',
      '--candidate-sha', CANDIDATE_SHA,
      '--current-head-sha', CANDIDATE_SHA,
      '--approver', 'ZiZ-LG',
      '--repository-owner', 'ZiZ-LG',
      '--repository', 'ZiZ-LG/stephen-knowledge-hub',
      '--approved-at', APPROVED_AT,
      '--pr-number', '42',
    ] as const;

    try {
      await mkdir(dirname(manifestPath), { recursive: true });
      await writeFile(manifestPath, await readFile(FIXTURE_MANIFEST, 'utf8'), 'utf8');
      await writeFile(ledgerPath, await readFile(FIXTURE_LEDGER, 'utf8'), 'utf8');

      const traversal = run(promoteArgs('../review-manifest.json'));
      expect(traversal.status).toBe(1);
      expect(traversal.stderr).toContain('manifest and ledger must use the matching daily review directory');
      await expect(readFile(manifestPath, 'utf8')).resolves.toContain('ED-FIXTURE-REVIEWED');
      await expect(readFile(ledgerPath, 'utf8')).resolves.toContain('ED-FIXTURE-REVIEWED');

      await mkdir(join(root, 'src/content'), { recursive: true });
      await symlink(outside, join(root, 'src/content/published'));
      const linkedOutput = run(promoteArgs());
      expect(linkedOutput.status).toBe(1);
      expect(linkedOutput.stderr).toContain('published directory must not contain symlinks');
      await expect(readFile(manifestPath, 'utf8')).resolves.toContain('ED-FIXTURE-REVIEWED');
      await expect(readFile(ledgerPath, 'utf8')).resolves.toContain('ED-FIXTURE-REVIEWED');
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });
});

describe('SAAS-608 trusted approval request policy', () => {
  function policyInput() {
    return {
      actor: 'ZiZ-LG',
      triggeringActor: 'ZiZ-LG',
      repositoryOwner: 'ZiZ-LG',
      repository: 'ZiZ-LG/stephen-knowledge-hub',
      defaultBranch: 'main',
      candidateSha: CANDIDATE_SHA,
      confirmation: `APPROVE ${CANDIDATE_SHA}`,
      pr: {
        number: 42,
        state: 'open',
        draft: true,
        changedFiles: 2,
        head: {
          sha: CANDIDATE_SHA,
          ref: 'codex/stephen-daily-2026-08-27',
          repository: 'ZiZ-LG/stephen-knowledge-hub',
        },
        base: {
          ref: 'main',
          repository: 'ZiZ-LG/stephen-knowledge-hub',
          sha: CONTROL_SHA,
        },
      },
      changedFiles: [{
        filename: 'review-candidates/2026-08-27/review-manifest.json',
        status: 'added',
      }, {
        filename: 'review-candidates/2026-08-27/discovery-ledger.json',
        status: 'added',
      }],
      manifest: manifest(),
    } as const;
  }

  it('accepts only the owner-approved exact daily Draft PR head', () => {
    expect(evaluateReviewedApprovalRequest(policyInput())).toEqual({
      prNumber: 42,
      candidateSha: CANDIDATE_SHA,
      headRef: 'codex/stephen-daily-2026-08-27',
      editorialDate: '2026-08-27',
      manifestPath: 'review-candidates/2026-08-27/review-manifest.json',
      ledgerPath: 'review-candidates/2026-08-27/discovery-ledger.json',
      baseSha: CONTROL_SHA,
    });
  });

  it.each([
    ['actor', { actor: 'other-user' }],
    ['triggering actor', { triggeringActor: 'other-user' }],
    ['repository', { repository: 'ZiZ-LG/other-repo' }],
    ['confirmation', { confirmation: `APPROVE ${PROMOTION_SHA}` }],
    ['stale SHA', { candidateSha: PROMOTION_SHA }],
  ])('rejects a wrong %s', (_label, override) => {
    expect(() => evaluateReviewedApprovalRequest({ ...policyInput(), ...override })).toThrow();
  });

  it('rejects wrong base, head prefix, cross-repository or non-Draft PR state', () => {
    const input = policyInput();
    expect(() => evaluateReviewedApprovalRequest({
      ...input,
      pr: { ...input.pr, base: { ...input.pr.base, ref: 'release' } },
    })).toThrow('approval PR must target the default branch');
    expect(() => evaluateReviewedApprovalRequest({
      ...input,
      pr: { ...input.pr, head: { ...input.pr.head, ref: 'feature/not-daily' } },
    })).toThrow('approval PR head must be the matching daily candidate branch');
    expect(() => evaluateReviewedApprovalRequest({
      ...input,
      pr: { ...input.pr, head: { ...input.pr.head, repository: 'fork/repository' } },
    })).toThrow('cross-repository approval PRs are forbidden');
    expect(() => evaluateReviewedApprovalRequest({
      ...input,
      pr: { ...input.pr, draft: false },
    })).toThrow('approval PR must remain open and Draft');
  });

  it('rejects unexpected paths, file modes, empty candidates and unresolved manual records', () => {
    const input = policyInput();
    expect(() => evaluateReviewedApprovalRequest({
      ...input,
      changedFiles: [...input.changedFiles, { filename: 'src/main.tsx', status: 'modified' }],
      pr: { ...input.pr, changedFiles: 3 },
    })).toThrow('approval PR contains an unexpected changed path');
    expect(() => evaluateReviewedApprovalRequest({
      ...input,
      changedFiles: [{ ...input.changedFiles[0], status: 'removed' }, input.changedFiles[1]],
    })).toThrow('approval PR review files must be added or modified');
    expect(() => evaluateReviewedApprovalRequest({
      ...input,
      manifest: manifest([]),
    })).toThrow('review manifest contains no retained candidates');
    expect(() => evaluateReviewedApprovalRequest({
      ...input,
      manifest: {
        ...manifest(),
        manualReviewRecords: [{ candidateId: 'ED-MANUAL' }],
      } as unknown as DailyReviewManifest,
    })).toThrow('manualReviewRecords must be empty before approval');
  });
});

describe('SAAS-608 immutable Release request policy', () => {
  function releaseInput() {
    const promotion = promoteReviewedManifest(promotionInput()).record;
    const seal = buildApprovalSeal({ promotion, promotionSha: PROMOTION_SHA });
    const releaseTag = reviewedReleaseTag('2026-08-27', SEAL_SHA);
    return {
      repository: 'ZiZ-LG/stephen-knowledge-hub',
      defaultBranch: 'main',
      defaultBranchHeadSha: MERGE_SHA,
      mergeReachableFromDefault: true,
      payload: {
        pr: 42,
        candidateSha: CANDIDATE_SHA,
        promotionSha: PROMOTION_SHA,
        sealSha: SEAL_SHA,
        mergeSha: MERGE_SHA,
        approvalRecord: `editorial-releases/2026-08-27/${CANDIDATE_SHA.slice(0, 12)}/approval.json`,
        releaseTag,
        approvalRunId: 9876,
        approvalRunAttempt: 1,
        controlSha: CONTROL_SHA,
      },
      pr: {
        number: 42,
        merged: true,
        mergeCommitSha: MERGE_SHA,
        headSha: SEAL_SHA,
        headRepository: 'ZiZ-LG/stephen-knowledge-hub',
        baseRepository: 'ZiZ-LG/stephen-knowledge-hub',
        baseRef: 'main',
      },
      checkRuns: [{
        name: 'stephen-reviewed-release',
        headSha: SEAL_SHA,
        status: 'completed',
        conclusion: 'success',
        appSlug: 'github-actions',
        externalId: `stephen-reviewed-release:9876:1:${SEAL_SHA}`,
        detailsUrl: 'https://github.com/ZiZ-LG/stephen-knowledge-hub/actions/runs/9876/attempts/1',
      }],
      approvalRun: {
        id: 9876,
        runAttempt: 1,
        event: 'workflow_dispatch',
        status: 'completed',
        conclusion: 'success',
        headSha: CONTROL_SHA,
        path: '.github/workflows/approve-reviewed-content.yml',
        actor: 'ZiZ-LG',
        triggeringActor: 'ZiZ-LG',
      },
      writeCollaborators: [{ login: 'ZiZ-LG' }],
      releaseTagRuleset: {
        name: 'Protect Stephen immutable Release tags',
        target: 'tag',
        enforcement: 'active',
        bypassActorCount: 0,
        includedRefs: ['refs/tags/stephen-content-*'],
        ruleTypes: ['update', 'deletion'],
      },
      immutableReleases: { enabled: true },
      promotion,
      seal,
      promotionParentSha: CANDIDATE_SHA,
      sealParentSha: PROMOTION_SHA,
      expectedAssets: [{
        name: 'stephen-site-333333333333.tar.gz',
        sha256: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      }, {
        name: '.stephen-release.json',
        sha256: 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      }],
      existingTag: null,
      existingRelease: null,
    } as const;
  }

  it('prepares only the exact merged and checked seal for a Draft Release', () => {
    expect(evaluateReviewedReleaseRequest(releaseInput())).toEqual({
      status: 'create_draft',
      releaseTag: 'stephen-content-2026-08-27-333333333333',
      targetCommitish: SEAL_SHA,
      releaseId: null,
      missingAssets: ['.stephen-release.json', 'stephen-site-333333333333.tar.gz'],
    });
  });

  it('rejects an unmerged PR, mismatched merge or seal, and a missing successful check', () => {
    const input = releaseInput();
    expect(() => evaluateReviewedReleaseRequest({
      ...input,
      pr: { ...input.pr, merged: false },
    })).toThrow('reviewed Release requires the merged approval PR');
    expect(() => evaluateReviewedReleaseRequest({
      ...input,
      pr: { ...input.pr, mergeCommitSha: CANDIDATE_SHA },
    })).toThrow('merge commit does not match the durable approval handoff');
    expect(() => evaluateReviewedReleaseRequest({
      ...input,
      pr: { ...input.pr, headSha: PROMOTION_SHA },
    })).toThrow('merged PR head does not match the approval seal SHA');
    expect(() => evaluateReviewedReleaseRequest({ ...input, checkRuns: [] }))
      .toThrow('successful exact-seal check is missing');
  });

  it('rejects forged check provenance or an untrusted approval workflow run', () => {
    const input = releaseInput();
    expect(() => evaluateReviewedReleaseRequest({
      ...input,
      checkRuns: input.checkRuns.map((check) => ({ ...check, appSlug: 'other-app' })),
    })).toThrow('successful exact-seal check is missing');
    expect(() => evaluateReviewedReleaseRequest({
      ...input,
      checkRuns: input.checkRuns.map((check) => ({ ...check, externalId: 'forged' })),
    })).toThrow('successful exact-seal check is missing');
    expect(() => evaluateReviewedReleaseRequest({
      ...input,
      approvalRun: { ...input.approvalRun, actor: 'other-user' },
    })).toThrow('approval workflow run provenance is invalid');
  });

  it('allows durable recovery from a post-merge approval-run failure', () => {
    const input = releaseInput();
    expect(evaluateReviewedReleaseRequest({
      ...input,
      approvalRun: { ...input.approvalRun, conclusion: 'failure' },
    })).toMatchObject({ status: 'create_draft' });
  });

  it('requires the reviewed merge to remain reachable from the current default branch', () => {
    const input = releaseInput();
    expect(() => evaluateReviewedReleaseRequest({
      ...input,
      pr: { ...input.pr, baseRef: 'release' },
    })).toThrow('reviewed Release requires the merged approval PR');
    expect(evaluateReviewedReleaseRequest({
      ...input,
      defaultBranchHeadSha: CONTROL_SHA,
    })).toMatchObject({ status: 'create_draft' });
    expect(() => evaluateReviewedReleaseRequest({
      ...input,
      mergeReachableFromDefault: false,
    })).toThrow('approved merge is not reachable from the default branch');
  });

  it('rejects a broken commit chain or disabled immutable Release setting', () => {
    const input = releaseInput();
    expect(() => evaluateReviewedReleaseRequest({
      ...input,
      promotionParentSha: SEAL_SHA,
    })).toThrow('promotion parent does not match approved candidate SHA');
    expect(() => evaluateReviewedReleaseRequest({
      ...input,
      immutableReleases: { enabled: false },
    })).toThrow('repository immutable Releases must be enabled');
  });

  it('requires a single repository writer and active no-bypass tag protection', () => {
    const input = releaseInput();
    expect(() => evaluateReviewedReleaseRequest({
      ...input,
      writeCollaborators: [{ login: 'ZiZ-LG' }, { login: 'other-writer' }],
    })).toThrow('repository write boundary is not single-owner');
    expect(() => evaluateReviewedReleaseRequest({
      ...input,
      releaseTagRuleset: { ...input.releaseTagRuleset, enforcement: 'disabled' },
    })).toThrow('Release tag protection ruleset is invalid');
    expect(() => evaluateReviewedReleaseRequest({
      ...input,
      releaseTagRuleset: { ...input.releaseTagRuleset, bypassActorCount: 1 },
    })).toThrow('Release tag protection ruleset is invalid');
    expect(() => evaluateReviewedReleaseRequest({
      ...input,
      releaseTagRuleset: { ...input.releaseTagRuleset, ruleTypes: ['deletion'] },
    })).toThrow('Release tag protection ruleset is invalid');
  });

  it('rejects tag drift, a mutable published Release or changed asset digest', () => {
    const input = releaseInput();
    expect(() => evaluateReviewedReleaseRequest({
      ...input,
      existingTag: { objectType: 'commit', sha: PROMOTION_SHA },
    })).toThrow('existing Release tag points to another commit');

    const matchingAssets = input.expectedAssets.map((asset, index) => ({
      id: index + 1,
      name: asset.name,
      digest: `sha256:${asset.sha256}`,
    }));
    expect(() => evaluateReviewedReleaseRequest({
      ...input,
      existingRelease: {
        id: 7,
        tagName: input.payload.releaseTag,
        targetCommitish: SEAL_SHA,
        draft: false,
        immutable: false,
        assets: matchingAssets,
      },
    })).toThrow('existing published Release is mutable');
    expect(() => evaluateReviewedReleaseRequest({
      ...input,
      existingRelease: {
        id: 7,
        tagName: input.payload.releaseTag,
        targetCommitish: SEAL_SHA,
        draft: true,
        immutable: false,
        assets: [{ ...matchingAssets[0], digest: `sha256:${'e'.repeat(64)}` }],
      },
    })).toThrow('existing Release asset digest does not match');
  });

  it('requires GitHub to create the protected tag atomically when publishing the Draft', () => {
    const input = releaseInput();
    expect(() => evaluateReviewedReleaseRequest({
      ...input,
      existingTag: { objectType: 'commit', sha: SEAL_SHA },
      existingRelease: {
        id: 7,
        tagName: input.payload.releaseTag,
        targetCommitish: SEAL_SHA,
        draft: true,
        immutable: false,
        assets: [],
      },
    })).toThrow('Release tag must not exist before immutable publication');
  });

  it('treats a matching immutable Release as an idempotent success and rejects server fields', () => {
    const input = releaseInput();
    const assets = input.expectedAssets.map((asset, index) => ({
      id: index + 1,
      name: asset.name,
      digest: `sha256:${asset.sha256}`,
    }));
    expect(evaluateReviewedReleaseRequest({
      ...input,
      existingTag: { objectType: 'commit', sha: SEAL_SHA },
      existingRelease: {
        id: 7,
        tagName: input.payload.releaseTag,
        targetCommitish: SEAL_SHA,
        draft: false,
        immutable: true,
        assets,
      },
    })).toMatchObject({ status: 'already_immutable', releaseId: 7, missingAssets: [] });

    expect(() => evaluateReviewedReleaseRequest({
      ...input,
      payload: { ...input.payload, productionHost: 'example.invalid' } as typeof input.payload,
    })).toThrow('Release payload contains a forbidden server-operation field');
  });
});
