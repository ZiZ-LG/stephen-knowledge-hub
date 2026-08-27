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

function file(path: string, text = 'safe public text'): PublicAuditEntry {
  return { path, type: 'file', bytes: encoder.encode(text) };
}

function findings(entries: readonly PublicAuditEntry[], branchName = 'codex/bootstrap-extraction') {
  return auditPublicEntries(entries, {
    branchName,
    requireGovernance: false,
  }).findings;
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

  it('accepts the trusted exact-SHA approval workflow with its bounded write permissions', async () => {
    const workflow = await readFile(approvalWorkflowPath, 'utf8');
    expect(findings([
      file('.github/workflows/approve-reviewed-content.yml', workflow),
    ])).toEqual([]);
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
});
