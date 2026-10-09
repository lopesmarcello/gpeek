import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
it('starts the built CLI without printing secrets and exits on SIGTERM', async () => {
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(new URL('../../apps/cli/dist/index.js', import.meta.url)),
      '--no-open',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk;
  });
  const exit = new Promise<number | null>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const output = await new Promise<string>((resolve, reject) => {
      let stdout = '';
      timeout = setTimeout(
        () => reject(new Error('CLI startup timed out')),
        5000,
      );
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        stdout += chunk;
        if (stdout.includes('Serviço local:')) resolve(stdout);
      });
      child.once('error', reject);
      child.once('close', (code, signal) =>
        reject(
          new Error(
            `CLI exited before startup (code=${code}, signal=${signal}): ${stderr}`,
          ),
        ),
      );
    });
    const url = output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
    expect(url).toBeTruthy();
    expect(output).not.toContain('token=');
    expect((await fetch(url!)).status).toBe(200);
    child.kill('SIGTERM');
    const code = await exit;
    if (process.platform !== 'win32') expect(code).toBe(0);
    await expect(fetch(url!)).rejects.toThrow();
  } finally {
    if (timeout) clearTimeout(timeout);
    child.kill('SIGTERM');
    await exit;
  }
});
