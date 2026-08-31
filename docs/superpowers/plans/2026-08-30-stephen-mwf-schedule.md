# Stephen Monday-Wednesday-Friday Candidate Schedule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change and safely enable the daily-candidate workflow so it runs at Beijing 07:30 and 16:30 on Monday, Wednesday, and Friday only.

**Architecture:** Keep the existing schedule-gated Draft-PR workflow and human approval architecture unchanged. Update only the two UTC cron expressions and the deterministic contract that validates them, prove the real workflow through Vitest, document the gated operating state, then activate the existing repository variable only after the PR and exact-main CI gates pass.

**Tech Stack:** GitHub Actions YAML, TypeScript, Vitest, Node.js 22+, GitHub CLI.

## Global Constraints

- Beijing 07:30 uses `30 23 * * 0,2,4`; Beijing 16:30 uses `30 8 * * 1,3,5`.
- Runs follow the natural Monday-Wednesday-Friday week; no Chinese holiday or adjusted-workday calendar is introduced.
- Preserve `workflow_dispatch` and the fail-closed `vars.STEPHEN_DAILY_SCHEDULE_ENABLED == '1'` gate.
- Preserve same-Beijing-day reuse of one `codex/stephen-daily-YYYY-MM-DD` branch and one Draft PR.
- AI may draft candidates only; it cannot decide review, approval, publication, Release, or deployment state.
- Do not modify Release, production deployment, DNS, Nginx, CRM, permissions, Secrets, or unrelated repository capabilities.
- Do not dispatch the candidate workflow or create a real candidate PR as part of acceptance.
- Set `STEPHEN_DAILY_SCHEDULE_ENABLED=1` only after the PR is merged and every workflow for the exact new `main` SHA succeeds.

---

### Task 1: Prove and implement the Monday-Wednesday-Friday schedule contract

**Files:**
- Modify: `src/content/daily-review.test.ts`
- Modify: `scripts/stephen-daily-review.ts`
- Modify: `.github/workflows/daily-candidate-review.yml`

**Interfaces:**
- Consumes: `validateDailyIntakeWorkflow(workflow: string)` and the real workflow YAML.
- Produces: validated schedules `['30 23 * * 0,2,4', '30 8 * * 1,3,5']` while all existing safety invariants remain enforced.

- [x] **Step 1: Add the failing real-workflow assertion**

Extend the existing public-workflow boundary test to pass the checked-in YAML through `validateDailyIntakeWorkflow` and assert the literal two-entry MWF schedule. Keep the existing assertions for the variable gate, Draft-only PR behavior, and public visibility.

- [x] **Step 2: Run the focused test and observe RED**

Run:

```bash
npx vitest run src/content/daily-review.test.ts
```

Expected: failure because the checked-in workflow and validator still accept the old every-day cron expressions.

- [x] **Step 3: Apply the minimal schedule implementation**

Change the workflow cron values to:

```yaml
- cron: '30 23 * * 0,2,4'
- cron: '30 8 * * 1,3,5'
```

Update `expectedSchedules`, the valid workflow fixture, the expected validator result, and the wrong-schedule mutation test to use the same two hand-checked literals. Do not change workflow triggers, permissions, job gate, branch naming, PR commands, AI fields, or concurrency.

- [x] **Step 4: Run the focused test and observe GREEN**

Run the same Vitest command and require the complete daily-review test file to pass, including schedule, same-day reuse, Draft-only, human-review, and fail-closed tests.

### Task 2: Synchronize operating documentation and public audit evidence

**Files:**
- Modify: `docs/daily-editorial-runbook.md`
- Modify: `docs/public-disclosure-audit.md`
- Create: `docs/superpowers/plans/2026-08-30-stephen-mwf-schedule.md`

**Interfaces:**
- Consumes: the merged workflow schedule and unchanged approval boundaries.
- Produces: an audit-ready description of the schedule-gated MWF operating state and deterministic pre-push evidence.

- [x] **Step 1: Update the daily runbook**

Document both UTC expressions, their Beijing times, the Monday-Wednesday-Friday mapping, the absence of a holiday/adjusted-workday calendar, and the post-CI activation gate. Use a durable `SCHEDULE_GATED_MWF` status rather than a transient claim that the variable is already set while the PR is still open.

- [x] **Step 2: Update public disclosure and activation checks**

Replace stale “schedule disabled” wording with the gated MWF state. State that value `1` permits only the existing candidate Draft-PR job and does not approve, publish, Release, or deploy content. Replace the old instruction to keep the variable unset with the exact post-merge activation sequence.

- [x] **Step 3: Refresh deterministic public-audit evidence**

Run `npm run audit:public`, copy its exact branch/file/byte/workflow/finding values into `docs/public-disclosure-audit.md`, then rerun until the recorded byte count is stable.

### Task 3: Verify, commit, push, review, and merge

**Files:**
- Review only: complete diff against `origin/main`.

**Interfaces:**
- Consumes: Tasks 1-2.
- Produces: one scoped commit, one PR to `main`, one merge commit, and green CI for the exact new `main` SHA.

- [x] **Step 1: Run complete local verification**

Run `npm run check`, `git diff --check`, `git status --short`, and `git diff --name-only origin/main...HEAD`. Require only the workflow, schedule contract/test, runbook, public audit, and this plan to differ.

- [x] **Step 2: Create the independent commit**

Stage only approved files and commit with `git commit -m "feat: run candidate review Monday Wednesday Friday"`.

- [ ] **Step 3: Push and open the PR**

Push `codex/stephen-mwf-schedule` without force and create a non-Draft PR to `main`. List both cron expressions, TDD evidence, unchanged workflow gate and Draft-only boundary, and the no-deployment/no-real-candidate acceptance boundary.

- [ ] **Step 4: Review and merge**

Verify the GitHub-side file list, comments, review threads, permissions diff, and all PR checks. If all are green and unblocked, merge with a merge commit. Resolve the exact `main` SHA and wait until every workflow attached to it succeeds.

### Task 4: Activate the existing gate and prove zero immediate side effects

**Files:**
- No repository files change.

**Interfaces:**
- Consumes: the exact merged `main` SHA and green CI.
- Produces: repository variable `STEPHEN_DAILY_SCHEDULE_ENABLED` with string value `1`, plus read-only acceptance evidence.

- [ ] **Step 1: Capture pre-activation external state**

Record the exact `main` SHA, daily-workflow run IDs, open `codex/stephen-daily-*` PR identities, Release IDs, and deployment count. Do not dispatch any workflow.

- [ ] **Step 2: Set the repository variable**

Only after Task 3 succeeds, run `gh variable set STEPHEN_DAILY_SCHEDULE_ENABLED --repo ZiZ-LG/stephen-knowledge-hub --body '1'`.

- [ ] **Step 3: Verify the variable and trusted workflow from `main`**

Require the API to return exact name/value `STEPHEN_DAILY_SCHEDULE_ENABLED=1`. Read the workflow from the exact merged `main` SHA and pass it through `validateDailyIntakeWorkflow`; require the two MWF crons, `workflow_dispatch`, the schedule gate, same-day reuse, `gh pr create --draft`, and no tag/Release/deployment mutation path.

- [ ] **Step 4: Verify no immediate side effects**

Compare post-activation state with Step 1. Require no newly dispatched daily workflow, no new or changed candidate PR, no new Release, no deployment, and no `main` mutation caused by setting the variable. Do not wait for or simulate the next real scheduled collection.
