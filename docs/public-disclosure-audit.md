# Public disclosure audit

Date: 2026-08-26
Status: public repository created; bootstrap Draft PR under review; schedule disabled

## Intended public scope

- React/Vite website source under `src/`;
- approved public knowledge collection and original analysis;
- bounded RSS/editorial candidate tooling under `scripts/`;
- public static assets under `public/`;
- read-only build CI and a schedule-gated Draft PR workflow;
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
- The daily workflow has only the repository write permissions required to maintain its same-day branch and Draft PR; it has no pull-request execution trigger.
- Scheduled candidate creation remains disabled unless the repository owner later sets `STEPHEN_DAILY_SCHEDULE_ENABLED` to `1`.
- A Draft PR in a public repository is publicly visible. `not_published` means “not published on the website,” not “private.”
- AI may draft candidate copy but cannot approve content, change the review state, or publish an item.

## Automated audit evidence

The deterministic audit examines tracked and untracked non-ignored files. It rejects generic local workspace paths, sensitive file names, high-confidence secret patterns, missing vendored-component attribution, unsupported Node metadata, symbolic links, mutable Action references, self-hosted public runners, unsafe workflow triggers, and candidate files outside the same-date review branch. Project-specific private identifiers are checked before extraction by the private source boundary rather than copied into this public audit implementation.

Latest pre-push run:

```json
{
  "status": "pass",
  "branchName": "codex/bootstrap-extraction",
  "scannedFiles": 88,
  "scannedBytes": 848827,
  "workflowFiles": 2,
  "findings": []
}
```

## Human checks required before accepting the bootstrap PR

1. Confirm the repository remains under `ZiZ-LG` with public visibility and the name `stephen-knowledge-hub`.
2. Confirm the corporate copyright holder shown in `NOTICE` and both license notices.
3. Confirm the public-security filing emblem remains appropriate for the live filing link.
4. Confirm CODEOWNERS resolves to a user or team with write access after the GitHub repository exists.
5. Enable GitHub private vulnerability reporting before inviting external contributors.
6. Keep the daily schedule variable unset during the bootstrap PR unless a separate enablement is approved.

This audit is a technical disclosure and provenance check. It does not replace a rights-holder decision for third-party material or jurisdiction-specific legal advice.
