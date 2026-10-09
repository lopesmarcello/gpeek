import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { request } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  startLocalServer,
  type LocalServer,
} from '../../apps/server/src/index.js';
import { sessionSchema } from '../../packages/contracts/src/index.js';
let server: LocalServer;
let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'gpeek-assets-'));
  await writeFile(join(directory, 'index.html'), '<html>Harness</html>');
  server = await startLocalServer({
    assetsDirectory: directory,
    gitVersion: 'git version fixture',
  });
});
afterEach(async () => {
  await server?.stop();
  if (directory) await rm(directory, { recursive: true, force: true });
});
async function authenticate() {
  const token = new URL(server.bootstrapUrl).hash.slice('#token='.length);
  const response = await fetch(`${server.url}/api/bootstrap`, {
    method: 'POST',
    headers: { Origin: server.url, 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  expect(response.status).toBe(204);
  const cookie = response.headers.get('set-cookie');
  expect(cookie).toContain('HttpOnly');
  expect(cookie).toContain('SameSite=Strict');
  return cookie!.split(';')[0]!;
}
describe('local session', () => {
  it('serves only known assets, protects API, establishes session and closes the listener', async () => {
    const index = await fetch(server.url);
    expect(index.status).toBe(200);
    expect(index.headers.get('content-security-policy')).toContain(
      "frame-ancestors 'none'",
    );
    expect((await fetch(`${server.url}/AGENTS.md`)).status).toBe(404);
    expect((await fetch(`${server.url}/api/session`)).status).toBe(401);
    const cookie = await authenticate();
    const session = await fetch(`${server.url}/api/session`, {
      headers: { Cookie: cookie },
    });
    expect(sessionSchema.parse(await session.json()).phase).toBe('bootstrap');
    expect(
      (
        await fetch(`${server.url}/api/shutdown`, {
          method: 'POST',
          headers: { Cookie: cookie, Origin: server.url },
        })
      ).status,
    ).toBe(204);
    await server.closed;
    await expect(fetch(server.url)).rejects.toThrow();
  });
  it('rejects DNS rebinding hosts and cross-site origins before serving assets', async () => {
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(
        server.url,
        { headers: { Host: 'attacker.example' } },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      );
      req.once('error', reject);
      req.end();
    });
    expect(status).toBe(403);
    expect(
      (
        await fetch(server.url, {
          headers: { Origin: 'https://attacker.example' },
        })
      ).status,
    ).toBe(403);
    expect(
      (await fetch(server.url, { headers: { 'Sec-Fetch-Site': 'cross-site' } }))
        .status,
    ).toBe(403);
    expect(
      (
        await fetch(`${server.url}/api/bootstrap`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: 'a'.repeat(64) }),
        })
      ).status,
    ).toBe(403);
  });
  it('rejects malformed, oversized, wrong and replayed bootstrap tokens', async () => {
    const post = (body: string) =>
      fetch(`${server.url}/api/bootstrap`, {
        method: 'POST',
        headers: { Origin: server.url, 'Content-Type': 'application/json' },
        body,
      });
    expect((await post('{')).status).toBe(400);
    expect(
      (await post(JSON.stringify({ token: 'a'.repeat(2048) }))).status,
    ).toBe(400);
    expect((await post(JSON.stringify({ token: 'a'.repeat(64) }))).status).toBe(
      401,
    );
    await authenticate();
    const token = new URL(server.bootstrapUrl).hash.slice('#token='.length);
    expect((await post(JSON.stringify({ token }))).status).toBe(401);
  });
});
