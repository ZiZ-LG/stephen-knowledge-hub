# SAAS-608 Release Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the already-approved SAAS-608 immutable Release by replacing the unavailable custom-check dependency with durable approval-run evidence and a tightly bounded owner-only recovery dispatch.

**Architecture:** The Release workflow normalizes automatic `workflow_run` and manual recovery inputs into one exact approval run ID/attempt, verifies that run and its private handoff artifact, rebuilds the exact seal, and validates the trusted approval-step order before any Release mutation. Ordinary repository reads continue to use the least-privilege `GITHUB_TOKEN`; repository governance reads use a step-local `STEPHEN_RELEASE_GOVERNANCE_TOKEN` that must be scoped only to `ZiZ-LG/stephen-knowledge-hub` with `Administration: read`.

**Tech Stack:** GitHub Actions, TypeScript 5.6, Node.js 22, Vitest, GitHub REST API, `gh`, `jq`.

## Global Constraints

- Work only in `ZiZ-LG/stephen-knowledge-hub`; do not modify the private production repository.
- Do not deploy, switch traffic, modify DNS/Nginx, or enable the daily schedule.
- Keep `STEPHEN_RELEASE_GOVERNANCE_TOKEN` out of source, logs, artifacts, build steps, and Release mutation steps.
- The governance token must be a fine-grained repository token limited to `ZiZ-LG/stephen-knowledge-hub` with only `Administration: read`.
- Recovery must be owner-only, run from the default branch, and bind exact `approval_run_id` plus `approval_run_attempt`.
- Release mutation remains fail-closed behind immutable-release, single-writer, no-bypass tag-ruleset, merged-PR, artifact, approval-step, commit-chain, asset, and exact-seal rebuild checks.
- Preserve merge commits; do not force-push.

---

### Task 1: Replace the transient check policy with durable approval evidence

**Files:**
- Modify: `src/content/reviewed-release.test.ts:582-836`
- Modify: `scripts/stephen-reviewed-release.ts:536-776`

**Interfaces:**
- Consumes: `ReviewedReleaseHandoffPayload`, `ReviewedApprovalWorkflowRun`, `evaluateReviewedReleaseRequest()`.
- Produces: `ReviewedApprovalHandoffArtifact`, `ReviewedApprovalJob`, `ReviewedExactSealRebuild`, and a release request that no longer accepts `checkRuns`.

- [x] **Step 1: Write failing policy tests**

Add a valid artifact, trusted approval job, and exact-seal rebuild to `releaseInput()`:

```ts
approvalArtifact: {
  id: 7654,
  name: 'stephen-reviewed-release-handoff-9876-1',
  expired: false,
  digest: `sha256:${'e'.repeat(64)}`,
  workflowRunId: 9876,
},
approvalJob: {
  name: 'approve',
  status: 'completed',
  conclusion: 'success',
  steps: [
    { number: 8, name: 'Run the complete exact-seal CI gate', status: 'completed', conclusion: 'success' },
    { number: 9, name: 'Verify the seal chain before merge', status: 'completed', conclusion: 'success' },
    { number: 10, name: 'Build the durable reviewed-release handoff', status: 'completed', conclusion: 'success' },
    { number: 11, name: 'Persist the immutable reviewed-release handoff', status: 'completed', conclusion: 'success' },
    { number: 12, name: 'Make the reviewed PR ready and merge its exact seal SHA', status: 'completed', conclusion: 'success' },
  ],
},
exactSealRebuild: { sealSha: SEAL_SHA, verified: true },
```

Add rejection tests for a wrong artifact name/run, expired or malformed-digest artifact, missing/out-of-order/failed trusted step, and a false or wrong-SHA exact-seal rebuild. Remove assertions that require a custom check run.

- [x] **Step 2: Run the focused test and confirm failure**

Run: `npm test -- src/content/reviewed-release.test.ts`

Expected: FAIL because the new durable-evidence fields are not yet accepted and `checkRuns` is still required.

- [x] **Step 3: Implement the durable evidence types and validation**

Replace `ReviewedReleaseCheckRun` and `checkRuns` with:

```ts
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
```

Require the artifact name `stephen-reviewed-release-handoff-<run-id>-<attempt>`, positive ID, matching workflow run, `expired === false`, and a lowercase `sha256:<64 hex>` digest. Require the five trusted steps above to be completed successfully and strictly increasing by step number. Require `exactSealRebuild.verified === true` and its SHA to equal the payload seal SHA. Require the approval run itself to be a completed successful owner dispatch on the trusted approval workflow.

- [x] **Step 4: Run the focused test and confirm success**

Run: `npm test -- src/content/reviewed-release.test.ts`

Expected: PASS.

- [x] **Step 5: Commit the policy slice**

```bash
git add scripts/stephen-reviewed-release.ts src/content/reviewed-release.test.ts
git commit -m "fix: bind releases to durable approval evidence"
```

