import type { ReviewedKnowledgeItem } from '../src/domain.ts';
import { validateApprovedReviewedItems } from '../src/content/validate.ts';
import {
  parseDailyPublicationDraft,
  type DailyReviewLedger,
  type DailyReviewManifest,
} from './stephen-daily-review.ts';

const FULL_GIT_SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const SAFE_REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SAFE_ITEM_ID = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

export const REVIEWED_RELEASE_CHECK_NAME = 'stephen-reviewed-release';
export const RELEASE_TAG_SUFFIX_RULE = '<seal-sha-12>';

export interface PromotedCandidateProvenance {
  readonly itemId: string;
  readonly sourceId: string;
  readonly canonicalUrl: string;
  readonly contentFingerprint: string;
  readonly riskLevel: ReviewedKnowledgeItem['riskLevel'];
  readonly riskReasons: readonly string[];
}

export interface ReviewedPromotionRecord {
  readonly schemaVersion: 1;
  readonly task: 'SAAS-608';
  readonly repository: string;
  readonly prNumber: number;
  readonly editorialDate: string;
  readonly approver: string;
  readonly approvedAt: string;
  readonly candidateSha: string;
  readonly manifestSha256: string;
  readonly ledgerSha256: string;
  readonly promotedItemIds: readonly string[];
  readonly publishedPaths: readonly string[];
  readonly promotedCandidates: readonly PromotedCandidateProvenance[];
}

export interface ReviewedPromotion {
  readonly items: readonly ReviewedKnowledgeItem[];
  readonly record: ReviewedPromotionRecord;
}

export interface PromoteReviewedManifestInput {
  readonly repository: string;
  readonly repositoryOwner: string;
  readonly approver: string;
  readonly prNumber: number;
  readonly candidateSha: string;
  readonly currentHeadSha: string;
  readonly approvedAt: string;
  readonly manifest: DailyReviewManifest;
  readonly ledger: DailyReviewLedger;
  readonly manifestSha256: string;
  readonly ledgerSha256: string;
  readonly existingItems: readonly ReviewedKnowledgeItem[];
}

export interface ReviewedApprovalSeal {
  readonly schemaVersion: 1;
  readonly task: 'SAAS-608';
  readonly repository: string;
  readonly prNumber: number;
  readonly editorialDate: string;
  readonly approver: string;
  readonly approvedAt: string;
  readonly candidateSha: string;
  readonly promotionSha: string;
  readonly manifestSha256: string;
  readonly ledgerSha256: string;
  readonly promotedItemIds: readonly string[];
  readonly releaseTagRule: string;
}

function requireText(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} is required`);
  }
}

function requireDateOnly(value: string, label: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)
    || new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} must use a real YYYY-MM-DD date`);
  }
}

