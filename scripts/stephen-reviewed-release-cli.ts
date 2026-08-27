import { createHash } from 'node:crypto';
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path';

import type { ReviewedKnowledgeItem } from '../src/domain.ts';
import {
  parseDailyReviewLedgerForApproval,
  parseDailyReviewManifestForApproval,
} from './stephen-daily-review.ts';
import {
  buildApprovalSeal,
  evaluateReviewedApprovalRequest,
  evaluateReviewedReleaseRequest,
  promoteReviewedManifest,
  verifyApprovalChain,
  type ReviewedApprovalSeal,
  type ReviewedApprovalRequestInput,
  type ReviewedReleaseRequestInput,
  type ReviewedPromotionRecord,
} from './stephen-reviewed-release.ts';

type CliCommand =
  | { readonly command: 'promote'; readonly options: ReadonlyMap<string, string> }
  | { readonly command: 'seal'; readonly options: ReadonlyMap<string, string> }
  | { readonly command: 'validate-request'; readonly options: ReadonlyMap<string, string> }
  | { readonly command: 'validate-release'; readonly options: ReadonlyMap<string, string> }
  | { readonly command: 'verify-chain'; readonly options: ReadonlyMap<string, string> };

function invalidArguments(): never {
  throw new Error('invalid SAAS-608 CLI arguments');
}

function parseOptions(values: readonly string[]) {
  if (values.length % 2 !== 0) invalidArguments();
  const options = new Map<string, string>();
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith('--') || !value || options.has(key)) invalidArguments();
    options.set(key, value);
  }
  return options;
}

function requireExactOptions(
  options: ReadonlyMap<string, string>,
  expected: readonly string[],
) {
  if (options.size !== expected.length || expected.some((key) => !options.has(key))) {
    invalidArguments();
  }
}

export function parseReviewedReleaseCliArgs(argv: readonly string[]): CliCommand {
  const [command, ...values] = argv;
  const options = parseOptions(values);
  if (command === 'promote') {
    requireExactOptions(options, [
      '--root',
      '--manifest',
      '--ledger',
      '--candidate-sha',
      '--current-head-sha',
      '--approver',
      '--repository-owner',
      '--repository',
      '--approved-at',
      '--pr-number',
    ]);
    return { command, options };
  }
  if (command === 'seal') {
    requireExactOptions(options, ['--root', '--promotion-record', '--promotion-sha']);
    return { command, options };
  }
  if (command === 'validate-request') {
    requireExactOptions(options, ['--request']);
    return { command, options };
  }
  if (command === 'validate-release') {
    requireExactOptions(options, ['--request']);
    return { command, options };
  }
  if (command === 'verify-chain') {
    requireExactOptions(options, [
      '--root',
      '--approval-record',
      '--candidate-sha',
      '--promotion-sha',
      '--seal-sha',
      '--promotion-parent-sha',
      '--seal-parent-sha',
      '--pr-head-sha',
      '--repository',
      '--release-tag',
    ]);
    return { command, options };
  }
  return invalidArguments();
}

function option(options: ReadonlyMap<string, string>, key: string) {
  const value = options.get(key);
  if (!value) invalidArguments();
  return value;
}

function isMissing(error: unknown) {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { readonly code?: unknown }).code === 'ENOENT';
}

async function pathExists(path: string) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

function requireRoot(value: string) {
  if (!isAbsolute(value)
    || resolve(value) !== value
    || value === '/'
    || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error('root must be an absolute normalized repository directory');
  }
  return value;
}

function containedPath(root: string, value: string, label: string) {
  if (isAbsolute(value)
    || value.includes('\\')
    || /[\u0000-\u001f\u007f]/.test(value)
    || value.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new Error(`${label} must stay within the repository root`);
  }
  const target = resolve(root, value);
  const fromRoot = relative(root, target);
  if (fromRoot === '' || fromRoot.startsWith('..') || isAbsolute(fromRoot)) {
    throw new Error(`${label} must stay within the repository root`);
  }
  return target;
}

async function assertNoSymlinks(root: string, target: string, label: string) {
  const rootInfo = await lstat(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    throw new Error('repository root must be a real directory');
  }
  const parts = relative(root, target).split('/');
  let current = root;
  for (const part of parts) {
    current = join(current, part);
    let info;
    try {
      info = await lstat(current);
    } catch (error) {
      if (isMissing(error)) return;
      throw error;
    }
    if (info.isSymbolicLink()) throw new Error(`${label} must not contain symlinks`);
  }
}

async function readRegularText(root: string, relativePath: string, label: string) {
  const path = containedPath(root, relativePath, label);
  await assertNoSymlinks(root, path, label);
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o111) !== 0) {
    throw new Error(`${label} must be a regular non-executable file`);
  }
  return { path, text: await readFile(path, 'utf8') };
}