### Task 2: Add the owner-only exact-run recovery workflow path

**Files:**
- Modify: `.github/workflows/publish-reviewed-release.yml:1-497`
- Modify: `.github/workflows/approve-reviewed-content.yml:19-349`
- Modify: `scripts/public-repo-audit.ts:105-180,300-328`
- Test: `src/content/public-repo-audit.test.ts`

**Interfaces:**
- Consumes: the Task 1 release request fields and approval artifact name convention.
- Produces: normalized `source` outputs (`run_id`, `run_attempt`, `approval_control_sha`, `release_control_sha`, `artifact_name`) shared by automatic and recovery paths.

- [x] **Step 1: Write failing workflow-contract tests**

Assert that the Release workflow:

```ts
expect(releaseWorkflow).toContain('workflow_dispatch:');
expect(releaseWorkflow).toContain('approval_run_id:');
expect(releaseWorkflow).toContain('approval_run_attempt:');
expect(releaseWorkflow).toContain('pull-requests: read');
expect(releaseWorkflow).toContain('secrets.STEPHEN_RELEASE_GOVERNANCE_TOKEN');
expect(releaseWorkflow).not.toContain('commits/$SEAL_SHA/check-runs');
```

Assert that the approval workflow no longer grants `checks: write` or creates `check-runs`.

- [x] **Step 2: Run the audit tests and confirm failure**

Run: `npm test -- src/content/public-repo-audit.test.ts`

Expected: FAIL against the old workflow contract.

- [x] **Step 3: Normalize and authenticate automatic versus recovery events**

Add required string inputs `approval_run_id` and `approval_run_attempt`. Add a first `source` step that:

```bash
[[ "$ACTOR" == "$REPOSITORY_OWNER" ]]
[[ "$TRIGGERING_ACTOR" == "$REPOSITORY_OWNER" ]]
[[ "$CURRENT_REF" == "$DEFAULT_BRANCH" ]]
[[ "$APPROVAL_RUN_ID" =~ ^[1-9][0-9]*$ ]]
[[ "$APPROVAL_RUN_ATTEMPT" =~ ^[1-9][0-9]*$ ]]
```

For automatic runs, take the ID and attempt from `github.event.workflow_run`; for recovery, take them from the two inputs. Read the exact run-attempt API and require repository identity, workflow path, `workflow_dispatch`, completed/success, default-branch head branch, and owner actor plus triggering actor. Emit only normalized identities and the expected artifact name.

Use `approval_control_sha` only to bind the original handoff to the original approval run. Check out and execute the repaired Release policy from `release_control_sha == github.sha`, the trusted default-branch SHA that contains the current recovery workflow.

- [x] **Step 4: Bind the exact private artifact and approval job**

List artifacts for the normalized run ID, select exactly one matching normalized artifact name, require it to be unexpired with digest and matching workflow-run identity, then download it by exact run ID/name. Read jobs for the exact attempt and select exactly one `approve` job. Feed the artifact and ordered job steps into `validate-release`.

- [x] **Step 5: Isolate governance reads from builds and mutations**

Set top-level permissions to:

```yaml
permissions:
  contents: write
  actions: read
  pull-requests: read
```

Use `GITHUB_TOKEN` for PR, actions, tag, Release, content and mutation calls. Use `GOVERNANCE_TOKEN: ${{ secrets.STEPHEN_RELEASE_GOVERNANCE_TOKEN }}` only on read-only steps that fetch immutable Release status, collaborators, and repository rulesets; fail immediately when it is absent. Re-fetch all three governance facts immediately before final publication, then validate again before the mutation step.

- [x] **Step 6: Remove the custom check producer**

Remove `checks: write` and `Record the successful exact-seal check` from the approval workflow. Preserve the exact-seal CI, chain verification, handoff upload, and merge step order.

- [x] **Step 7: Update the exact workflow audit boundary**

Permit only `${{ secrets.STEPHEN_RELEASE_GOVERNANCE_TOKEN }}` in the Release workflow, reject it everywhere else, update the exact permission sets, and require recovery inputs, owner/default-branch binding, exact run-attempt/jobs/artifact APIs, exact-seal rebuild, governance preflight/recheck, and absence of custom checks.

- [x] **Step 8: Run focused and full workflow/audit tests**

Run: `npm test -- src/content/public-repo-audit.test.ts src/content/reviewed-release.test.ts`

Expected: PASS.

- [x] **Step 9: Commit the workflow slice**

```bash
git add .github/workflows/approve-reviewed-content.yml .github/workflows/publish-reviewed-release.yml scripts/public-repo-audit.ts src/content/public-repo-audit.test.ts
git commit -m "fix: add bounded reviewed release recovery"
```

### Task 3: Tighten the public audit and document the operational boundary

