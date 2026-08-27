/// <reference path="./node-runtime.d.ts" />

import { spawnSync } from 'node:child_process';
import { lstat, readFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

export interface PublicAuditEntry {
  readonly path: string;
  readonly type: 'file' | 'symlink' | 'other';
  readonly bytes: Uint8Array;
}

export interface PublicAuditFinding {
  readonly category: string;
  readonly path: string;
}

export interface PublicAuditContext {
  readonly branchName: string;
  readonly requireGovernance?: boolean;
}

export interface PublicAuditResult {
  readonly status: 'pass' | 'fail';
  readonly branchName: string;
  readonly scannedFiles: number;
  readonly scannedBytes: number;
  readonly workflowFiles: number;
  readonly findings: readonly PublicAuditFinding[];
}

const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const workflowPathPattern = /^\.github\/workflows\/[^/]+\.ya?ml$/;
const approvalWorkflowPath = '.github/workflows/approve-reviewed-content.yml';
const releaseWorkflowPath = '.github/workflows/publish-reviewed-release.yml';
const textPathPattern = /\.(?:css|html|js|json|md|svg|ts|tsx|txt|xml|ya?ml)$/;
const dailyBranchPattern = /^codex\/stephen-daily(-test)?-(\d{4}-\d{2}-\d{2})$/;

const requiredGovernanceFiles = [
  '.github/CODEOWNERS',
  'CONTRIBUTING.md',
  'LICENSE',
  'LICENSE-CONTENT.md',
  'NOTICE',
  'README.md',
  'SECURITY.md',
  'THIRD_PARTY_NOTICES.md',
  'TRADEMARKS.md',
] as const;

const localWorkspacePatterns = [
  /(?:^|[\s"'`(])\/(?:Users|home)\/[^/\s"'`]+\/[^\s"'`]+/,
  /(?:^|[\s"'`(])\/Volumes\/[^/\s"'`]+\/[^\s"'`]+/,
  /(?:^|[\s"'`(])[A-Za-z]:\\Users\\[^\\\s"'`]+\\[^\s"'`]+/,
] as const;

const secretPatterns = [
  new RegExp(['-----BEGIN', 'PRIVATE KEY-----'].join(' ')),
  new RegExp(`${'gh'}${'p_'}[A-Za-z0-9]{20,}`),
  new RegExp(`${'github_'}${'pat_'}[A-Za-z0-9_]{20,}`),
  /AKIA[0-9A-Z]{16}/,
] as const;

function safeText(bytes: Uint8Array) {
  if (bytes.byteLength > MAX_TEXT_BYTES || bytes.includes(0)) return undefined;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
}

function sensitivePath(path: string) {
  const name = basename(path);
  if (name === '.env' || (name.startsWith('.env.') && name !== '.env.example')) return true;
  return /\.(?:db|key|pem)$/i.test(name);
}

function candidateDate(branchName: string) {
  return dailyBranchPattern.exec(branchName)?.[2];
}

function topLevelWorkflowPermissions(text: string) {
  const permissions = new Map<string, string>();
  const lines = text.split('\n');
  const start = lines.findIndex((line) => /^permissions:\s*$/.test(line));
  if (start < 0) return permissions;
  for (const line of lines.slice(start + 1)) {
    const parsed = /^ {2}([a-z-]+):\s*(read|write|none)\s*$/.exec(line);
    if (!parsed) break;
    permissions.set(parsed[1], parsed[2]);
  }
  return permissions;
}

function exactPermissions(
  actual: ReadonlyMap<string, string>,
  expected: Readonly<Record<string, string>>,
) {
  const entries = Object.entries(expected);
  return actual.size === entries.length
    && entries.every(([name, access]) => actual.get(name) === access);
}

function reviewedWorkflowHasUnsafeSurface(text: string) {
  return [
    /^\s*environment\s*:/m,
    /\$\{\{\s*secrets\./,
    /\bpull_request_target\b/i,
    /\bself-hosted\b/i,
    /\bssh\b/i,
    /\bnginx\b/i,
    /\bdns\b/i,
    /\bdeployment\b/i,
    /\bproduction\b/i,
    /git\s+push[^\n]*(?:--force|-f\b)/,
    /git\s+reset\s+--hard/,
  ].some((pattern) => pattern.test(text));
}

function approvalWorkflowContract(text: string) {
  return [
    /^on:\s*\n\s{2}workflow_dispatch:/m,
    /github\.event\.repository\.default_branch/,
    /github\.triggering_actor/,
    /validate-request --request/,
    /stephen-reviewed-release-cli\.ts promote/,
    /stephen-reviewed-release-cli\.ts seal/,
    /stephen-reviewed-release-cli\.ts verify-chain/,
    /npm run check/,
    /stephen-release-cli\.ts verify/,
    /repos\/\$GH_REPO\/check-runs/,
    /name=stephen-reviewed-release/,
    /pulls\/\$PR_NUMBER\/merge/,
    /-f sha="\$SEAL_SHA"/,
    /-f merge_method=merge/,
    /stephen_release_approved/,
  ].every((pattern) => pattern.test(text));
}

function releaseWorkflowContract(text: string) {
  return [
    /^on:\s*\n\s{2}repository_dispatch:/m,
    /stephen_release_approved/,
    /repos\/\$GH_REPO\/immutable-releases/,
    /commits\/\$SEAL_SHA\/check-runs/,
    /ref:\s*\$\{\{ github\.event\.client_payload\.sealSha \}\}/,
    /validate-release --request/,
    /npm run check/,
    /stephen-release-cli\.ts verify/,
    /tar --sort=name --mtime='@0'/,
    /gzip -n -9/,
    /-F draft=true/,
    /uploads\.github\.com/,
    /-F draft=false/,
    /\.immutable == true/,
    /\.status == "already_immutable"/,
  ].every((pattern) => pattern.test(text));
}

function pushFinding(
  findings: PublicAuditFinding[],
  seen: Set<string>,
  category: string,
  path: string,
) {
  const key = `${category}\0${path}`;
  if (seen.has(key)) return;
  seen.add(key);
  findings.push({ category, path });
}

export function auditPublicEntries(
  entries: readonly PublicAuditEntry[],
  context: PublicAuditContext,
): PublicAuditResult {
  const findings: PublicAuditFinding[] = [];
  const findingKeys = new Set<string>();
  const entryByPath = new Map(entries.map((entry) => [entry.path, entry]));
  const branchCandidateDate = candidateDate(context.branchName);
  const candidateEntries = entries.filter((entry) => entry.path.startsWith('review-candidates/'));
  let scannedFiles = 0;
  let scannedBytes = 0;
  let workflowFiles = 0;

  if (context.requireGovernance) {
    for (const path of requiredGovernanceFiles) {
      if (!entryByPath.has(path)) {
        pushFinding(findings, findingKeys, 'missing-governance', path);
      }
    }
  }

  if (candidateEntries.length > 0) {
    if (!branchCandidateDate) {
      candidateEntries.forEach((entry) => {
        pushFinding(findings, findingKeys, 'candidate-branch', entry.path);
      });
    } else {
      const allowed = new Set([
        `review-candidates/${branchCandidateDate}/review-manifest.json`,
        `review-candidates/${branchCandidateDate}/discovery-ledger.json`,
      ]);
      candidateEntries.forEach((entry) => {
        if (!allowed.has(entry.path)) {
          pushFinding(findings, findingKeys, 'candidate-path', entry.path);
        }
      });
      allowed.forEach((path) => {
        if (!entryByPath.has(path)) {
          pushFinding(findings, findingKeys, 'candidate-set', path);
        }
      });
    }
  }

  for (const entry of [...entries].sort((left, right) => left.path.localeCompare(right.path))) {
    if (entry.type === 'symlink') {
      pushFinding(findings, findingKeys, 'symlink', entry.path);
      continue;
    }
    if (entry.type !== 'file') {
      pushFinding(findings, findingKeys, 'non-file', entry.path);
      continue;
    }

    scannedFiles += 1;
    scannedBytes += entry.bytes.byteLength;
    if (sensitivePath(entry.path)) {
      pushFinding(findings, findingKeys, 'sensitive-path', entry.path);
    }
    if (textPathPattern.test(entry.path) && entry.bytes.byteLength > MAX_TEXT_BYTES) {
      pushFinding(findings, findingKeys, 'oversized-text', entry.path);
      continue;
    }

    const text = safeText(entry.bytes);
    if (text === undefined) continue;
    if (localWorkspacePatterns.some((pattern) => pattern.test(text))) {
      pushFinding(findings, findingKeys, 'local-workspace-path', entry.path);
    }
    if (secretPatterns.some((pattern) => pattern.test(text))) {
      pushFinding(findings, findingKeys, 'secret-pattern', entry.path);
    }
    if (entry.path === 'package.json') {
      try {
        const packageMetadata = JSON.parse(text) as {
          readonly engines?: { readonly node?: unknown };
        };
        if (packageMetadata.engines?.node !== '>=22.12.0') {
          pushFinding(findings, findingKeys, 'unsupported-node-engine', entry.path);
        }
      } catch {
        pushFinding(findings, findingKeys, 'invalid-package-metadata', entry.path);
      }
    }

    if (workflowPathPattern.test(entry.path)) {
      workflowFiles += 1;
      for (const match of text.matchAll(/^\s*-?\s*uses:\s*([^\s#]+)/gm)) {
        const reference = match[1];
        if (!reference.startsWith('./') && !/@[0-9a-f]{40}$/.test(reference)) {
          pushFinding(findings, findingKeys, 'unpinned-action', entry.path);
        }
      }
      if (/^\s*pull_request_target\s*:/m.test(text)) {
        pushFinding(findings, findingKeys, 'unsafe-workflow-trigger', entry.path);
      }
      if (/runs-on:\s*(?:\[[^\]]*\bself-hosted\b[^\]]*\]|self-hosted)/i.test(text)) {
        pushFinding(findings, findingKeys, 'self-hosted-runner', entry.path);
      }
      if (entry.path === '.github/workflows/checks.yml'
        && (!/^permissions:\s*\n\s{2}contents:\s*read\s*$/m.test(text)
          || /^\s{2}[a-z-]+:\s*write\s*$/m.test(text)
          || /\$\{\{\s*secrets\./.test(text))) {
        pushFinding(findings, findingKeys, 'ci-write-boundary', entry.path);
      }
      if (entry.path === approvalWorkflowPath || entry.path === releaseWorkflowPath) {
        if (reviewedWorkflowHasUnsafeSurface(text)) {
          pushFinding(findings, findingKeys, 'reviewed-workflow-boundary', entry.path);
        }
      }
      if (entry.path === approvalWorkflowPath) {
        if (!exactPermissions(topLevelWorkflowPermissions(text), {
          contents: 'write',
          'pull-requests': 'write',
          checks: 'write',
        })) {
          pushFinding(findings, findingKeys, 'reviewed-workflow-permissions', entry.path);
        }
        if (!approvalWorkflowContract(text)) {
          pushFinding(findings, findingKeys, 'reviewed-workflow-contract', entry.path);
        }
      }
      if (entry.path === releaseWorkflowPath) {
        if (!exactPermissions(topLevelWorkflowPermissions(text), {
          contents: 'write',
          checks: 'read',
        })) {
          pushFinding(findings, findingKeys, 'reviewed-workflow-permissions', entry.path);
        }
        if (!releaseWorkflowContract(text)) {
          pushFinding(findings, findingKeys, 'reviewed-workflow-contract', entry.path);
        }
      }
    }
  }

  const fieldbookText = entryByPath.has('public/fieldbook/index.html')
    ? safeText(entryByPath.get('public/fieldbook/index.html')!.bytes)
    : undefined;
  const noticeText = entryByPath.has('THIRD_PARTY_NOTICES.md')
    ? safeText(entryByPath.get('THIRD_PARTY_NOTICES.md')!.bytes)
    : undefined;
  if (fieldbookText && /window\.Pretext\s*=/.test(fieldbookText)
    && (!noticeText
      || !noticeText.includes('@chenglou/pretext')
      || !noticeText.includes('MIT License')
      || !noticeText.includes('Pretext contributors'))) {
    pushFinding(
      findings,
      findingKeys,
      'missing-third-party-notice',
      'THIRD_PARTY_NOTICES.md',
    );
  }

  findings.sort((left, right) => (
    left.path.localeCompare(right.path) || left.category.localeCompare(right.category)
  ));
  return {
    status: findings.length === 0 ? 'pass' : 'fail',
    branchName: context.branchName,
    scannedFiles,
    scannedBytes,
    workflowFiles,
    findings,
  };
}

function runGit(root: string, args: readonly string[]) {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env },
  });
  if (result.status !== 0) {
    throw new Error(`git audit command failed: ${args[0] ?? 'unknown'}`);
  }
  return result.stdout;
}

export async function auditTrackedRepository(startDirectory = process.cwd()) {
  const root = runGit(startDirectory, ['rev-parse', '--show-toplevel']).trim();
  if (!root || resolve(root) !== root) throw new Error('repository root is invalid');
  const paths = runGit(root, [
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
    '-z',
  ]).split('\0').filter(Boolean);
  const entries: PublicAuditEntry[] = [];
  for (const path of paths) {
    const absolutePath = join(root, path);
    const details = await lstat(absolutePath);
    if (details.isSymbolicLink()) {
      entries.push({ path, type: 'symlink', bytes: new Uint8Array() });
    } else if (details.isFile()) {
      entries.push({ path, type: 'file', bytes: await readFile(absolutePath) });
    } else {
      entries.push({ path, type: 'other', bytes: new Uint8Array() });
    }
  }
  const branchName = process.env.GITHUB_HEAD_REF
    || runGit(root, ['branch', '--show-current']).trim()
    || 'detached';
  return auditPublicEntries(entries, { branchName, requireGovernance: true });
}

async function main() {
  const result = await auditTrackedRepository();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status !== 'pass') process.exitCode = 1;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const modulePath = resolve(decodeURIComponent(new URL(import.meta.url).pathname));
if (invokedPath === modulePath) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'unknown public audit error';
    process.stderr.write(`PUBLIC_AUDIT_ERROR=${message}\n`);
    process.exitCode = 1;
  });
}
