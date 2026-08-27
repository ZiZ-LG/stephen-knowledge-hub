/// <reference path="./node-runtime.d.ts" />

import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';

export interface StephenArtifactEntry {
  readonly path: string;
  readonly type: 'file' | 'symlink' | 'directory' | 'other';
  readonly bytes: Uint8Array;
}

export interface StephenReleaseFile {
  readonly path: string;
  readonly size: number;
  readonly sha256: string;
}

export interface StephenReleaseMetadata {
  readonly schemaVersion: 1;
  readonly task: 'SAAS-607';
  readonly sourceRepository: 'ZiZ-LG/stephen-knowledge-hub';
  readonly sourceSha: string;
  readonly fileCount: number;
  readonly contentChecksum: string;
  readonly smokePaths: readonly string[];
  readonly files: readonly StephenReleaseFile[];
}

export interface StephenReleaseVerifyCommand {
  readonly command: 'verify';
  readonly artifactDirectory: string;
  readonly sourceSha: string;
  readonly metadataFile: string;
}

export interface VerifyStephenArtifactInput {
  readonly artifactDirectory: string;
  readonly sourceSha: string;
  readonly metadataFile: string;
}

const requiredFiles = [
  'index.html',
  'fieldbook/index.html',
  'beian-police.png',
  'robots.txt',
  'sitemap.xml',
] as const;

const STEPHEN_SOURCE_REPOSITORY = 'ZiZ-LG/stephen-knowledge-hub' as const;

const requiredMarkers = [
  'AI 技术',
  '大客户销售',
  '岗位组织转型',
  '京ICP备2026046195号-2',
  '京公网安备11010802049879号',
] as const;

const forbiddenEditorialStates = [
  'pending_owner_review',
  'not_published',
] as const;

const requiredSmokePaths = ['/', '/digest/', '/policy/', '/fieldbook/'] as const;
const MAX_ARTIFACT_FILES = 1000;
const MAX_ARTIFACT_FILE_BYTES = 8 * 1024 * 1024;
const MAX_ARTIFACT_BYTES = 16 * 1024 * 1024;
const MAX_ARTIFACT_PATH_SEGMENTS = 16;

function sha256(value: string | Uint8Array) {
  return createHash('sha256').update(value).digest('hex');
}

function requireSourceSha(sourceSha: string) {
  if (!/^[0-9a-f]{40}$/.test(sourceSha)) {
    throw new Error('source SHA must be 40 lowercase hexadecimal characters');
  }
}

function invalidCliArguments(): never {
  throw new Error('invalid SAAS-607 CLI arguments');
}

export function parseStephenReleaseCliArgs(
  argv: readonly string[],
): StephenReleaseVerifyCommand {
  const [command, ...optionValues] = argv;
  if (command !== 'verify' || optionValues.length !== 6) invalidCliArguments();
  const options = new Map<string, string>();
  for (let index = 0; index < optionValues.length; index += 2) {
    const key = optionValues[index];
    const value = optionValues[index + 1];
    if (!key?.startsWith('--') || !value || options.has(key)) invalidCliArguments();
    options.set(key, value);
  }
  if (options.size !== 3
    || !options.has('--artifact')
    || !options.has('--source-sha')
    || !options.has('--metadata-file')) invalidCliArguments();

  const artifactDirectory = options.get('--artifact')!;
  const sourceSha = options.get('--source-sha')!;
  const metadataFile = options.get('--metadata-file')!;
  if (!isAbsolute(artifactDirectory)
    || artifactDirectory === '/'
    || resolve(artifactDirectory) !== artifactDirectory
    || !isAbsolute(metadataFile)
    || resolve(metadataFile) !== metadataFile
    || metadataFile !== resolve(artifactDirectory, '.stephen-release.json')) {
    invalidCliArguments();
  }
  try {
    requireSourceSha(sourceSha);
  } catch {
    invalidCliArguments();
  }
  return { command, artifactDirectory, sourceSha, metadataFile };
}