function parseJson(text: string, label: string) {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${label} must contain valid JSON`);
  }
}

function sha256(value: string | Uint8Array) {
  return createHash('sha256').update(value).digest('hex');
}

function jsonBytes(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function loadExistingPublishedItems(root: string) {
  const directory = containedPath(root, 'src/content/published', 'published directory');
  await mkdir(directory, { recursive: true });
  await assertNoSymlinks(root, directory, 'published directory');
  const entries = await readdir(directory, { withFileTypes: true });
  const items: ReviewedKnowledgeItem[] = [];
  for (const entry of [...entries].sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.name.endsWith('.json')) continue;
    if (!entry.isFile() || entry.isSymbolicLink()) {
      throw new Error('published collection must contain regular JSON files only');
    }
    const relativePath = `src/content/published/${entry.name}`;
    const file = await readRegularText(root, relativePath, 'published item');
    items.push(parseJson(file.text, 'published item') as ReviewedKnowledgeItem);
  }
  return items;
}

async function preflightOutputs(root: string, relativePaths: readonly string[]) {
  const paths = relativePaths.map((path) => containedPath(root, path, 'reviewed release output'));
  for (const path of paths) {
    if (await pathExists(path)) {
      throw new Error(`refusing to overwrite reviewed release output: ${relative(root, path)}`);
    }
  }
  for (const path of paths) {
    await mkdir(dirname(path), { recursive: true });
    await assertNoSymlinks(root, dirname(path), 'reviewed release output');
  }
  return paths;
}

async function writeExclusive(path: string, value: unknown) {
  await writeFile(path, jsonBytes(value), { encoding: 'utf8', flag: 'wx' });
}

function reviewInputDate(manifestPath: string, ledgerPath: string) {
  const manifestMatch = manifestPath.match(
    /^review-candidates\/(\d{4}-\d{2}-\d{2})\/review-manifest\.json$/,
  );
  const ledgerMatch = ledgerPath.match(
    /^review-candidates\/(\d{4}-\d{2}-\d{2})\/discovery-ledger\.json$/,
  );
  if (!manifestMatch || !ledgerMatch || manifestMatch[1] !== ledgerMatch[1]) {
    throw new Error('manifest and ledger must use the matching daily review directory');
  }
  return manifestMatch[1];
}

function positiveInteger(value: string, label: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || String(parsed) !== value) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

async function promote(options: ReadonlyMap<string, string>) {
  const root = requireRoot(option(options, '--root'));
  const manifestRelative = option(options, '--manifest');
  const ledgerRelative = option(options, '--ledger');
  const editorialDate = reviewInputDate(manifestRelative, ledgerRelative);
  const manifestFile = await readRegularText(root, manifestRelative, 'review manifest');
  const ledgerFile = await readRegularText(root, ledgerRelative, 'discovery ledger');
  const manifest = parseDailyReviewManifestForApproval(
    parseJson(manifestFile.text, 'review manifest'),
    editorialDate,
  );
  const ledger = parseDailyReviewLedgerForApproval(
    parseJson(ledgerFile.text, 'discovery ledger'),
    editorialDate,
  );
  const candidateSha = option(options, '--candidate-sha');
  const result = promoteReviewedManifest({
    repository: option(options, '--repository'),
    repositoryOwner: option(options, '--repository-owner'),
    approver: option(options, '--approver'),
    prNumber: positiveInteger(option(options, '--pr-number'), 'PR number'),
    candidateSha,
    currentHeadSha: option(options, '--current-head-sha'),
    approvedAt: option(options, '--approved-at'),
    manifest,
    ledger,
    manifestSha256: sha256(manifestFile.text),
    ledgerSha256: sha256(ledgerFile.text),
    existingItems: await loadExistingPublishedItems(root),
  });
  const promotionRelative = `editorial-releases/${editorialDate}/${candidateSha.slice(0, 12)}/promotion.json`;
  const outputRelativePaths = [...result.record.publishedPaths, promotionRelative];
  const outputPaths = await preflightOutputs(root, outputRelativePaths);
  for (let index = 0; index < result.items.length; index += 1) {
    await writeExclusive(outputPaths[index], result.items[index]);
  }
  await writeExclusive(outputPaths[outputPaths.length - 1], result.record);
  await rm(manifestFile.path);
  await rm(ledgerFile.path);
  return {
    task: 'SAAS-608',
    command: 'promote',
    candidateSha,
    promotionRecord: promotionRelative,
    promotedItemIds: result.record.promotedItemIds,
    publishedPaths: result.record.publishedPaths,
  } as const;
}

function promotionRecordLocation(value: string) {
  const match = value.match(
    /^editorial-releases\/(\d{4}-\d{2}-\d{2})\/([0-9a-f]{12})\/promotion\.json$/,
  );
  if (!match) throw new Error('promotion record path is invalid');
  return { editorialDate: match[1], candidatePrefix: match[2] };
}

async function seal(options: ReadonlyMap<string, string>) {
  const root = requireRoot(option(options, '--root'));
  const promotionRelative = option(options, '--promotion-record');
  const location = promotionRecordLocation(promotionRelative);
  const promotionFile = await readRegularText(root, promotionRelative, 'promotion record');
  const promotion = parseJson(promotionFile.text, 'promotion record') as ReviewedPromotionRecord;
  if (promotion.editorialDate !== location.editorialDate
    || !promotion.candidateSha?.startsWith(location.candidatePrefix)) {
    throw new Error('promotion record identity does not match its path');
  }
  const approval = buildApprovalSeal({
    promotion,
    promotionSha: option(options, '--promotion-sha'),
  });
  const approvalRelative = `${dirname(promotionRelative)}/approval.json`;
  const [approvalPath] = await preflightOutputs(root, [approvalRelative]);
  await writeExclusive(approvalPath, approval);
  return {
    task: 'SAAS-608',
    command: 'seal',
    candidateSha: approval.candidateSha,
    promotionSha: approval.promotionSha,
    approvalRecord: approvalRelative,
    promotedItemIds: approval.promotedItemIds,
  } as const;
}

async function validateRequest(options: ReadonlyMap<string, string>) {
  const requestPath = option(options, '--request');
  if (!isAbsolute(requestPath) || resolve(requestPath) !== requestPath) {
    throw new Error('approval request path must be absolute and normalized');
  }
  const info = await lstat(requestPath);
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new Error('approval request must be a regular JSON file');
  }
  const request = parseJson(
    await readFile(requestPath, 'utf8'),
    'approval request',
  ) as ReviewedApprovalRequestInput;
  return {
    task: 'SAAS-608',
    command: 'validate-request',
    ...evaluateReviewedApprovalRequest(request),
  } as const;
}

async function readAbsoluteRegularJson(path: string, label: string) {
  if (!isAbsolute(path) || resolve(path) !== path) {
    throw new Error(`${label} path must be absolute and normalized`);
  }
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new Error(`${label} must be a regular JSON file`);
  }
  return parseJson(await readFile(path, 'utf8'), label);
}

async function validateRelease(options: ReadonlyMap<string, string>) {
  const request = await readAbsoluteRegularJson(
    option(options, '--request'),
    'Release request',
  ) as ReviewedReleaseRequestInput;
  return {
    task: 'SAAS-608',
    command: 'validate-release',
    ...evaluateReviewedReleaseRequest(request),
  } as const;
}

function approvalRecordLocation(value: string) {
  if (basename(value) !== 'approval.json') throw new Error('approval record path is invalid');
  const promotionPath = `${dirname(value)}/promotion.json`;
  promotionRecordLocation(promotionPath);
  return promotionPath;
}

async function verifyChain(options: ReadonlyMap<string, string>) {
  const root = requireRoot(option(options, '--root'));
  const approvalRelative = option(options, '--approval-record');
  const promotionRelative = approvalRecordLocation(approvalRelative);
  const approvalFile = await readRegularText(root, approvalRelative, 'approval record');
  const promotionFile = await readRegularText(root, promotionRelative, 'promotion record');
  const verified = verifyApprovalChain({
    seal: parseJson(approvalFile.text, 'approval record') as ReviewedApprovalSeal,
    promotion: parseJson(promotionFile.text, 'promotion record') as ReviewedPromotionRecord,
    candidateSha: option(options, '--candidate-sha'),
    promotionSha: option(options, '--promotion-sha'),
    sealSha: option(options, '--seal-sha'),
    promotionParentSha: option(options, '--promotion-parent-sha'),
    sealParentSha: option(options, '--seal-parent-sha'),
    prHeadSha: option(options, '--pr-head-sha'),
    repository: option(options, '--repository'),
    releaseTag: option(options, '--release-tag'),
  });
  return { task: 'SAAS-608', command: 'verify-chain', ...verified } as const;
}

export async function runReviewedReleaseCli(argv: readonly string[]) {
  const parsed = parseReviewedReleaseCliArgs(argv);
  if (parsed.command === 'promote') return promote(parsed.options);
  if (parsed.command === 'seal') return seal(parsed.options);
  if (parsed.command === 'validate-request') return validateRequest(parsed.options);
  if (parsed.command === 'validate-release') return validateRelease(parsed.options);
  return verifyChain(parsed.options);
}

function safeError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 400) : 'unknown SAAS-608 error';
}

void runReviewedReleaseCli(process.argv.slice(2))
  .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
  .catch((error: unknown) => {
    process.stderr.write(`${JSON.stringify({ task: 'SAAS-608', error: safeError(error) })}\n`);
    process.exitCode = 1;
  });
