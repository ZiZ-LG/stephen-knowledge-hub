# Stephen Reviewed Release Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fail-closed Stephen content release loop that binds owner approval to an exact candidate SHA, promotes only the retained candidates into the public collection, merges the reviewed PR after exact-head CI, and publishes an immutable GitHub Release without any production deployment.

**Architecture:** A trusted `workflow_dispatch` running from the default branch verifies the owner, PR identity, exact head SHA, and candidate-only diff. It writes a promotion commit whose parent is the approved candidate SHA, then an approval-seal commit whose parent and record bind the promotion SHA; the same runner checks out the seal SHA, runs the complete repository gate, records a check run, and merges with the GitHub merge API using the seal SHA as a compare-and-swap guard. A separate trusted `repository_dispatch` workflow verifies the merged PR and two-commit chain, builds the seal SHA, creates a Draft Release, uploads the bounded artifact and metadata, then publishes only when repository release immutability is enabled.

**Tech Stack:** TypeScript, Vitest, Vite, Node.js 22.12+, GitHub Actions on `ubuntu-latest`, GitHub REST API, Git merge commits, native immutable GitHub Releases.

## Global Constraints

- Task identity: `SAAS-608`.
- The human approval input must include the full 40-character candidate head SHA and must match the current same-repository Draft PR head.
- Only the repository owner may perform the approval dispatch; both `github.actor` and `github.triggering_actor` must match the repository owner.
- AI and candidate-generation code cannot set `approved`, `published`, merge, tag, or Release state.
- A candidate missing a complete human-reviewable `publicationDraft` fails closed and is not promoted.
- `manualReviewRecords` must be empty before approval.
- Promotion creates exactly two commits: `candidate SHA -> promotion commit -> approval seal commit`.
- Full TypeScript, tests, build, exact-SHA artifact verification, and public audit must pass on the seal tree before merge.
- Merge uses `merge` and the exact seal SHA compare-and-swap parameter; head drift fails.
- Release tag format is `stephen-content-YYYY-MM-DD-<seal-sha-12>` and targets the seal SHA. Because a commit cannot contain a value derived from its own SHA, the approval seal records the fixed tag rule; the exact tag is derived and verified only after the seal commit exists.
- Release creation follows Draft -> upload all assets -> publish; post-publication API state must report `immutable: true`.
- No deployment event, GitHub Environment, production secret, SSH, Nginx, DNS, traffic switch, or server operation is added.
- Existing Draft PR #1 is not modified by this implementation branch; this plan is delivered as a stacked PR based on `codex/bootstrap-extraction` until separate merge authorization exists.

---

## File Structure

- `src/content/published/*.json`: one immutable formal item per approved daily candidate; avoids a shared generated-file merge hotspot.
- `src/content/publishedItems.ts`: eagerly loads formal JSON items and validates the public collection.
- `src/content/publicItems.ts`: combines the 30 approved seeds with approved daily items.
- `src/domain.ts`: makes seed-only classification optional for non-seed reviewed content while keeping `SeedCandidate` strict.
- `src/content/validate.ts`: validates all reviewed public items and preserves seed-specific 30-item governance.
- `scripts/stephen-reviewed-release.ts`: pure parsing, promotion, approval-record, commit-chain, PR, and release-tag contracts.
- `scripts/stephen-reviewed-release-cli.ts`: bounded filesystem CLI used by trusted workflows and fixture acceptance.
- `src/content/reviewed-release.test.ts`: behavior tests for exact-SHA approval, promotion, seal validation, and failure paths.
- `.github/workflows/approve-reviewed-content.yml`: owner dispatch, exact-SHA verification, two commits, full CI, exact merge, release dispatch.
- `.github/workflows/publish-reviewed-release.yml`: post-merge verification and immutable Release creation; no deployment.
- `docs/reviewed-release-runbook.md`: operator inputs, failure recovery, and non-deployment boundary.
- `scripts/public-repo-audit.ts`: rejects deployment surfaces and unsafe reviewed-release workflow drift.