function requireSafeArtifactPath(path: string) {
  if (!path
    || path.startsWith('/')
    || path.includes('\\')
    || path.includes('\0')
    || !/^[A-Za-z0-9._/-]+$/.test(path)
    || path.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error(`artifact path is unsafe: ${path}`);
  }
}

function decodeTextEntries(entries: readonly StephenArtifactEntry[]) {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  return entries
    .filter((entry) => /\.(?:html|js|css|txt|xml|svg|json)$/.test(entry.path))
    .map((entry) => {
      try {
        return decoder.decode(entry.bytes);
      } catch {
        throw new Error(`artifact text file is not valid UTF-8: ${entry.path}`);
      }
    })
    .join('\n');
}

function sitemapSmokePaths(sitemap: string) {
  const paths = new Set<string>();
  for (const match of sitemap.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)) {
    let url: URL;
    try {
      url = new URL(match[1]);
    } catch {
      throw new Error('artifact sitemap contains an invalid URL');
    }
    if (url.protocol !== 'https:' || url.hostname !== 'stephen.lake2ocean.top') {
      throw new Error('artifact sitemap contains a URL outside the canonical Stephen origin');
    }
    if (url.search || url.hash) {
      throw new Error('artifact sitemap paths must not contain query strings or fragments');
    }
    paths.add(url.pathname);
  }

  for (const required of requiredSmokePaths) {
    if (!paths.has(required)) {
      throw new Error(`artifact sitemap is missing required path: ${required}`);
    }
  }
  const detailPaths = [...paths]
    .filter((path) => path.startsWith('/items/') && path.length > '/items/'.length)
    .sort((left, right) => left.localeCompare(right));
  if (detailPaths.length === 0) {
    throw new Error('artifact sitemap has no public item detail path');
  }
  return [...requiredSmokePaths, ...detailPaths];
}

