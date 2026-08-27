import { describe, expect, it } from 'vitest';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import {
  buildStephenReleaseMetadata,
  parseStephenReleaseCliArgs,
  verifyStephenArtifactDirectory,
  type StephenArtifactEntry,
} from '../../scripts/stephen-release.ts';
import { approvedKnowledgeItems } from './publicItems';

const SOURCE_SHA = '1234567890abcdef1234567890abcdef12345678';

function validArtifact(): StephenArtifactEntry[] {
  return [
    {
      path: 'index.html',
      type: 'file',
      bytes: new TextEncoder().encode('<!doctype html><title>自我修养｜AI Sales Fieldcraft</title><script src="/assets/index.js"></script>'),
    },
    {
      path: 'assets/index.js',
      type: 'file',
      bytes: new TextEncoder().encode([
        '自我修养｜AI 技术、大客户销售与岗位组织转型',
        'AI 技术',
        '大客户销售',
        '岗位组织转型',
        '京ICP备2026046195号-2',
        '京公网安备11010802049879号',
      ].join('\n')),
    },
    {
      path: 'fieldbook/index.html',
      type: 'file',
      bytes: new TextEncoder().encode('<!doctype html><title>AI 销售的自我修养</title>'),
    },
    {
      path: 'beian-police.png',
      type: 'file',
      bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    },
    {
      path: 'robots.txt',
      type: 'file',
      bytes: new TextEncoder().encode('User-agent: *\nAllow: /\n'),
    },
    {
      path: 'sitemap.xml',
      type: 'file',
      bytes: new TextEncoder().encode([
        '<urlset>',
        '<url><loc>https://stephen.lake2ocean.top/</loc></url>',
        '<url><loc>https://stephen.lake2ocean.top/digest/</loc></url>',
        '<url><loc>https://stephen.lake2ocean.top/policy/</loc></url>',
        '<url><loc>https://stephen.lake2ocean.top/fieldbook/</loc></url>',
        '<url><loc>https://stephen.lake2ocean.top/items/approved-item/</loc></url>',
        '</urlset>',
      ].join('')),
    },
  ];
}

function publishedItemLocationsFromSitemap(sitemap: string) {
  const locations: string[] = [];
  for (const match of sitemap.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)) {
    const location = new URL(match[1]);
    if (location.pathname.startsWith('/items/')) locations.push(location.href);
  }
  return locations.sort();
}

function replaceLastOccurrence(value: string, search: string, replacement: string) {
  const offset = value.lastIndexOf(search);
  if (offset < 0) throw new Error(`test fixture is missing: ${search}`);
  return `${value.slice(0, offset)}${replacement}${value.slice(offset + search.length)}`;
}

