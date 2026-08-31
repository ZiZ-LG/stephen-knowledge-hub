import type { ReviewedKnowledgeItem } from '../src/domain.ts';
import { validateApprovedReviewedItems } from '../src/content/validate.ts';
import {
  parseDailyPublicationDraft,
  type DailyReviewLedger,
  type DailyReviewManifest,
} from './stephen-daily-review.ts';

const FULL_GIT_SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const SHA256_WITH_ALGORITHM = /^sha256:[0-9a-f]{64}$/;
const SAFE_REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SAFE_ITEM_ID = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

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

export interface ReviewedApprovalPullRequest {
  readonly number: number;
  readonly state: string;
  readonly draft: boolean;
  readonly changedFiles: number;
  readonly head: {
    readonly sha: string;
    readonly ref: string;
    readonly repository: string;
  };
  readonly base: {
    readonly ref: string;
    readonly repository: string;
    readonly sha: string;
  };
}

export interface ReviewedApprovalChangedFile {
  readonly filename: string;
  readonly status: string;
}

export interface ReviewedApprovalRequestInput {
  readonly actor: string;
  readonly triggeringActor: string;
  readonly repositoryOwner: string;
  readonly repository: string;
  readonly defaultBranch: string;
  readonly candidateSha: string;
  readonly confirmation: string;
  readonly pr: ReviewedApprovalPullRequest;
  readonly changedFiles: readonly ReviewedApprovalChangedFile[];
  readonly manifest: DailyReviewManifest;
}