export function buildStephenReleaseMetadata(
  entries: readonly StephenArtifactEntry[],
  sourceSha: string,
): StephenReleaseMetadata {
  requireSourceSha(sourceSha);
  if (entries.length === 0) throw new Error('artifact is empty');
  if (entries.length > MAX_ARTIFACT_FILES) {
    throw new Error('artifact exceeds the 1000-file safety limit');
  }

  const paths = new Set<string>();
  let totalBytes = 0;
  for (const entry of entries) {
    requireSafeArtifactPath(entry.path);
    if (entry.path.split('/').length > MAX_ARTIFACT_PATH_SEGMENTS) {
      throw new Error('artifact path exceeds the 16-segment depth limit');
    }
    if (entry.type !== 'file') {
      throw new Error(`artifact entries must be regular files: ${entry.path}`);
    }
    if (entry.bytes.byteLength > MAX_ARTIFACT_FILE_BYTES) {
      throw new Error('artifact file exceeds the 8 MiB safety limit');
    }
    totalBytes += entry.bytes.byteLength;
    if (totalBytes > MAX_ARTIFACT_BYTES) {
      throw new Error('artifact exceeds the 16 MiB total-size safety limit');
    }
    if (paths.has(entry.path)) throw new Error(`artifact path is duplicated: ${entry.path}`);
    paths.add(entry.path);
  }
  for (const required of requiredFiles) {
    if (!paths.has(required)) throw new Error(`artifact is missing required file: ${required}`);
    if (entries.find((entry) => entry.path === required)?.bytes.byteLength === 0) {
      throw new Error(`required artifact file is empty: ${required}`);
    }
  }

  const text = decodeTextEntries(entries);
  for (const marker of requiredMarkers) {
    if (!text.includes(marker)) throw new Error(`artifact is missing required marker: ${marker}`);
  }
  for (const state of forbiddenEditorialStates) {
    if (text.includes(state)) {
      throw new Error(`artifact contains non-public editorial state: ${state}`);
    }
  }

  const sitemapEntry = entries.find((entry) => entry.path === 'sitemap.xml');
  if (!sitemapEntry) throw new Error('artifact is missing required file: sitemap.xml');
  let sitemap: string;
  try {
    sitemap = new TextDecoder('utf-8', { fatal: true }).decode(sitemapEntry.bytes);
  } catch {
    throw new Error('artifact text file is not valid UTF-8: sitemap.xml');
  }

  const files = entries
    .map((entry) => ({
      path: entry.path,
      size: entry.bytes.byteLength,
      sha256: sha256(entry.bytes),
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
  const checksumInput = files
    .map((file) => `${file.path}\0${file.size}\0${file.sha256}\n`)
    .join('');

  return {
    schemaVersion: 1,
    task: 'SAAS-607',
    sourceRepository: STEPHEN_SOURCE_REPOSITORY,
    sourceSha,
    fileCount: files.length,
    contentChecksum: sha256(checksumInput),
    smokePaths: sitemapSmokePaths(sitemap),
    files,
  };
}

async function collectArtifactEntries(
  artifactDirectory: string,
  metadataFile: string,
): Promise<StephenArtifactEntry[]> {
  const entries: StephenArtifactEntry[] = [];
  let totalBytes = 0;

  async function visit(directory: string): Promise<void> {
    const children = [...await readdir(directory, { withFileTypes: true })]
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const child of children) {
      const absolutePath = join(directory, child.name);
      const artifactPath = relative(artifactDirectory, absolutePath);
      if (absolutePath === metadataFile) continue;
      requireSafeArtifactPath(artifactPath);
      if (child.isDirectory()) {
        await visit(absolutePath);
      } else if (child.isFile()) {
        if (entries.length >= MAX_ARTIFACT_FILES) {
          throw new Error('artifact exceeds the 1000-file safety limit');
        }
        if (artifactPath.split('/').length > MAX_ARTIFACT_PATH_SEGMENTS) {
          throw new Error('artifact path exceeds the 16-segment depth limit');
        }
        const file = await lstat(absolutePath);
        if (!file.isFile() || file.isSymbolicLink()) {
          throw new Error(`artifact entries must be regular files: ${artifactPath}`);
        }
        if (file.size > MAX_ARTIFACT_FILE_BYTES) {
          throw new Error('artifact file exceeds the 8 MiB safety limit');
        }
        totalBytes += file.size;
        if (totalBytes > MAX_ARTIFACT_BYTES) {
          throw new Error('artifact exceeds the 16 MiB total-size safety limit');
        }
        const bytes = await readFile(absolutePath);
        if (bytes.byteLength !== file.size) {
          throw new Error(`artifact file changed while being read: ${artifactPath}`);
        }
        entries.push({
          path: artifactPath,
          type: 'file',
          bytes,
        });
      } else if (child.isSymbolicLink()) {
        entries.push({ path: artifactPath, type: 'symlink', bytes: new Uint8Array() });
      } else {
        entries.push({ path: artifactPath, type: 'other', bytes: new Uint8Array() });
      }
    }
  }

  await visit(artifactDirectory);
  return entries;
}

export async function verifyStephenArtifactDirectory(
  input: VerifyStephenArtifactInput,
): Promise<StephenReleaseMetadata> {
  const command = parseStephenReleaseCliArgs([
    'verify',
    '--artifact', input.artifactDirectory,
    '--source-sha', input.sourceSha,
    '--metadata-file', input.metadataFile,
  ]);
  const root = await lstat(command.artifactDirectory);
  if (!root.isDirectory() || root.isSymbolicLink()) {
    throw new Error('artifact root must be a real directory');
  }
  const metadata = buildStephenReleaseMetadata(
    await collectArtifactEntries(command.artifactDirectory, command.metadataFile),
    command.sourceSha,
  );
  await writeFile(command.metadataFile, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
  return metadata;
}
