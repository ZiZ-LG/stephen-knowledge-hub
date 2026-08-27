/// <reference path="./node-runtime.d.ts" />

import { spawnSync } from 'node:child_process';
import { lstat, readFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { parse } from 'yaml';

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseWorkflowDocument(text: string) {
  try {
    const document = parse(text, { maxAliasCount: 100, merge: true }) as unknown;
    return isRecord(document) ? document : undefined;
  } catch {
    return undefined;
  }
}

function topLevelWorkflowPermissions(document: Readonly<Record<string, unknown>> | undefined) {
  const permissions = document?.permissions;
  return isRecord(permissions) ? permissions : undefined;
}

function exactPermissions(
  actual: Readonly<Record<string, unknown>> | undefined,
  expected: Readonly<Record<string, string>>,
) {
  if (!actual) return false;
  const entries = Object.entries(expected);
  return Object.keys(actual).length === entries.length
    && entries.every(([name, access]) => actual[name] === access);
}

function hasJobLevelPermissionOverride(
  document: Readonly<Record<string, unknown>> | undefined,
) {
  if (!document || !isRecord(document.jobs)) return true;
  return Object.values(document.jobs).some((job) => (
    !isRecord(job) || Object.prototype.hasOwnProperty.call(job, 'permissions')
  ));
}

const releaseGovernanceSecret = '${{ secrets.STEPHEN_RELEASE_GOVERNANCE_TOKEN }}';

function hasSecretsContextAccess(text: string) {
  return [...text.matchAll(/\$\{\{([\s\S]*?)\}\}/g)]
    .some((match) => /\bsecrets\b/.test(match[1] ?? ''));
}

interface WorkflowSecretReference {
  readonly path: readonly (string | number)[];
  readonly value: string;
}

function collectSecretsContextReferences(
  value: unknown,
  path: readonly (string | number)[] = [],
  ancestors = new Set<object>(),
): WorkflowSecretReference[] {
  if (typeof value === 'string') {
    return hasSecretsContextAccess(value) ? [{ path, value }] : [];
  }
  if (typeof value !== 'object' || value === null) return [];
  if (ancestors.has(value)) return [];

  ancestors.add(value);
  const entries: readonly (readonly [string | number, unknown])[] = Array.isArray(value)
    ? value.map((child, index) => [index, child] as const)
    : Object.entries(value);
  const matches = entries.flatMap(([key, child]) => (
    collectSecretsContextReferences(child, [...path, key], ancestors)
  ));
  ancestors.delete(value);
  return matches;
}

function governanceReadRun(prefix: '' | 'prepublish-') {
  const output = (name: string) => `$RUNNER_TEMP/saas-608-${prefix}${name}`;
  return [
    'set -euo pipefail',
    '[[ -n "$GH_TOKEN" ]]',
    'gh api --method GET "repos/$GH_REPO/immutable-releases" \\',
    `  > "${output('immutability.json')}"`,
    'gh api --paginate --slurp --method GET \\',
    '  "repos/$GH_REPO/collaborators?affiliation=all&per_page=100" \\',
    `  > "${output('collaborator-pages.json')}"`,
    "jq '[.[][] | select(.permissions.push == true) | { login }]' \\",
    `  "${output('collaborator-pages.json')}" \\`,
    `  > "${output('write-collaborators.json')}"`,
    'gh api --paginate --slurp --method GET \\',
    '  "repos/$GH_REPO/rulesets?includes_parents=true&per_page=100" \\',
    `  > "${output('ruleset-pages.json')}"`,
    "jq -r '[.[][] | select(.name == \"Protect Stephen immutable Release tags\") | .id]",
    '  | if length == 1 then .[0] else error("missing or duplicate Stephen tag ruleset") end\' \\',
    `  "${output('ruleset-pages.json')}" \\`,
    `  > "${output('tag-ruleset-id.txt')}"`,
    `tag_ruleset_id=$(cat "${output('tag-ruleset-id.txt')}")`,
    'gh api --method GET "repos/$GH_REPO/rulesets/$tag_ruleset_id" \\',
    `  > "${output('tag-ruleset.json')}"`,
    '',
  ].join('\n');
}

function equalWorkflowPath(
  left: readonly (string | number)[],
  right: readonly (string | number)[],
) {
  return left.length === right.length && left.every((part, index) => part === right[index]);
}

function equalSequence(left: readonly unknown[], right: readonly unknown[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function containsMappingKey(
  value: unknown,
  key: string,
  ancestors = new Set<object>(),
): boolean {
  if (typeof value !== 'object' || value === null) return false;
  if (ancestors.has(value)) return false;
  ancestors.add(value);
  if (!Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, key)) {
    ancestors.delete(value);
    return true;
  }
  const children = Array.isArray(value) ? value : Object.values(value);
  const found = children.some((child) => containsMappingKey(child, key, ancestors));
  ancestors.delete(value);
  return found;
}

function hasExactWorkflowJob(
  document: Readonly<Record<string, unknown>>,
  jobName: string,
) {
  return isRecord(document.jobs)
    && Object.keys(document.jobs).length === 1
    && Object.prototype.hasOwnProperty.call(document.jobs, jobName);
}

const approvalStepNames = [
  'Reject an untrusted dispatch identity',
  'Check out trusted default-branch controls',
  'Set up Node.js',
  'Read the current PR and changed-file facts',
  'Check out the exact candidate tree',
  'Validate the exact owner-review request',
  'Require the candidate to contain the current trusted base',
  'Promote only the retained reviewed candidates',
  'Seal the exact approval chain',
  'Push the two-commit chain without overwriting head drift',
  'Install exact-seal dependencies',
  'Run the complete exact-seal CI gate',
  'Verify the seal chain before merge',
  'Build the durable reviewed-release handoff',
  'Persist the immutable reviewed-release handoff',
  'Make the reviewed PR ready and merge its exact seal SHA',
] as const;

const releaseStepNames = [
  'Resolve and authenticate the exact source approval run',
  'Read the exact approval artifact and trusted job facts',
  'Download the durable approval-run handoff',
  'Validate the bounded workflow-run handoff',
  'Check out trusted Release controls',
  'Bind trusted Release controls to this workflow SHA',
  'Set up Node.js',
  'Read merged PR and repository Release facts',
  'Read fail-closed repository governance facts',
  'Check out the exact approval seal tree',
  'Build and bind the exact seal artifact',
  'Create deterministic Release assets',
  'Verify the exact Release request before mutation',
  'Create or reuse the matching Draft Release',
  'Upload only missing matching assets',
  'Refresh governance facts before immutable publication',
  'Verify fresh policy immediately before immutable publication',
  'Publish the complete Release',
  'Require final immutable API state and matching assets',
  'Summarize immutable Release completion',
] as const;

function reviewedWorkflowExecutionShapeIsExact(
  path: string,
  document: Readonly<Record<string, unknown>>,
) {
  const topLevelKeys = ['concurrency', 'jobs', 'name', 'on', 'permissions'];
  if (!equalSequence(Object.keys(document).sort(), topLevelKeys)) return false;
  const jobName = path === releaseWorkflowPath ? 'release' : 'approve';
  if (!hasExactWorkflowJob(document, jobName) || !isRecord(document.jobs)) return false;
  const job = document.jobs[jobName];
  if (!isRecord(job) || !Array.isArray(job.steps)) return false;
  const expectedJobKeys = path === releaseWorkflowPath
    ? ['if', 'runs-on', 'steps', 'timeout-minutes']
    : ['runs-on', 'steps', 'timeout-minutes'];
  if (!equalSequence(Object.keys(job).sort(), expectedJobKeys)
    || job['runs-on'] !== 'ubuntu-latest'
    || job['timeout-minutes'] !== 25) {
    return false;
  }
  if (path === releaseWorkflowPath
    && job.if !== [
      "github.event_name == 'workflow_dispatch' || (",
      "  github.event_name == 'workflow_run'",
      "  && github.event.workflow_run.event == 'workflow_dispatch'",
      "  && github.event.workflow_run.status == 'completed'",
      ')',
    ].join('\n')) {
    return false;
  }
  const expectedStepNames = path === releaseWorkflowPath ? releaseStepNames : approvalStepNames;
  const actualStepNames = job.steps.map((step) => (isRecord(step) ? step.name : undefined));
  return equalSequence(actualStepNames, expectedStepNames);
}

function releaseGovernanceStepsAreExact(
  document: Readonly<Record<string, unknown>>,
  secretReferences: readonly WorkflowSecretReference[],
) {
  if (!isRecord(document.jobs) || !isRecord(document.jobs.release)) return false;
  const steps = document.jobs.release.steps;
  if (!Array.isArray(steps)) return false;

  const expectedSteps = [
    {
      name: 'Read fail-closed repository governance facts',
      condition: undefined,
      prefix: '' as const,
    },
    {
      name: 'Refresh governance facts before immutable publication',
      condition: "steps.policy.outputs.status != 'already_immutable'",
      prefix: 'prepublish-' as const,
    },
  ];
  const allowedSecretPaths: (string | number)[][] = [];
  for (const expected of expectedSteps) {
    const matches = steps
      .map((step, index) => ({ index, step }))
      .filter(({ step }) => isRecord(step) && step.name === expected.name);
    const match = matches[0];
    if (matches.length !== 1 || !match || !isRecord(match.step)) return false;
    const step = match.step;
    const allowedKeys = new Set(['id', 'name', 'if', 'shell', 'env', 'run']);
    if (Object.keys(step).some((key) => !allowedKeys.has(key))) return false;
    if (step.id !== undefined && typeof step.id !== 'string') return false;
    if (step.if !== expected.condition
      || step.shell !== '/usr/bin/bash --noprofile --norc -euo pipefail {0}'
      || step.run !== governanceReadRun(expected.prefix)) {
      return false;
    }
    if (!isRecord(step.env)
      || !exactPermissions(step.env, {
        GH_TOKEN: releaseGovernanceSecret,
        GH_REPO: '${{ github.repository }}',
        PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
        BASH_ENV: '/dev/null',
        ENV: '/dev/null',
        LD_PRELOAD: '',
        LD_LIBRARY_PATH: '',
      })) {
      return false;
    }
    allowedSecretPaths.push([
      'jobs',
      'release',
      'steps',
      match.index,
      'env',
      'GH_TOKEN',
    ]);
  }

  return secretReferences.length === allowedSecretPaths.length
    && secretReferences.every((reference) => (
      reference.value === releaseGovernanceSecret
      && allowedSecretPaths.some((path) => equalWorkflowPath(reference.path, path))
    ));
}

function reviewedWorkflowHasUnsafeSurface(
  path: string,
  text: string,
  document: Readonly<Record<string, unknown>> | undefined,
) {
  if (!document) return true;
  const expectedJob = path === releaseWorkflowPath ? 'release' : 'approve';
  if (!hasExactWorkflowJob(document, expectedJob)
    || !reviewedWorkflowExecutionShapeIsExact(path, document)
    || containsMappingKey(document, 'secrets')) {
    return true;
  }
  const governanceSecretMatches = text.match(
    /\$\{\{\s*secrets\.STEPHEN_RELEASE_GOVERNANCE_TOKEN\s*\}\}/g,
  ) ?? [];
  if (path === releaseWorkflowPath && governanceSecretMatches.length !== 2) return true;
  const secretReferences = collectSecretsContextReferences(document);
  if (path === releaseWorkflowPath
    && !releaseGovernanceStepsAreExact(document, secretReferences)) return true;
  if (path === approvalWorkflowPath && secretReferences.length !== 0) return true;
  const secretSanitizedText = path === releaseWorkflowPath
    ? text.split(releaseGovernanceSecret).join('')
    : text;
  if (hasSecretsContextAccess(secretSanitizedText)) return true;
  return [
    /^\s*environment\s*:/m,
    /\bpull_request_target\b/i,
    /\bself-hosted\b/i,
    /\bssh\b/i,
    /\bnginx\b/i,
    /\bdns\b/i,
    /\bdeployment\b/i,
    /\bproduction\b/i,
    /git\s+push[^\n]*(?:--force|-f\b)/,
    /git\s+reset\s+--hard/,
  ].some((pattern) => pattern.test(secretSanitizedText));
}

function approvalWorkflowContract(text: string) {
  return [
    /^on:\s*\n\s{2}workflow_dispatch:/m,
    /group:\s*stephen-public-content-writer/,
    /github\.event\.repository\.default_branch/,
    /github\.triggering_actor/,
    /ref:\s*\$\{\{ github\.sha \}\}/,
    /validate-request --request/,
    /stephen-reviewed-release-cli\.ts promote/,
    /stephen-reviewed-release-cli\.ts seal/,
    /stephen-reviewed-release-cli\.ts verify-chain/,
    /npm run check/,
    /stephen-release-cli\.ts verify/,
    /\.base\.sha == \$baseSha/,
    /merge-base --is-ancestor "\$BASE_SHA" "\$CANDIDATE_SHA"/,
    /merge-base --is-ancestor "\$BASE_SHA" "\$SEAL_SHA"/,
    /commits\/\$DEFAULT_BRANCH/,
    /pulls\/\$PR_NUMBER\/merge/,
    /-f sha="\$SEAL_SHA"/,
    /-f merge_method=merge/,
    /actions\/upload-artifact@[0-9a-f]{40}/,
    /stephen-reviewed-release-handoff-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/,
  ].every((pattern) => pattern.test(text))
    && !/checks:\s*write/.test(text)
    && !/repos\/\$GH_REPO\/check-runs/.test(text)
    && !/repos\/\$GH_REPO\/dispatches/.test(text)
    && !/(?:repos\/\$GH_REPO\/releases|git\/refs|uploads\.github\.com)/.test(text);
}

function releaseWorkflowContract(text: string) {
  return [
    /^on:\s*\n\s{2}workflow_run:/m,
    /^\s{2}workflow_dispatch:\s*$/m,
    /^\s{6}approval_run_id:\s*$/m,
    /^\s{6}approval_run_attempt:\s*$/m,
    /Stephen approve reviewed content/,
    /group:\s*stephen-reviewed-release-/,
    /ACTOR:\s*\$\{\{ github\.actor \}\}/,
    /TRIGGERING_ACTOR:\s*\$\{\{ github\.triggering_actor \}\}/,
    /\[\[ "\$CURRENT_REF" == "\$DEFAULT_BRANCH" \]\]/,
    /actions\/runs\/\$approval_run_id\/attempts\/\$approval_run_attempt/,
    /actions\/runs\/\$APPROVAL_RUN_ID\/artifacts\?per_page=100/,
    /actions\/runs\/\$APPROVAL_RUN_ID\/attempts\/\$APPROVAL_RUN_ATTEMPT\/jobs\?per_page=100/,
    /actions\/download-artifact@[0-9a-f]{40}/,
    /stephen-reviewed-release-handoff-/,
    /trusted\/scripts\/github-api-read-optional\.sh/,
    /repos\/\$GH_REPO\/immutable-releases/,
    /secrets\.STEPHEN_RELEASE_GOVERNANCE_TOKEN/,
    /name:\s*Read fail-closed repository governance facts/,
    /name:\s*Refresh governance facts before immutable publication/,
    /ref:\s*\$\{\{ steps\.source\.outputs\.release_control_sha \}\}/,
    /commits\/\$DEFAULT_BRANCH/,
    /merge-base --is-ancestor "\$merge_sha" "\$current_default_sha"/,
    /collaborators\?affiliation=all/,
    /Protect Stephen immutable Release tags/,
    /rulesets\/\$tag_ruleset_id/,
    /validate-release --request/,
    /npm run check/,
    /stephen-release-cli\.ts verify/,
    /saas-608-exact-seal-rebuild\.json/,
    /approvalArtifact:/,
    /approvalJob:/,
    /exactSealRebuild:/,
    /tar --sort=name --mtime='@0'/,
    /gzip -n -9/,
    /-F draft=true/,
    /uploads\.github\.com/,
    /Release tag must not exist before GitHub atomically publishes the Draft/,
    /-F draft=false/,
    /saas-608-prepublish-policy\.json/,
    /\.immutable == true/,
    /\.status == "already_immutable"/,
  ].every((pattern) => pattern.test(text))
    && (text.match(/trusted\/scripts\/github-api-read-optional\.sh/g) ?? []).length === 2
    && !/commits\/\$SEAL_SHA\/check-runs/.test(text)
    && !/checks:\s*(?:read|write)/.test(text)
    && !/git\/refs/.test(text)
    && !/repository_dispatch/.test(text);
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
      const workflowDocument = parseWorkflowDocument(text);
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
        if (reviewedWorkflowHasUnsafeSurface(entry.path, text, workflowDocument)) {
          pushFinding(findings, findingKeys, 'reviewed-workflow-boundary', entry.path);
        }
      }
      if (entry.path === approvalWorkflowPath) {
        if (hasJobLevelPermissionOverride(workflowDocument)
          || !exactPermissions(topLevelWorkflowPermissions(workflowDocument), {
          contents: 'write',
          'pull-requests': 'write',
          })) {
          pushFinding(findings, findingKeys, 'reviewed-workflow-permissions', entry.path);
        }
        if (!approvalWorkflowContract(text)) {
          pushFinding(findings, findingKeys, 'reviewed-workflow-contract', entry.path);
        }
      }
      if (entry.path === releaseWorkflowPath) {
        if (hasJobLevelPermissionOverride(workflowDocument)
          || !exactPermissions(topLevelWorkflowPermissions(workflowDocument), {
          contents: 'write',
          actions: 'read',
          'pull-requests': 'read',
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
