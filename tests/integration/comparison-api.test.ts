import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { startLocalServer, createReview } from '../../apps/server/src/index.js';
import { openRepository } from '../../packages/git/src/index.js';
import {
  comparisonSchema,
  fileDiffSchema,
  repositorySchema,
} from '../../packages/contracts/src/index.js';
import { createRepositoryFixture } from '../fixtures/repository.js';
it('compares local branches against remote tracking refs through the authenticated API', async () => {
  const fixture = await createRepositoryFixture();
  const assets = await mkdtemp(join(tmpdir(), 'gpeek-api-'));
  let server;
  try {
    await writeFile(join(assets, 'index.html'), '<html>API fixture</html>');
    server = await startLocalServer({
      assetsDirectory: assets,
      gitVersion: 'git version fixture',
      review: createReview(await openRepository(fixture.repo)),
    });
    expect((await fetch(`${server.url}/api/repository`)).status).toBe(401);
    const auth = await fetch(`${server.url}/api/bootstrap`, {
      method: 'POST',
      headers: { Origin: server.url, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: new URL(server.bootstrapUrl).hash.slice('#token='.length),
      }),
    });
    const headers = {
      Cookie: auth.headers.get('set-cookie')!.split(';')[0]!,
      Origin: server.url,
      'Content-Type': 'application/json',
    };
    const info = repositorySchema.parse(
      await (await fetch(`${server.url}/api/repository`, { headers })).json(),
    );
    expect(
      info.refs.some((ref) => ref.name === 'refs/remotes/origin/main'),
    ).toBe(true);
    const response = await fetch(`${server.url}/api/comparisons`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        baseRef: 'refs/remotes/origin/main',
        headRef: 'refs/heads/feature',
        mode: 'merge-base',
        ignoreWhitespace: false,
      }),
    });
    expect(response.status).toBe(200);
    const comparison = comparisonSchema.parse(await response.json());
    const diff = fileDiffSchema.parse(
      await (
        await fetch(
          `${server.url}/api/comparisons/${comparison.id}/files/${comparison.files[0]!.id}`,
          { headers },
        )
      ).json(),
    );
    expect(diff.hunks[0]?.lines[1]?.text).toBe('feature');
    expect(
      (
        await fetch(`${server.url}/api/comparisons`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ command: 'git reset' }),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await fetch(`${server.url}/api/comparisons`, {
          method: 'POST',
          headers: { ...headers, Origin: 'https://attacker.example' },
          body: '{}',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await fetch(`${server.url}/api/fetch`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ remote: '--upload-pack=evil' }),
        })
      ).status,
    ).toBe(404);
  } finally {
    await server?.stop();
    await rm(assets, { recursive: true, force: true });
    await fixture.dispose();
  }
});