describe('SAAS-607 exact-SHA artifact contract', () => {
  it('accepts a complete static build and derives all required smoke paths', () => {
    const metadata = buildStephenReleaseMetadata(validArtifact(), SOURCE_SHA);

    expect(metadata).toMatchObject({
      schemaVersion: 1,
      task: 'SAAS-607',
      sourceRepository: 'ZiZ-LG/stephen-knowledge-hub',
      sourceSha: SOURCE_SHA,
      fileCount: 6,
    });
    expect(metadata.smokePaths).toEqual([
      '/',
      '/digest/',
      '/policy/',
      '/fieldbook/',
      '/items/approved-item/',
    ]);
    expect(metadata.contentChecksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it('makes the directory checksum independent of traversal order and sensitive to bytes', () => {
    const entries = validArtifact();
    const forward = buildStephenReleaseMetadata(entries, SOURCE_SHA).contentChecksum;
    const reversed = buildStephenReleaseMetadata([...entries].reverse(), SOURCE_SHA).contentChecksum;
    const changed = entries.map((entry) => entry.path === 'robots.txt'
      ? { ...entry, bytes: new TextEncoder().encode('User-agent: *\nDisallow: /\n') }
      : entry);

    expect(reversed).toBe(forward);
    expect(buildStephenReleaseMetadata(changed, SOURCE_SHA).contentChecksum).not.toBe(forward);
  });

  it('bounds file count, path depth, individual files, and total artifact bytes', () => {
    const tooMany = [
      ...validArtifact(),
      ...Array.from({ length: 995 }, (_, index) => ({
        path: `extra/${index}.txt`,
        type: 'file' as const,
        bytes: new Uint8Array([index % 255]),
      })),
    ];
    expect(() => buildStephenReleaseMetadata(tooMany, SOURCE_SHA))
      .toThrow('artifact exceeds the 1000-file safety limit');

    expect(() => buildStephenReleaseMetadata([
      ...validArtifact(),
      {
        path: 'extra/oversized.bin',
        type: 'file',
        bytes: new Uint8Array((8 * 1024 * 1024) + 1),
      },
    ], SOURCE_SHA)).toThrow('artifact file exceeds the 8 MiB safety limit');

    expect(() => buildStephenReleaseMetadata([
      ...validArtifact(),
      {
        path: `${Array.from({ length: 17 }, () => 'deep').join('/')}/file.txt`,
        type: 'file',
        bytes: new Uint8Array([1]),
      },
    ], SOURCE_SHA)).toThrow('artifact path exceeds the 16-segment depth limit');

    expect(() => buildStephenReleaseMetadata([
      ...validArtifact(),
      ...Array.from({ length: 3 }, (_, index) => ({
        path: `extra/chunk-${index}.bin`,
        type: 'file' as const,
        bytes: new Uint8Array(6 * 1024 * 1024),
      })),
    ], SOURCE_SHA)).toThrow('artifact exceeds the 16 MiB total-size safety limit');
  });

  it.each([
    ['', 'source SHA must be 40 lowercase hexadecimal characters'],
    ['ABCDEF7890abcdef1234567890abcdef12345678', 'source SHA must be 40 lowercase hexadecimal characters'],
    ['1234', 'source SHA must be 40 lowercase hexadecimal characters'],
  ])('rejects an unsafe source identity: %s', (sourceSha, message) => {
    expect(() => buildStephenReleaseMetadata(validArtifact(), sourceSha)).toThrow(message);
  });

  it('rejects links and path traversal before packaging', () => {
    expect(() => buildStephenReleaseMetadata([
      ...validArtifact(),
      { path: 'assets/current.js', type: 'symlink', bytes: new Uint8Array() },
    ], SOURCE_SHA)).toThrow('artifact entries must be regular files');

    expect(() => buildStephenReleaseMetadata([
      ...validArtifact(),
      { path: '../escape', type: 'file', bytes: new Uint8Array([1]) },
    ], SOURCE_SHA)).toThrow('artifact path is unsafe');

    expect(() => buildStephenReleaseMetadata(validArtifact().map((entry) => (
      entry.path === 'beian-police.png'
        ? { ...entry, bytes: new Uint8Array() }
        : entry
    )), SOURCE_SHA)).toThrow('required artifact file is empty: beian-police.png');
  });

  it('fails closed when required compliance content or a detail journey is absent', () => {
    const withoutPoliceFiling = validArtifact().map((entry) => entry.path === 'assets/index.js'
      ? {
        ...entry,
        bytes: new TextEncoder().encode('AI 技术\n大客户销售\n岗位组织转型\n京ICP备2026046195号-2'),
      }
      : entry);
    expect(() => buildStephenReleaseMetadata(withoutPoliceFiling, SOURCE_SHA))
      .toThrow('artifact is missing required marker: 京公网安备11010802049879号');

    const withoutDetail = validArtifact().map((entry) => entry.path === 'sitemap.xml'
      ? {
        ...entry,
        bytes: new TextEncoder().encode([
          '<urlset>',
          '<url><loc>https://stephen.lake2ocean.top/</loc></url>',
          '<url><loc>https://stephen.lake2ocean.top/digest/</loc></url>',
          '<url><loc>https://stephen.lake2ocean.top/policy/</loc></url>',
          '<url><loc>https://stephen.lake2ocean.top/fieldbook/</loc></url>',
          '</urlset>',
        ].join('')),
      }
      : entry);
    expect(() => buildStephenReleaseMetadata(withoutDetail, SOURCE_SHA))
      .toThrow('artifact sitemap has no public item detail path');
  });

  it.each(['pending_owner_review', 'not_published'])
  ('rejects non-public candidate state leaking into the static artifact: %s', (state) => {
    const entries = validArtifact().map((entry) => entry.path === 'assets/index.js'
      ? { ...entry, bytes: new Uint8Array([...entry.bytes, ...new TextEncoder().encode(state)]) }
      : entry);

    expect(() => buildStephenReleaseMetadata(entries, SOURCE_SHA))
      .toThrow(`artifact contains non-public editorial state: ${state}`);
  });

  it('publishes exactly the explicit owner-approved detail allowlist in the production sitemap', async () => {
    const sitemapPath = decodeURIComponent(
      new URL('../../public/sitemap.xml', import.meta.url).pathname,
    );
    const sitemap = await readFile(sitemapPath, 'utf8');

    const approvedItemLocations = approvedKnowledgeItems
      .map((item) => `https://stephen.lake2ocean.top/items/${item.slug}/`)
      .sort();

    expect(publishedItemLocationsFromSitemap(sitemap)).toEqual(approvedItemLocations);
    for (const unapprovedLocation of [
      'https://stephen.lake2ocean.top/items/not-owner-approved',
      '  https://stephen.lake2ocean.top/items/not-owner-approved/  ',
      approvedItemLocations[0]!,
      'https://unapproved.example/items/not-owner-approved/',
    ]) {
      expect(publishedItemLocationsFromSitemap([
        sitemap,
        `<url><loc>${unapprovedLocation}</loc></url>`,
      ].join('\n'))).not.toEqual(approvedItemLocations);
    }
  });
});

describe('SAAS-607 release CLI boundary', () => {
  it('accepts only the exact verify command and binds metadata to the artifact root', () => {
    expect(parseStephenReleaseCliArgs([
      'verify',
      '--artifact', '/tmp/stephen-dist',
      '--source-sha', SOURCE_SHA,
      '--metadata-file', '/tmp/stephen-dist/.stephen-release.json',
    ])).toEqual({
      command: 'verify',
      artifactDirectory: '/tmp/stephen-dist',
      sourceSha: SOURCE_SHA,
      metadataFile: '/tmp/stephen-dist/.stephen-release.json',
    });
  });

  it.each([
    ['verify', '--artifact', 'relative', '--source-sha', SOURCE_SHA, '--metadata-file', 'relative/.stephen-release.json'],
    ['verify', '--artifact', '/tmp/stephen-dist', '--source-sha', SOURCE_SHA, '--metadata-file', '/tmp/outside.json'],
    ['verify', '--artifact', '/tmp/stephen-dist', '--source-sha', SOURCE_SHA],
    ['publish', '--artifact', '/tmp/stephen-dist', '--source-sha', SOURCE_SHA, '--metadata-file', '/tmp/stephen-dist/.stephen-release.json'],
  ])('rejects unsafe or unexpected CLI arguments: %j', (...argv) => {
    expect(() => parseStephenReleaseCliArgs(argv)).toThrow('invalid SAAS-607 CLI arguments');
  });

  it('walks the real artifact without following links and writes bound metadata', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'saas-607-artifact-'));
    const artifactDirectory = join(temporaryRoot, 'dist');
    const metadataFile = join(artifactDirectory, '.stephen-release.json');
    try {
      for (const entry of validArtifact()) {
        const destination = join(artifactDirectory, entry.path);
        await mkdir(dirname(destination), { recursive: true });
        await writeFile(destination, entry.bytes);
      }

      const metadata = await verifyStephenArtifactDirectory({
        artifactDirectory,
        sourceSha: SOURCE_SHA,
        metadataFile,
      });
      const stored = JSON.parse(await readFile(metadataFile, 'utf8')) as Record<string, unknown>;

      expect(stored.sourceSha).toBe(SOURCE_SHA);
      expect(stored.sourceRepository).toBe('ZiZ-LG/stephen-knowledge-hub');
      expect(stored.contentChecksum).toBe(metadata.contentChecksum);

      await symlink('index.html', join(artifactDirectory, 'linked-index.html'));
      await expect(verifyStephenArtifactDirectory({
        artifactDirectory,
        sourceSha: SOURCE_SHA,
        metadataFile,
      })).rejects.toThrow('artifact entries must be regular files: linked-index.html');
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});

describe('public source ownership boundary', () => {
  it('keeps artifact verification public and production operations private', async () => {
    const source = await readFile(
      decodeURIComponent(new URL('../../scripts/stephen-release.ts', import.meta.url).pathname),
      'utf8',
    );
    const productionEnvironment = ['production', 'stephen'].join('-');
    const privateDeploymentPath = ['deploy', 'stephen'].join('/');
    const hostKeyOverride = ['StrictHostKey', 'Checking'].join('');

    expect(source).toContain('verifyStephenArtifactDirectory');
    expect(source).not.toContain('validateStephenReleaseWorkflow');
    expect(source).not.toContain(productionEnvironment);
    expect(source).not.toContain(privateDeploymentPath);
    expect(source).not.toContain(hostKeyOverride);
  });
});
