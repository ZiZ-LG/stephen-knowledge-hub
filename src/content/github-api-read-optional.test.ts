import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const scriptPath = fileURLToPath(
  new URL('../../scripts/github-api-read-optional.sh', import.meta.url),
);

function runProbe(
  endpoint: string,
  outputPath: string,
  apiUrl: string,
): Promise<{ readonly code: number | null; readonly stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', [scriptPath, endpoint, outputPath], {
      env: {
        ...process.env,
        GITHUB_API_URL: apiUrl,
        GITHUB_TOKEN: 'test-token',
        STEPHEN_ALLOW_INSECURE_API_URL: '1',
      },
    });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stderr }));
  });
}

describe('fail-closed optional GitHub API reader', () => {
  it('treats only an explicit 404 as absent and rejects HTTP or transport failures', async () => {
    const workDir = await mkdtemp(join(tmpdir(), 'stephen-github-read-'));
    const server = createServer((request, response) => {
      if (request.headers.authorization !== 'Bearer test-token') {
        response.writeHead(401, { 'content-type': 'application/json' });
        response.end('{"message":"unauthorized"}');
        return;
      }
      const status = request.url === '/ok' || request.url === '/null-success'
        ? 200
        : request.url === '/missing'
          ? 404
          : request.url === '/forbidden'
            ? 403
            : 503;
      response.writeHead(status, { 'content-type': 'application/json' });
      if (request.url === '/ok') {
        response.end(`{"ref":"refs/tags/example","object":{"type":"commit","sha":"${'a'.repeat(40)}"}}`);
      } else if (request.url === '/null-success') {
        response.end('null');
      } else {
        response.end(`{"status":${status}}`);
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('test server did not bind');
    const apiUrl = `http://127.0.0.1:${address.port}`;

    try {
      const okPath = join(workDir, 'ok.json');
      expect(await runProbe('ok', okPath, apiUrl)).toMatchObject({ code: 0 });
      expect(JSON.parse(await readFile(okPath, 'utf8'))).toEqual({
        ref: 'refs/tags/example',
        object: { type: 'commit', sha: 'a'.repeat(40) },
      });

      const nullSuccessPath = join(workDir, 'null-success.json');
      const nullSuccess = await runProbe('null-success', nullSuccessPath, apiUrl);
      expect(nullSuccess.code).not.toBe(0);
      expect(nullSuccess.stderr).toContain('GitHub API success payload failed closed');

      const missingPath = join(workDir, 'missing.json');
      expect(await runProbe('missing', missingPath, apiUrl)).toMatchObject({ code: 0 });
      expect(await readFile(missingPath, 'utf8')).toBe('null\n');

      for (const endpoint of ['forbidden', 'server-error']) {
        const outputPath = join(workDir, `${endpoint}.json`);
        const result = await runProbe(endpoint, outputPath, apiUrl);
        expect(result.code).not.toBe(0);
        expect(result.stderr).toContain('GitHub API GET failed closed');
        expect(await readFile(outputPath, 'utf8')).not.toBe('null\n');
      }

      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      const transportPath = join(workDir, 'transport.json');
      const transport = await runProbe('network-error', transportPath, apiUrl);
      expect(transport.code).not.toBe(0);
      expect(transport.stderr).toContain('GitHub API transport failed closed');
    } finally {
      if (server.listening) {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      await rm(workDir, { recursive: true, force: true });
    }
  });
});