**Files:**
- Modify: `src/content/public-repo-audit.test.ts`
- Modify: `docs/reviewed-release-runbook.md`
- Modify: `docs/daily-editorial-runbook.md`
- Modify: `docs/superpowers/plans/2026-08-27-stephen-reviewed-release-loop.md`

**Interfaces:**
- Consumes: the exact workflow permission and secret placement contracts from Task 2.
- Produces: an audit that permits only the named governance secret on the Release workflow and rejects any other reviewed-workflow secret surface.

- [x] **Step 1: Add failing audit boundary tests**

Add cases proving that the approved Release workflow passes, while replacing the secret name with `OTHER_TOKEN`, adding the governance secret to the approval workflow, restoring checks permission, removing `pull-requests: read`, or removing the owner/default-branch guard fails with `reviewed-workflow-boundary`, `reviewed-workflow-permissions`, or `reviewed-workflow-contract`.

- [x] **Step 2: Run the audit test and confirm failure**

Run: `npm test -- src/content/public-repo-audit.test.ts`

Expected: FAIL until the allowlist and contracts are updated.

- [x] **Step 3: Extend adversarial audit coverage**

Add mutation tests proving that changing the allowed secret name, moving it into a build or mutation step, removing the owner/default-branch guard, or restoring the custom check dependency is rejected by the audit implemented in Task 2.

- [x] **Step 4: Update the runbooks and architecture record**

Document the token creation boundary, exact repository and permission, secret name, recovery inputs, original run/attempt source, artifact retention requirement, failure behavior, redaction rule, and proof that recovery never deploys. Mark the old custom check as retired and record the trusted approval-step sequence plus exact-seal rebuild as the replacement.

- [x] **Step 5: Run the public audit and full repository check**

Run: `npm run audit:public`

Expected: JSON with `"status": "pass"`.

Run: `npm run check`

Expected: typecheck, all Vitest tests, Vite build, and public audit pass.

- [x] **Step 6: Commit the audit and documentation slice**

```bash
git add scripts/public-repo-audit.ts src/content/public-repo-audit.test.ts docs/reviewed-release-runbook.md docs/daily-editorial-runbook.md docs/superpowers/plans/2026-08-27-stephen-reviewed-release-loop.md docs/superpowers/plans/2026-08-27-saas-608-release-recovery.md
git commit -m "docs: close reviewed release recovery controls"
```

### Task 4: Review, merge, and recover the immutable Release

**Files:**
- Review only: complete branch diff against `origin/main`.

**Interfaces:**
- Consumes: all prior commits plus repository secret `STEPHEN_RELEASE_GOVERNANCE_TOKEN`.
- Produces: one merged repair PR, green exact-main CI, and immutable Release `stephen-content-2026-08-27-d24d2128bc5b`.

- [ ] **Step 1: Run fresh final local verification**

Run: `npm run check`

Expected: all checks pass on a clean worktree.

- [ ] **Step 2: Audit scope and secrets**

Run: `git diff --check origin/main...HEAD`

Run: `git diff --stat origin/main...HEAD`

Run: `git status --short`

Expected: only SAAS-608 workflow, policy, tests, audit, runbook, and plan files; no secret value and no unrelated content or production files.

- [ ] **Step 3: Push and create the repair PR**

Push `codex/saas-608-release-recovery`, create a PR to `main`, and include the incident evidence, permission split, artifact/step/rebuild proof model, no-deployment boundary, exact test commands, and the required secret prerequisite.

- [ ] **Step 4: Wait for review and PR CI**

Require all checks green and no unresolved blocking review. Re-run local verification for any repair commit.

- [ ] **Step 5: Merge with a merge commit and verify exact main SHA**

Merge the PR using merge commit. Resolve the resulting `main` SHA and wait for every workflow attached to that exact SHA to succeed.

- [ ] **Step 6: Confirm the governance secret name exists without reading its value**

Run: `gh secret list --repo ZiZ-LG/stephen-knowledge-hub`

Expected: `STEPHEN_RELEASE_GOVERNANCE_TOKEN` is listed. If absent, stop before dispatch and ask the owner to create the repository-scoped fine-grained token and repository secret.

- [ ] **Step 7: Dispatch the bounded recovery**

Run from `main` with:

```text
approval_run_id=33095856066
approval_run_attempt=1
```

Wait for the recovery workflow to complete successfully.

- [ ] **Step 8: Verify the final immutable Release and boundaries**

Require tag `stephen-content-2026-08-27-d24d2128bc5b` to point to `d24d2128bc5b996f3064eedef26125f8c0303268`; require immutable API state `true`; require exactly `.stephen-release.json` and `stephen-site-d24d2128bc5b.tar.gz` with matching digests; require no deployment records; require `STEPHEN_DAILY_SCHEDULE_ENABLED` to remain absent.