---

### Task 1: Generalize the approved public collection for non-seed reviewed items

**Files:**
- Modify: `src/domain.ts`
- Modify: `src/content/validate.ts`
- Create: `src/content/publishedItems.ts`
- Create: `src/content/published/.gitkeep`
- Modify: `src/content/publicItems.ts`
- Modify: `src/pages/TodayPage.tsx`
- Modify: `src/pages/RadarPage.tsx`
- Modify: `src/pages/LibraryPage.tsx`
- Modify: `src/pages/TopicPage.tsx`
- Modify: `src/pages/DigestPage.tsx`
- Modify: `src/state/search.ts`
- Test: `src/content/content.test.ts`

**Interfaces:**
- Produces: `validateApprovedReviewedItems(items, sources)`.
- Produces: `approvedDailyItems: readonly ReviewedKnowledgeItem[]`.
- Produces: `approvedKnowledgeItems: readonly ReviewedKnowledgeItem[]`.
- Preserves: `SeedCandidate.seedContent === true` and required `seedCategory` for seed-only governance.

- [ ] **Step 1: Write the failing collection test**

Add a hand-written non-seed reviewed item fixture to `content.test.ts`; assert that it can join the public collection only when `editorialStatus`, `review.status`, evidence, supporting facts, analysis, and manual publication state are approved and complete. Mutating any one of those gates must throw.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/content/content.test.ts`

Expected: FAIL because `validateApprovedReviewedItems` and `approvedDailyItems` do not exist and the current public collection is typed as seeds only.

- [ ] **Step 3: Implement the reviewed-item boundary**

Make `ReviewedKnowledgeItem.seedCategory` optional and restate it as required on `SeedCandidate`. Extract the supporting-fact, source, analysis, terminology, manual-publication, and approved-review checks into `validateApprovedReviewedItems`. Keep the 30-item mainland-source and AI-category ratios inside `validateApprovedSeedItems` only.

Load `src/content/published/*.json` with an eager Vite glob, sort by item ID, validate the result, and concatenate it after the explicit seed allowlist.

- [ ] **Step 4: Refactor consumer types**

Replace page and search props that unnecessarily require `SeedCandidate` with `ReviewedKnowledgeItem`. Preserve behavior and avoid `as` casts that would let an unreviewed `KnowledgeItem` enter the UI.

- [ ] **Step 5: Run focused and full tests**

Run: `npm test -- src/content/content.test.ts src/navigation.test.ts src/content/digests.test.ts src/state/localLibrary.test.ts`

Expected: PASS with both seed and non-seed reviewed items covered.

- [ ] **Step 6: Commit**

```bash
git add src/domain.ts src/content/validate.ts src/content/publishedItems.ts src/content/published/.gitkeep src/content/publicItems.ts src/pages src/state/search.ts src/content/content.test.ts
git commit -m "feat(saas-608): support approved daily content"
```

### Task 2: Define exact-SHA promotion and approval-seal contracts

**Files:**
- Modify: `scripts/stephen-daily-review.ts`
- Create: `scripts/stephen-reviewed-release.ts`
- Test: `src/content/reviewed-release.test.ts`
- Modify: `tsconfig.editorial.json`

**Interfaces:**
- Produces: `DailyPublicationDraft` on an otherwise pending `DailyReviewCandidate`.
- Produces: `promoteReviewedManifest(input): ReviewedPromotion`.
- Produces: `buildApprovalSeal(input): ReviewedApprovalSeal`.
- Produces: `verifyApprovalChain(input): VerifiedApprovalChain`.
- Produces: `reviewedReleaseTag(editorialDate, sealSha): string`.

- [ ] **Step 1: Write failing exact-SHA and promotion tests**

Use literal candidate, manifest, and prior published-item fixtures. Assert:

- full candidate SHA is required and equals the supplied current PR head;
- a non-owner approver is rejected;
- `manualReviewRecords` blocks promotion;
- missing or incomplete `publicationDraft` blocks promotion;
- two candidates produce two approved non-seed formal items without changing source or risk fields;
- duplicate ID/slug or an already-published candidate fails;
- promotion metadata includes the candidate SHA plus manifest and ledger SHA-256 digests;
- release tag is deterministic and uses the first 12 seal-SHA characters.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/content/reviewed-release.test.ts`

Expected: FAIL because the reviewed-release module is absent.

- [ ] **Step 3: Implement minimal pure promotion code**

Parse `publicationDraft` fields independently from AI-controlled status. Build one primary evidence record from the original candidate and any owner-added supporting evidence from `publicationDraft`. Map only the retained candidates to `ReviewedKnowledgeItem` with:

```ts
{
  editorialStatus: 'approved',
  publicationMode: 'manual',
  seedContent: false,
  review: { status: 'approved', verifiedAt: approvedAt, ... },
  audit: { ruleVersion: 'saas-608-owner-approved-v1', ... },
}
```

The approval seal must contain `candidateSha`, `promotionSha`, PR number, approver, approval time, editorial date, promoted IDs, both input digests, and the fixed Release tag rule. It must never contain a credential or production target. The exact Release tag is derived from the resulting seal SHA and verified outside the seal tree.

- [ ] **Step 4: Add commit-chain failure tests**

Assert verification fails when:

- the promotion parent differs from the approved candidate SHA;
- the seal parent differs from the recorded promotion SHA;
- the PR head differs from the seal SHA;
- promoted IDs or digests differ;
- tag or repository identity differs.

- [ ] **Step 5: Run RED then GREEN**

Run after writing the new failures, then implement `verifyApprovalChain` and rerun:

`npm test -- src/content/reviewed-release.test.ts`

Expected final result: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/stephen-daily-review.ts scripts/stephen-reviewed-release.ts src/content/reviewed-release.test.ts tsconfig.editorial.json
git commit -m "feat(saas-608): bind promotion to owner approval"
```

### Task 3: Add the bounded promotion CLI and fixture journey

**Files:**
- Create: `scripts/stephen-reviewed-release-cli.ts`
- Create: `scripts/fixtures/saas-608-review-manifest.json`
- Create: `scripts/fixtures/saas-608-discovery-ledger.json`
- Modify: `src/content/reviewed-release.test.ts`
- Modify: `scripts/node-runtime.d.ts`

**Interfaces:**
- Produces CLI `promote --root --manifest --ledger --candidate-sha --current-head-sha --approver --repository-owner --approved-at --pr-number`.
- Produces CLI `seal --root --promotion-record --promotion-sha`.
- Produces CLI `verify-chain --root --approval-record --candidate-sha --promotion-sha --seal-sha`.

- [ ] **Step 1: Write a failing real-filesystem CLI test**

Copy the fixture manifest, ledger, and empty published directory into a temporary repository-shaped directory. Run `promote`; assert it writes exactly the formal JSON files and promotion record, removes only the reviewed manifest/ledger, and returns deterministic JSON. Run `seal`; assert the record binds the supplied promotion SHA. No GitHub API mock is needed.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/content/reviewed-release.test.ts`

Expected: FAIL because the CLI is missing.

- [ ] **Step 3: Implement the CLI with path containment and fail-closed writes**

Require absolute repository root, relative allowlisted inputs under the matching `review-candidates/YYYY-MM-DD/`, existing regular JSON files, output paths under `src/content/published/` and `editorial-releases/`, and no symlinks. Write new files with exclusive creation; never overwrite an existing item or approval record.

- [ ] **Step 4: Run fixture dry-run twice**

First run must pass. A second run against the same output must fail with an explicit duplicate/overwrite error, proving idempotency does not silently replace an approved record.

- [ ] **Step 5: Commit**

```bash
git add scripts/stephen-reviewed-release-cli.ts scripts/fixtures/saas-608-* src/content/reviewed-release.test.ts scripts/node-runtime.d.ts
git commit -m "feat(saas-608): add reviewed promotion CLI"
```

### Task 4: Implement owner dispatch, exact-head CI, and automatic merge

**Files:**
- Create: `.github/workflows/approve-reviewed-content.yml`
- Modify: `scripts/stephen-reviewed-release.ts`
- Modify: `src/content/reviewed-release.test.ts`
- Modify: `scripts/public-repo-audit.ts`
- Modify: `src/content/public-repo-audit.test.ts`

**Interfaces:**
- Consumes workflow inputs: `pr_number`, `candidate_sha`, `confirmation`.
- Produces two commits on the same daily branch and a `stephen-reviewed-release` check run on the seal SHA.
- Produces an exact-SHA merge via `PUT /repos/{repo}/pulls/{number}/merge` with `sha=<sealSha>` and `merge_method=merge`.
- Produces `repository_dispatch` event type `stephen_release_approved` only after merge success.

- [ ] **Step 1: Write failing request-policy tests**

Model the GitHub PR/API response as literal data and assert the approval request rejects wrong actor, triggering actor, repository, base, head prefix, cross-repository PR, non-Draft state, stale SHA, unexpected changed path/mode, empty candidates, and unresolved manual records.

- [ ] **Step 2: Verify RED and implement policy**

Run: `npm test -- src/content/reviewed-release.test.ts`

Implement the pure request evaluator and rerun until PASS.

- [ ] **Step 3: Add the trusted workflow**

The workflow must:

1. run only by `workflow_dispatch` on the default branch;
2. use `contents: write`, `pull-requests: write`, `checks: write`, and no other write permission;
3. pin every external Action to a full commit SHA;
4. validate both actors and confirmation phrase `APPROVE <candidate_sha>`;
5. fetch PR data and changed-file metadata before checkout;
6. check out trusted default-branch scripts separately from the daily branch;
7. create promotion and seal commits with explicit parents;
8. check out the seal tree, run `npm ci`, `npm run check`, and exact-SHA artifact verification;
9. create the successful check run on the seal SHA only after all commands pass;
10. merge with exact seal SHA; and
11. dispatch the Release event with PR, seal, promotion, and merge SHAs.

- [ ] **Step 4: Extend the public audit**

Reject any reviewed-release workflow containing `deployment`, `environment`, `ssh`, production host material, `pull_request_target`, unpinned Action references, mutable source checkout, or permissions beyond the explicit allowlist.

- [ ] **Step 5: Run focused tests**

Run: `npm test -- src/content/reviewed-release.test.ts src/content/public-repo-audit.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/approve-reviewed-content.yml scripts/stephen-reviewed-release.ts scripts/public-repo-audit.ts src/content/reviewed-release.test.ts src/content/public-repo-audit.test.ts
git commit -m "feat(saas-608): approve and merge exact reviewed SHA"
```

### Task 5: Publish a native immutable GitHub Release without deployment

**Files:**
- Create: `.github/workflows/publish-reviewed-release.yml`
- Modify: `scripts/stephen-reviewed-release.ts`
- Modify: `src/content/reviewed-release.test.ts`
- Modify: `scripts/public-repo-audit.ts`
- Modify: `src/content/public-repo-audit.test.ts`

**Interfaces:**
- Consumes `repository_dispatch` payload with PR, candidate, promotion, seal, and merge SHAs.
- Produces Draft Release, `stephen-site-<sealSha12>.tar.gz`, `.stephen-release.json`, and final immutable published Release.

- [ ] **Step 1: Write failing release-policy tests**

Assert release preparation rejects an unmerged PR, mismatched merge/seal SHA, missing successful reviewed-release check, broken commit chain, disabled release immutability, existing tag at another commit, mutable existing release, changed asset digest, or any production/deployment field.

- [ ] **Step 2: Verify RED and implement release policy**

Run: `npm test -- src/content/reviewed-release.test.ts`

Implement pure validation and deterministic tag/asset naming, then rerun to PASS.

- [ ] **Step 3: Add the Release workflow**

Use only `contents: write` plus `checks: read` (required to independently verify the exact-seal check). Check out trusted default-branch verification code first, validate the repository API reports `immutable-releases.enabled == true`, then fetch and verify the exact seal chain. Build the seal tree, generate `.stephen-release.json`, create a deterministic tarball, create/reuse only a matching Draft Release, upload all assets, publish it, and require the final REST response to report `immutable: true` and target the seal SHA.

- [ ] **Step 4: Verify no deployment surface**

The workflow must contain no `deployment`, `environment`, server target, SSH identity, Nginx, DNS, traffic switch, or production credential. The only externally visible mutation is Git merge plus GitHub tag/Release creation.

- [ ] **Step 5: Run focused tests and audit**

Run: `npm test -- src/content/reviewed-release.test.ts src/content/public-repo-audit.test.ts && npm run audit:public`

Expected: PASS with zero findings.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/publish-reviewed-release.yml scripts/stephen-reviewed-release.ts scripts/public-repo-audit.ts src/content/reviewed-release.test.ts src/content/public-repo-audit.test.ts
git commit -m "feat(saas-608): publish immutable reviewed releases"
```

### Task 6: Document, verify, and deliver the stacked PR

**Files:**
- Create: `docs/reviewed-release-runbook.md`
- Modify: `docs/daily-editorial-runbook.md`
- Modify: `README.md`
- Modify: `docs/public-disclosure-audit.md`
- Modify: `.github/pull_request_template.md`

**Interfaces:**
- Documents the exact owner command inputs and recovery behavior.
- Records that production deployment remains a separate private approval boundary.

- [ ] **Step 1: Write the operator runbook**

Document candidate enrichment, exact SHA copying, typed confirmation, two-commit chain, CI failure behavior, head-drift behavior, merge result, immutable Release verification, retry/idempotency, withdrawal via a new forward Release, and the explicit absence of production deployment.

- [ ] **Step 2: Run plan self-review**

Check every requirement against its task, scan for unresolved placeholders or mismatched interface names, and correct any hit before the full gate.

- [ ] **Step 3: Run full local gate**

Run: `npm run check`

Expected: all TypeScript checks, all tests, Vite build, exact public audit, and zero findings pass.

- [ ] **Step 4: Run fixture promotion and release-policy dry-run**

Use a temporary repository-shaped directory. Verify promotion, seal, chain, site build, artifact metadata, deterministic tag, and release payload. Do not call the GitHub merge or Release mutation endpoints during the local dry-run.

- [ ] **Step 5: Scan scope and public disclosure**

Run `git diff --check`, the public audit, and the public-repository credential/PII scanner. Manually classify any public filing-number or published-contact false positives; no HIGH finding may remain.

- [ ] **Step 6: Commit and push**

```bash
git add README.md .github/pull_request_template.md docs
git commit -m "docs(saas-608): document reviewed release loop"
git push -u origin codex/stephen-reviewed-release-loop
```

- [ ] **Step 7: Create a stacked Draft PR**

Create the PR with base `codex/bootstrap-extraction`, explicitly state that it must be retargeted to `main` only after Draft PR #1 is authorized and merged, and keep it Draft. Report exact head SHA and CI links.

- [ ] **Step 8: External activation gate**

After separate authorization to merge the infrastructure PRs, enable repository Release immutability through `PATCH /repos/ZiZ-LG/stephen-knowledge-hub/immutable-releases` with `enabled=true`; verify the setting by GET. Do not create a production Environment or deployment secret. Run one fixture candidate journey, then one owner-approved real candidate journey, and verify the final Release says `immutable: true` while Deployments remains empty.