function requireIsoTimestamp(value: string, label: string) {
  requireText(value, label);
  if (!value.includes('T') || Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} must be an ISO timestamp`);
  }
}

export function requireFullGitSha(value: string, label = 'candidate SHA') {
  if (!FULL_GIT_SHA.test(value)) {
    throw new Error(`${label} must be a full lowercase Git SHA`);
  }
  return value;
}

function requireSha256(value: string, label: string) {
  if (!SHA256.test(value)) throw new Error(`${label} must be a lowercase SHA-256 digest`);
}

function requireRepository(value: string) {
  if (!SAFE_REPOSITORY.test(value)) throw new Error('repository identity is invalid');
}

function equalStrings(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function promotionReleaseTagRule(editorialDate: string) {
  return `stephen-content-${editorialDate}-${RELEASE_TAG_SUFFIX_RULE}`;
}

function buildReviewedItem(
  candidate: DailyReviewManifest['candidates'][number],
  input: PromoteReviewedManifestInput,
): ReviewedKnowledgeItem {
  const draft = parseDailyPublicationDraft(candidate.publicationDraft);
  if (!draft) throw new Error(`${candidate.candidateId} publicationDraft is required`);
  if (!SAFE_ITEM_ID.test(candidate.candidateId)) {
    throw new Error(`${candidate.candidateId} is not a safe publication item ID`);
  }

  const evidence = [{
    id: `${candidate.candidateId}-e1`,
    sourceId: candidate.sourceId,
    title: candidate.originalTitle,
    publisher: candidate.sourceName,
    url: candidate.canonicalUrl,
    publishedAt: candidate.publishedAt,
    level: draft.primaryEvidenceLevel,
    language: draft.primaryEvidenceLanguage,
    allowlisted: true,
    dateBasis: draft.primaryEvidenceDateBasis,
  }, ...draft.additionalEvidence.map((entry, index) => ({
    id: `${candidate.candidateId}-e${index + 2}`,
    ...entry,
    allowlisted: true,
  }))] as const;

  const supportingFacts = draft.supportingFacts.map((fact, index) => ({
    id: `${candidate.candidateId}-f${index + 1}`,
    statement: fact.statement,
    evidenceIds: fact.evidenceIndexes.map((evidenceIndex) => {
      const evidenceId = evidence[evidenceIndex - 1]?.id;
      if (!evidenceId) {
        throw new Error(`${candidate.candidateId} supporting fact references missing evidence`);
      }
      return evidenceId;
    }),
  }));

  return {
    id: candidate.candidateId,
    slug: draft.slug,
    title: { zh: candidate.editorialDraft.titleZh },
    summary: { zh: candidate.editorialDraft.summaryZh },
    kind: draft.kind,
    domains: draft.domains,
    topicSlugs: draft.topicSlugs,
    audience: draft.audience,
    publishedAt: candidate.publishedAt,
    updatedAt: input.approvedAt,
    freshness: draft.freshness,
    whyItMatters: { zh: candidate.editorialDraft.whyItMattersZh },
    salesImplication: { zh: candidate.editorialDraft.salesImplicationZh },
    roleOrgImplication: { zh: candidate.editorialDraft.roleOrgImplicationZh },
    nextAction: { zh: candidate.editorialDraft.nextActionZh },
    evidence,
    relatedItemIds: [],
    editorialStatus: 'approved',
    riskLevel: candidate.riskLevel,
    publicationMode: 'manual',
    seedContent: false,
    audit: {
      sourceFingerprint: candidate.contentFingerprint,
      ruleVersion: 'saas-608-owner-approved-v1',
      processedAt: input.approvedAt,
      releaseVersion: `reviewed-${input.manifest.editorialDate}-${input.candidateSha.slice(0, 12)}`,
      rollbackState: 'available',
    },
    conclusionScope: draft.conclusionScope,
    supportingFacts,
    deeperAnalysis: draft.deeperAnalysis,
    originalTitle: candidate.originalTitle,
    tags: draft.tags,
    toolIds: draft.toolIds,
    review: {
      status: 'approved',
      verifiedAt: input.approvedAt,
      changeWindow: draft.changeWindow,
      factType: draft.factType,
      verificationNotes: draft.verificationNotes,
    },
  };
}

export function promoteReviewedManifest(
  input: PromoteReviewedManifestInput,
): ReviewedPromotion {
  requireRepository(input.repository);
  requireText(input.repositoryOwner, 'repository owner');
  requireText(input.approver, 'approver');
  if (input.repository.split('/')[0] !== input.repositoryOwner
    || input.approver !== input.repositoryOwner) {
    throw new Error('only the repository owner can approve reviewed content');
  }
  if (!Number.isInteger(input.prNumber) || input.prNumber < 1) {
    throw new Error('PR number must be a positive integer');
  }
  requireFullGitSha(input.candidateSha);
  requireFullGitSha(input.currentHeadSha, 'current PR head SHA');
  if (input.candidateSha !== input.currentHeadSha) {
    throw new Error('candidate SHA does not match current PR head');
  }
  requireIsoTimestamp(input.approvedAt, 'approvedAt');
  requireSha256(input.manifestSha256, 'manifest digest');
  requireSha256(input.ledgerSha256, 'ledger digest');
  requireDateOnly(input.manifest.editorialDate, 'manifest editorialDate');
  if (input.manifest.schemaVersion !== 1
    || input.manifest.task !== 'SAAS-606'
    || input.manifest.reviewState !== 'pending_owner_review'
    || input.manifest.publicationState !== 'not_published'
    || input.manifest.controls.autoPublishingEnabled !== false
    || input.manifest.controls.stopSwitchEngaged !== true) {
    throw new Error('review manifest publication controls are unsafe');
  }
  if (input.manifest.manualReviewRecords.length !== 0) {
    throw new Error('manualReviewRecords must be empty before approval');
  }
  if (input.manifest.candidates.length === 0) {
    throw new Error('review manifest contains no retained candidates');
  }
  if (input.ledger.schemaVersion !== 1
    || input.ledger.task !== 'SAAS-606'
    || input.ledger.editorialDate !== input.manifest.editorialDate) {
    throw new Error('discovery ledger does not match the review manifest');
  }
  const seenIds = new Set(input.ledger.seenCandidateIds);
  if (input.manifest.candidates.some((candidate) => !seenIds.has(candidate.candidateId))) {
    throw new Error('discovery ledger is missing a retained candidate');
  }

  const candidateIds = input.manifest.candidates.map((candidate) => candidate.candidateId);
  if (new Set(candidateIds).size !== candidateIds.length) {
    throw new Error('duplicate promoted item ID');
  }
  const parsedDrafts = input.manifest.candidates.map((candidate) => {
    const draft = parseDailyPublicationDraft(candidate.publicationDraft);
    if (!draft) throw new Error(`${candidate.candidateId} publicationDraft is required`);
    return draft;
  });
  const slugs = parsedDrafts.map((draft) => draft.slug);
  if (new Set(slugs).size !== slugs.length) {
    throw new Error('duplicate promoted slug');
  }

  const existingIds = new Set(input.existingItems.map((item) => item.id));
  const existingSlugs = new Set(input.existingItems.map((item) => item.slug));
  const existingFingerprints = new Set(
    input.existingItems.map((item) => item.audit.sourceFingerprint),
  );
  if (input.manifest.candidates.some((candidate, index) => (
    existingIds.has(candidate.candidateId)
    || existingSlugs.has(parsedDrafts[index].slug)
    || existingFingerprints.has(candidate.contentFingerprint)
  ))) {
    throw new Error('candidate is already published');
  }

  const items = input.manifest.candidates.map((candidate) => buildReviewedItem(candidate, input));
  validateApprovedReviewedItems(items);
  const promotedItemIds = items.map((item) => item.id);
  return {
    items,
    record: {
      schemaVersion: 1,
      task: 'SAAS-608',
      repository: input.repository,
      prNumber: input.prNumber,
      editorialDate: input.manifest.editorialDate,
      approver: input.approver,
      approvedAt: new Date(input.approvedAt).toISOString(),
      candidateSha: input.candidateSha,
      manifestSha256: input.manifestSha256,
      ledgerSha256: input.ledgerSha256,
      promotedItemIds,
      publishedPaths: promotedItemIds.map((id) => `src/content/published/${id}.json`),
      promotedCandidates: input.manifest.candidates.map((candidate) => ({
        itemId: candidate.candidateId,
        sourceId: candidate.sourceId,
        canonicalUrl: candidate.canonicalUrl,
        contentFingerprint: candidate.contentFingerprint,
        riskLevel: candidate.riskLevel,
        riskReasons: candidate.riskReasons,
      })),
    },
  };
}

export function buildApprovalSeal(input: {
  readonly promotion: ReviewedPromotionRecord;
  readonly promotionSha: string;
}): ReviewedApprovalSeal {
  requireFullGitSha(input.promotion.candidateSha);
  requireFullGitSha(input.promotionSha, 'promotion SHA');
  requireSha256(input.promotion.manifestSha256, 'manifest digest');
  requireSha256(input.promotion.ledgerSha256, 'ledger digest');
  return {
    schemaVersion: 1,
    task: 'SAAS-608',
    repository: input.promotion.repository,
    prNumber: input.promotion.prNumber,
    editorialDate: input.promotion.editorialDate,
    approver: input.promotion.approver,
    approvedAt: input.promotion.approvedAt,
    candidateSha: input.promotion.candidateSha,
    promotionSha: input.promotionSha,
    manifestSha256: input.promotion.manifestSha256,
    ledgerSha256: input.promotion.ledgerSha256,
    promotedItemIds: input.promotion.promotedItemIds,
    releaseTagRule: promotionReleaseTagRule(input.promotion.editorialDate),
  };
}

export function reviewedReleaseTag(editorialDate: string, sealSha: string) {
  requireDateOnly(editorialDate, 'editorialDate');
  requireFullGitSha(sealSha, 'seal SHA');
  return `stephen-content-${editorialDate}-${sealSha.slice(0, 12)}`;
}

export interface VerifyApprovalChainInput {
  readonly promotion: ReviewedPromotionRecord;
  readonly seal: ReviewedApprovalSeal;
  readonly candidateSha: string;
  readonly promotionSha: string;
  readonly sealSha: string;
  readonly promotionParentSha: string;
  readonly sealParentSha: string;
  readonly prHeadSha: string;
  readonly repository: string;
  readonly releaseTag: string;
}

export interface VerifiedApprovalChain {
  readonly candidateSha: string;
  readonly promotionSha: string;
  readonly sealSha: string;
  readonly releaseTag: string;
  readonly promotedItemIds: readonly string[];
}

export function verifyApprovalChain(input: VerifyApprovalChainInput): VerifiedApprovalChain {
  for (const [value, label] of [
    [input.candidateSha, 'candidate SHA'],
    [input.promotionSha, 'promotion SHA'],
    [input.sealSha, 'seal SHA'],
    [input.promotionParentSha, 'promotion parent SHA'],
    [input.sealParentSha, 'seal parent SHA'],
    [input.prHeadSha, 'PR head SHA'],
  ] as const) requireFullGitSha(value, label);
  requireRepository(input.repository);

  if (input.promotionParentSha !== input.candidateSha
    || input.promotion.candidateSha !== input.candidateSha) {
    throw new Error('promotion parent does not match approved candidate SHA');
  }
  if (input.sealParentSha !== input.promotionSha
    || input.seal.promotionSha !== input.promotionSha) {
    throw new Error('approval seal parent does not match promotion SHA');
  }
  if (input.prHeadSha !== input.sealSha) {
    throw new Error('PR head does not match approval seal SHA');
  }
  if (input.promotion.repository !== input.repository
    || input.seal.repository !== input.repository) {
    throw new Error('approval chain repository identity does not match');
  }
  if (input.seal.candidateSha !== input.promotion.candidateSha
    || input.seal.prNumber !== input.promotion.prNumber
    || input.seal.editorialDate !== input.promotion.editorialDate
    || input.seal.approver !== input.promotion.approver
    || input.seal.approvedAt !== input.promotion.approvedAt) {
    throw new Error('approval seal identity does not match promotion');
  }
  if (!equalStrings(input.seal.promotedItemIds, input.promotion.promotedItemIds)) {
    throw new Error('approval seal promoted IDs do not match promotion');
  }
  if (input.seal.manifestSha256 !== input.promotion.manifestSha256
    || input.seal.ledgerSha256 !== input.promotion.ledgerSha256) {
    throw new Error('approval seal input digests do not match promotion');
  }
  if (input.seal.releaseTagRule !== promotionReleaseTagRule(input.seal.editorialDate)) {
    throw new Error('approval seal release tag rule is invalid');
  }
  const expectedTag = reviewedReleaseTag(input.seal.editorialDate, input.sealSha);
  if (input.releaseTag !== expectedTag) {
    throw new Error('release tag does not match the approval seal SHA');
  }
  return {
    candidateSha: input.candidateSha,
    promotionSha: input.promotionSha,
    sealSha: input.sealSha,
    releaseTag: expectedTag,
    promotedItemIds: input.promotion.promotedItemIds,
  };
}
