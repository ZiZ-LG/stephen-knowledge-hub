# Public disclosure audit

Date: 2026-08-27
Status: public `main` baseline established; SAAS-608 exact-SHA release gate under final landing; schedule disabled

## Intended public scope

- React/Vite website source under `src/`;
- approved public knowledge collection and original analysis;
- bounded RSS/editorial candidate tooling under `scripts/`;
- public static assets under `public/`;
- read-only build CI, a schedule-gated Draft PR workflow, exact-SHA owner approval, and native immutable GitHub Release workflows;
- editorial, source, contribution, security, license, and attribution documents.

## Deliberately excluded scope

- CRM, backend, database, tenant, authentication, or customer data code;
- production activation, rollback, server, shared-host, DNS, Nginx, SSH, or credential material;
- private release Skills and operator runbooks;
- unpublished seed-review packages and historical internal review reports;
- private monorepo Git history.

## License and asset decisions

- Code authored for this project is offered under Apache-2.0.
- Original project knowledge content and documentation are offered under CC BY 4.0.
- External publishers retain rights in linked articles, titles, announcements, papers, images, and marks.
- RSS/XML fixtures contain bounded third-party metadata for tests and are excluded from the project license grants.
- `public/beian-police.png` is used only with the required filing link and is excluded from the project license grants.
- The fieldbook embeds an `@chenglou/pretext` browser bundle under the MIT License recorded in `THIRD_PARTY_NOTICES.md`; package-managed dependency licenses remain controlling.

## Workflow disclosure boundary

- Every external GitHub Action is pinned to a full 40-character commit SHA.
- Public CI has read-only repository permission.
- The daily workflow has only the repository write permissions required to maintain its same-day branch and Draft PR; it has no pull-request execution trigger. Daily candidate and owner-approval writes share `stephen-public-content-writer`; the Release consumer uses a stable approval-run-and-attempt-keyed group so a later daily run or another approval attempt cannot replace a pending durable handoff. Static contracts forbid daily/approval workflows from calling tag or Release mutation endpoints.
- The owner-approval workflow is manual-only, pins its trusted controls to the dispatch SHA, requires both actor identities to equal the repository owner, validates an open same-repository Draft PR and exact head/base SHAs, and uses the seal SHA as the merge API compare-and-swap guard.
- The Release workflow has only `contents: write`, `checks: read`, and `actions: read`; it consumes a private immutable handoff artifact from the completed approval `workflow_run`, verifies the originating workflow run and check provenance, requires a single-owner collaborator boundary, active no-bypass update/deletion protection for `stephen-content-*` tags, and native Immutable Releases, then publishes only after an immediate current-main, ruleset, Draft and asset-digest recheck. GitHub creates the protected tag when the Draft is published, so no mutable tag exists beforehand.
- Neither reviewed-release workflow contains a GitHub Environment, self-hosted runner, server identity, network route, or production credential.
- Scheduled candidate creation remains disabled unless the repository owner later sets `STEPHEN_DAILY_SCHEDULE_ENABLED` to `1`.
- A Draft PR in a public repository is publicly visible. `not_published` means “not published on the website,” not “private.”
- AI may draft candidate copy but cannot approve content, change the review state, or publish an item.

## Automated audit evidence

The deterministic audit examines tracked and untracked non-ignored files. It rejects generic local workspace paths, sensitive file names, high-confidence secret patterns, missing vendored-component attribution, unsupported Node metadata, symbolic links, mutable Action references, self-hosted public runners, unsafe workflow triggers, candidate files outside the same-date review branch, reviewed-release permission drift, missing exact-SHA controls, and any reviewed-release workflow that introduces environment/server/SSH/Nginx/DNS/traffic operations. Project-specific private identifiers are checked before extraction by the private source boundary rather than copied into this public audit implementation.

Latest pre-push run:

```json
{
  "status": "pass",
  "branchName": "codex/stephen-reviewed-release-loop",
  "scannedFiles": 99,
  "scannedBytes": 1037035,
  "workflowFiles": 4,
  "findings": []
}
```

## Human checks required before activating SAAS-608

1. Confirm the repository remains under `ZiZ-LG` with public visibility and the name `stephen-knowledge-hub`.
2. Confirm the corporate copyright holder shown in `NOTICE` and both license notices.
3. Confirm the public-security filing emblem remains appropriate for the live filing link.
4. Confirm CODEOWNERS resolves to a user or team with write access after the GitHub repository exists.
5. Enable GitHub private vulnerability reporting before inviting external contributors.
6. Keep the daily schedule variable unset unless a separate enablement is approved.
7. Merge SAAS-608 only after its exact head CI and post-merge `main` SHA CI both pass.
8. Enable native Immutable Releases only after the workflow code is present on `main`; verify the API reports `enabled: true` and do not add an Environment or server secret.
9. Create and verify the active no-bypass tag ruleset named `Protect Stephen immutable Release tags`, targeting only `refs/tags/stephen-content-*` with update and deletion restrictions.

This audit is a technical disclosure and provenance check. It does not replace a rights-holder decision for third-party material or jurisdiction-specific legal advice.
