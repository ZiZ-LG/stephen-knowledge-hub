import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const scriptPath = fileURLToPath(
  new URL('../../scripts/check-candidate-base.sh', import.meta.url),
);

describe('daily review base preflight', () => {
  it('rejects contaminated or unreadable bases without altering same-day edits', async () => {
    const root = await mkdtemp(join(tmpdir(), 'stephen-candidate-base-'));
    const git = (...args: string[]) => {
      const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
      if (result.status !== 0) throw new Error(result.stderr);
      return result.stdout.trim();
    };
    const check = (ref: string) => spawnSync('bash', [scriptPath, ref], {
      cwd: root,
      encoding: 'utf8',
    });
    const commit = () => {
      git('add', '.');
      git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid',
        '-c', 'commit.gpgsign=false', 'commit', '-m', 'test snapshot');
    };

    try {
      git('init', '-q');
      await writeFile(join(root, 'README.md'), 'public source', 'utf8');
      commit();
      const cleanBase = git('rev-parse', 'HEAD');
      expect(check(cleanBase).status).toBe(0);

      for (const path of [
        'review-candidates/2026-09-23/review-manifest.json',
        'review-candidates/2026-09-30/discovery-ledger.json',
        'review-candidates/unexpected.txt',
      ]) {
        git('reset', '--hard', cleanBase);
        const parts = path.split('/');
        await mkdir(join(root, ...parts.slice(0, -1)), { recursive: true });
        await writeFile(join(root, path), 'edited draft', 'utf8');
        commit();
        const contaminatedBase = git('rev-parse', 'HEAD');
        const result = check(contaminatedBase);
        expect(result.status).toBe(1);
        expect(result.stderr).toContain('target base contains unapproved review candidates');
        expect(git('rev-parse', 'HEAD')).toBe(contaminatedBase);
        expect(git('status', '--porcelain')).toBe('');

        // A candidate working tree is allowed when its fetched base is clean.
        await writeFile(join(root, path), 'new owner edit', 'utf8');
        const ownerChanges = git('diff');
        expect(check(cleanBase).status).toBe(0);
        expect(git('diff')).toBe(ownerChanges);
      }

      expect(check('refs/remotes/origin/missing-base').status).not.toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