export interface VerifiedReviewedApprovalRequest {
  readonly prNumber: number;
  readonly candidateSha: string;
  readonly headRef: string;
  readonly editorialDate: string;
  readonly manifestPath: string;
  readonly ledgerPath: string;
  readonly baseSha: string;
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

function validateApprovalReadyManifest(manifest: DailyReviewManifest) {
  if (manifest.schemaVersion !== 1
    || manifest.task !== 'SAAS-606'
    || manifest.reviewState !== 'pending_owner_review'
    || manifest.publicationState !== 'not_published'
    || manifest.controls.autoPublishingEnabled !== false
    || manifest.controls.stopSwitchEngaged !== true) {
    throw new Error('review manifest publication controls are unsafe');
  }
  if (manifest.manualReviewRecords.length !== 0) {
    throw new Error('manualReviewRecords must be empty before approval');
  }
  if (manifest.candidates.length === 0) {
    throw new Error('review manifest contains no retained candidates');
  }
  return manifest.candidates.map((candidate) => {
    const draft = parseDailyPublicationDraft(candidate.publicationDraft);
    if (!draft) throw new Error(`${candidate.candidateId} publicationDraft is required`);
    return draft;
  });
}

function equalStrings(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function promotionReleaseTagRule(editorialDate: string) {
  return `stephen-content-${editorialDate}-${RELEASE_TAG_SUFFIX_RULE}`;
}

export function evaluateReviewedApprovalRequest(
  input: ReviewedApprovalRequestInput,
): VerifiedReviewedApprovalRequest {
  requireText(input.repositoryOwner, 'repository owner');
  requireRepository(input.repository);
  if (input.repository.split('/')[0] !== input.repositoryOwner) {
    throw new Error('approval repository does not belong to the repository owner');
  }
  if (input.actor !== input.repositoryOwner || input.triggeringActor !== input.repositoryOwner) {
    throw new Error('only the repository owner may dispatch reviewed approval');
  }
  requireFullGitSha(input.candidateSha);
  if (input.confirmation !== `APPROVE ${input.candidateSha}`) {
    throw new Error('approval confirmation does not bind the candidate SHA');
  }
  requireText(input.defaultBranch, 'default branch');
  if (!Number.isInteger(input.pr.number) || input.pr.number < 1) {
    throw new Error('approval PR number is invalid');
  }
  if (input.pr.state !== 'open' || input.pr.draft !== true) {
    throw new Error('approval PR must remain open and Draft');
  }
  if (input.pr.head.repository !== input.repository
    || input.pr.base.repository !== input.repository) {
    throw new Error('cross-repository approval PRs are forbidden');
  }
  if (input.pr.base.ref !== input.defaultBranch) {
    throw new Error('approval PR must target the default branch');
  }
  requireFullGitSha(input.pr.base.sha, 'PR base SHA');
  requireFullGitSha(input.pr.head.sha, 'PR head SHA');
  if (input.pr.head.sha !== input.candidateSha) {
    throw new Error('candidate SHA does not match current PR head');
  }
  requireDateOnly(input.manifest.editorialDate, 'manifest editorialDate');
  const expectedHead = `codex/stephen-daily-${input.manifest.editorialDate}`;
  if (input.pr.head.ref !== expectedHead) {
    throw new Error('approval PR head must be the matching daily candidate branch');
  }
  validateApprovalReadyManifest(input.manifest);

  const manifestPath = `review-candidates/${input.manifest.editorialDate}/review-manifest.json`;
  const ledgerPath = `review-candidates/${input.manifest.editorialDate}/discovery-ledger.json`;
  const allowed = new Set([manifestPath, ledgerPath]);
  if (input.pr.changedFiles !== input.changedFiles.length
    || input.changedFiles.some((file) => !allowed.has(file.filename))) {
    throw new Error('approval PR contains an unexpected changed path');
  }
  if (input.changedFiles.length !== allowed.size
    || [...allowed].some((path) => !input.changedFiles.some((file) => file.filename === path))) {
    throw new Error('approval PR must contain both daily review files');
  }
  if (input.changedFiles.some((file) => file.status !== 'added' && file.status !== 'modified')) {
    throw new Error('approval PR review files must be added or modified');
  }

  return {
    prNumber: input.pr.number,
    candidateSha: input.candidateSha,
    headRef: input.pr.head.ref,
    editorialDate: input.manifest.editorialDate,
    manifestPath,
    ledgerPath,
    baseSha: input.pr.base.sha,
  };
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
  const parsedDrafts = validateApprovalReadyManifest(input.manifest);
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
  const slugs = parsedDrafts.map((draft) => draft.slug);
  if (new Set(slugs).size !== slugs.length) {
    throw new Error('duplicate promoted slug');
  }
  const fingerprints = input.manifest.candidates.map((candidate) => candidate.contentFingerprint);
  if (new Set(fingerprints).size !== fingerprints.length) {
    throw new Error('duplicate promoted content fingerprint');
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

export interface ReviewedReleaseHandoffPayload {
  readonly pr: number;
  readonly candidateSha: string;
  readonly promotionSha: string;
  readonly sealSha: string;
  readonly mergeSha: string;
  readonly approvalRecord: string;
  readonly releaseTag: string;
  readonly approvalRunId: number;
  readonly approvalRunAttempt: number;
  readonly controlSha: string;
}

export interface ReviewedReleasePullRequest {
  readonly number: number;
  readonly merged: boolean;
  readonly mergeCommitSha: string;
  readonly headSha: string;
  readonly headRepository: string;
  readonly baseRepository: string;
  readonly baseRef: string;
}

export interface ReviewedApprovalHandoffArtifact {
  readonly id: number;
  readonly name: string;
  readonly expired: boolean;
  readonly digest: string;
  readonly workflowRunId: number;
}

export interface ReviewedApprovalJobStep {
  readonly number: number;
  readonly name: string;
  readonly status: string;
  readonly conclusion: string | null;
}

export interface ReviewedApprovalJob {
  readonly name: string;
  readonly status: string;
  readonly conclusion: string | null;
  readonly steps: readonly ReviewedApprovalJobStep[];
}

export interface ReviewedExactSealRebuild {
  readonly sealSha: string;
  readonly verified: boolean;
}

export interface ReviewedApprovalWorkflowRun {
  readonly id: number;
  readonly runAttempt: number;
  readonly event: string;
  readonly status: string;
  readonly conclusion: string | null;
  readonly headSha: string;
  readonly path: string;
  readonly actor: string;
  readonly triggeringActor: string;
}

export interface ReviewedRepositoryWriteCollaborator {
  readonly login: string;
}

export interface ReviewedReleaseTagRuleset {
  readonly name: string;
  readonly target: string;
  readonly enforcement: string;
  readonly bypassActorCount: number;
  readonly includedRefs: readonly string[];
  readonly excludedRefs: readonly string[];
  readonly ruleTypes: readonly string[];
}

export interface ReviewedReleaseAssetExpectation {
  readonly name: string;
  readonly sha256: string;
}

export interface ExistingReviewedRelease {
  readonly id: number;
  readonly tagName: string;
  readonly targetCommitish: string;
  readonly draft: boolean;
  readonly immutable: boolean;
  readonly assets: readonly {
    readonly id: number;
    readonly name: string;
    readonly digest: string | null;
  }[];
}

export interface ReviewedReleaseRequestInput {
  readonly repository: string;
  readonly defaultBranch: string;
  readonly defaultBranchHeadSha: string;
  readonly mergeReachableFromDefault: boolean;
  readonly payload: ReviewedReleaseHandoffPayload;
  readonly pr: ReviewedReleasePullRequest;
  readonly approvalRun: ReviewedApprovalWorkflowRun;
  readonly approvalArtifact: ReviewedApprovalHandoffArtifact;
  readonly approvalJob: ReviewedApprovalJob;
  readonly exactSealRebuild: ReviewedExactSealRebuild;
  readonly writeCollaborators: readonly ReviewedRepositoryWriteCollaborator[];
  readonly releaseTagRuleset: ReviewedReleaseTagRuleset;
  readonly immutableReleases: { readonly enabled: boolean };
  readonly promotion: ReviewedPromotionRecord;
  readonly seal: ReviewedApprovalSeal;
  readonly promotionParentSha: string;
  readonly sealParentSha: string;
  readonly expectedAssets: readonly ReviewedReleaseAssetExpectation[];
  readonly existingTag: null | {
    readonly objectType: string;
    readonly sha: string;
  };
  readonly existingRelease: ExistingReviewedRelease | null;
}

export interface ReviewedReleasePreparation {
  readonly status: 'create_draft' | 'reuse_draft' | 'already_immutable';
  readonly releaseTag: string;
  readonly targetCommitish: string;
  readonly releaseId: number | null;
  readonly missingAssets: readonly string[];
}

function containsForbiddenServerField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenServerField);
  if (typeof value !== 'object' || value === null) return false;
  const forbidden = [
    'deployment',
    'environment',
    'server',
    'host',
    'ssh',
    'nginx',
    'dns',
    'traffic',
    'production',
  ];
  return Object.entries(value).some(([key, entry]) => {
    const normalized = key.replace(/[^a-z]/gi, '').toLocaleLowerCase();
    return forbidden.some((word) => normalized.includes(word))
      || containsForbiddenServerField(entry);
  });
}

function expectedReleaseAssetNames(sealSha: string) {
  return [
    'default.stephen-release.json',
    `stephen-site-${sealSha.slice(0, 12)}.tar.gz`,
  ].sort((left, right) => left.localeCompare(right));
}

export function evaluateReviewedReleaseRequest(
  input: ReviewedReleaseRequestInput,
): ReviewedReleasePreparation {
  requireRepository(input.repository);
  const repositoryOwner = input.repository.split('/')[0];
  requireText(input.defaultBranch, 'default branch');
  if (input.promotion.approver !== repositoryOwner
    || input.seal.approver !== repositoryOwner) {
    throw new Error('reviewed Release approval is not owned by the repository owner');
  }
  if (containsForbiddenServerField(input.payload)) {
    throw new Error('Release payload contains a forbidden server-operation field');
  }
  if (!Number.isInteger(input.payload.pr) || input.payload.pr < 1) {
    throw new Error('Release payload PR number is invalid');
  }
  if (!Number.isInteger(input.payload.approvalRunId) || input.payload.approvalRunId < 1
    || !Number.isInteger(input.payload.approvalRunAttempt)
    || input.payload.approvalRunAttempt < 1) {
    throw new Error('approval workflow run identity is invalid');
  }
  for (const [value, label] of [
    [input.payload.candidateSha, 'candidate SHA'],
    [input.payload.promotionSha, 'promotion SHA'],
    [input.payload.sealSha, 'seal SHA'],
    [input.payload.mergeSha, 'merge SHA'],
    [input.payload.controlSha, 'approval control SHA'],
    [input.defaultBranchHeadSha, 'default branch head SHA'],
  ] as const) requireFullGitSha(value, label);
  if (input.pr.number !== input.payload.pr
    || input.pr.merged !== true
    || input.pr.headRepository !== input.repository
    || input.pr.baseRepository !== input.repository
    || input.pr.baseRef !== input.defaultBranch) {
    throw new Error('reviewed Release requires the merged approval PR');
  }
  if (input.pr.mergeCommitSha !== input.payload.mergeSha) {
    throw new Error('merge commit does not match the durable approval handoff');
  }
  if (input.pr.headSha !== input.payload.sealSha) {
    throw new Error('merged PR head does not match the approval seal SHA');
  }
  if (input.mergeReachableFromDefault !== true) {
    throw new Error('approved merge is not reachable from the default branch');
  }
  const approvalPathPattern = new RegExp(
    `^editorial-releases/${input.seal.editorialDate}/${input.payload.candidateSha.slice(0, 12)}/approval\\.json$`,
  );
  if (!approvalPathPattern.test(input.payload.approvalRecord)) {
    throw new Error('approval record path does not match the approved candidate');
  }
  if (input.approvalRun.id !== input.payload.approvalRunId
    || input.approvalRun.runAttempt !== input.payload.approvalRunAttempt
    || input.approvalRun.event !== 'workflow_dispatch'
    || input.approvalRun.status !== 'completed'
    || input.approvalRun.conclusion !== 'success'
    || input.approvalRun.headSha !== input.payload.controlSha
    || input.approvalRun.path !== '.github/workflows/approve-reviewed-content.yml'
    || input.approvalRun.actor !== repositoryOwner
    || input.approvalRun.triggeringActor !== repositoryOwner) {
    throw new Error('approval workflow run provenance is invalid');
  }
  const expectedArtifactName = `stephen-reviewed-release-handoff-${input.payload.approvalRunId}-${input.payload.approvalRunAttempt}`;
  if (!Number.isInteger(input.approvalArtifact.id)
    || input.approvalArtifact.id < 1
    || input.approvalArtifact.name !== expectedArtifactName
    || input.approvalArtifact.expired !== false
    || !SHA256_WITH_ALGORITHM.test(input.approvalArtifact.digest)
    || input.approvalArtifact.workflowRunId !== input.payload.approvalRunId) {
    throw new Error('approval handoff artifact provenance is invalid');
  }
  const requiredApprovalSteps = [
    'Run the complete exact-seal CI gate',
    'Verify the seal chain before merge',
    'Build the durable reviewed-release handoff',
    'Persist the immutable reviewed-release handoff',
    'Make the reviewed PR ready and merge its exact seal SHA',
  ];
  if (input.approvalJob.name !== 'approve'
    || input.approvalJob.status !== 'completed'
    || input.approvalJob.conclusion !== 'success') {
    throw new Error('trusted approval step sequence is invalid');
  }
  let priorStepNumber = 0;
  for (const stepName of requiredApprovalSteps) {
    const matchingSteps = input.approvalJob.steps.filter((step) => step.name === stepName);
    const step = matchingSteps[0];
    if (matchingSteps.length !== 1
      || !step
      || !Number.isInteger(step.number)
      || step.number <= priorStepNumber
      || step.status !== 'completed'
      || step.conclusion !== 'success') {
      throw new Error('trusted approval step sequence is invalid');
    }
    priorStepNumber = step.number;
  }
  if (input.exactSealRebuild.verified !== true
    || input.exactSealRebuild.sealSha !== input.payload.sealSha) {
    throw new Error('exact approval seal rebuild is missing');
  }
  if (input.writeCollaborators.length !== 1
    || input.writeCollaborators[0]?.login !== repositoryOwner) {
    throw new Error('repository write boundary is not single-owner');
  }
  const expectedTagRules = ['deletion', 'update'];
  if (input.releaseTagRuleset.name !== 'Protect Stephen immutable Release tags'
    || input.releaseTagRuleset.target !== 'tag'
    || input.releaseTagRuleset.enforcement !== 'active'
    || input.releaseTagRuleset.bypassActorCount !== 0
    || !equalStrings(input.releaseTagRuleset.includedRefs, ['refs/tags/stephen-content-*'])
    || !Array.isArray(input.releaseTagRuleset.excludedRefs)
    || input.releaseTagRuleset.excludedRefs.length !== 0
    || !equalStrings(
      [...input.releaseTagRuleset.ruleTypes].sort((left, right) => left.localeCompare(right)),
      expectedTagRules,
    )) {
    throw new Error('Release tag protection ruleset is invalid');
  }

  verifyApprovalChain({
    promotion: input.promotion,
    seal: input.seal,
    candidateSha: input.payload.candidateSha,
    promotionSha: input.payload.promotionSha,
    sealSha: input.payload.sealSha,
    promotionParentSha: input.promotionParentSha,
    sealParentSha: input.sealParentSha,
    prHeadSha: input.pr.headSha,
    repository: input.repository,
    releaseTag: input.payload.releaseTag,
  });
  if (!input.immutableReleases.enabled) {
    throw new Error('repository immutable Releases must be enabled');
  }
  if (input.existingTag) {
    requireFullGitSha(input.existingTag.sha, 'existing Release tag SHA');
    if (input.existingTag.objectType !== 'commit'
      || input.existingTag.sha !== input.payload.sealSha) {
      throw new Error('existing Release tag points to another commit');
    }
  }

  const assetNames = input.expectedAssets.map((asset) => asset.name);
  const requiredAssetNames = expectedReleaseAssetNames(input.payload.sealSha);
  if (!equalStrings(
    [...assetNames].sort((left, right) => left.localeCompare(right)),
    requiredAssetNames,
  )) {
    throw new Error('Release asset set is invalid');
  }
  for (const asset of input.expectedAssets) {
    requireSha256(asset.sha256, `${asset.name} digest`);
  }
  const expectedByName = new Map(input.expectedAssets.map((asset) => [asset.name, asset]));

  if (!input.existingRelease) {
    if (input.existingTag) {
      throw new Error('Release tag must not exist before immutable publication');
    }
    return {
      status: 'create_draft',
      releaseTag: input.payload.releaseTag,
      targetCommitish: input.payload.sealSha,
      releaseId: null,
      missingAssets: requiredAssetNames,
    };
  }

  const release = input.existingRelease;
  if (!Number.isInteger(release.id) || release.id < 1
    || release.tagName !== input.payload.releaseTag
    || release.targetCommitish !== input.payload.sealSha) {
    throw new Error('existing Release identity does not match the approval seal');
  }
  if (!release.draft && !release.immutable) {
    throw new Error('existing published Release is mutable');
  }
  if (release.draft && release.immutable) {
    throw new Error('Draft Release cannot already be immutable');
  }
  if (release.draft && input.existingTag) {
    throw new Error('Release tag must not exist before immutable publication');
  }
  const existingNames = new Set<string>();
  for (const asset of release.assets) {
    if (existingNames.has(asset.name) || !expectedByName.has(asset.name)) {
      throw new Error('existing Release contains an unexpected asset');
    }
    existingNames.add(asset.name);
    const expected = expectedByName.get(asset.name)!;
    if (asset.digest !== `sha256:${expected.sha256}`) {
      throw new Error('existing Release asset digest does not match');
    }
  }
  const missingAssets = requiredAssetNames.filter((name) => !existingNames.has(name));
  if (release.immutable) {
    if (release.draft || missingAssets.length !== 0 || !input.existingTag) {
      throw new Error('immutable Release is incomplete');
    }
    return {
      status: 'already_immutable',
      releaseTag: input.payload.releaseTag,
      targetCommitish: input.payload.sealSha,
      releaseId: release.id,
      missingAssets: [],
    };
  }
  if (!release.draft) throw new Error('existing published Release is mutable');
  return {
    status: 'reuse_draft',
    releaseTag: input.payload.releaseTag,
    targetCommitish: input.payload.sealSha,
    releaseId: release.id,
    missingAssets,
  };
}
