import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { startLocalServer } from '@gpeek/server';
import { checkGitVersion } from '@gpeek/git';

test('opens a local session, removes bootstrap token, reloads and shuts down @smoke', async ({
  page,
}) => {
  const server = await startLocalServer({
    assetsDirectory: fileURLToPath(
      new URL('../../apps/web/dist/', import.meta.url),
    ),
    gitVersion: await checkGitVersion(),
  });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  try {
    await page.goto(server.bootstrapUrl);
    await expect(
      page.getByRole('heading', { name: 'gpeek', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('status')).toHaveText(
      'Serviço local conectado',
    );
    await expect(page).toHaveURL(`${server.url}/`);
    expect(await page.evaluate(() => document.cookie)).not.toContain(
      'gpeek_session',
    );
    await page.reload();
    await expect(page.getByRole('status')).toHaveText(
      'Serviço local conectado',
    );
    const shutdown = page.getByRole('button', { name: 'Encerrar sessão' });
    await page.keyboard.press('Tab');
    await expect(shutdown).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status')).toHaveText(
      'Sessão encerrada. Você pode fechar esta aba.',
    );
    await server.closed;
    await expect(fetch(server.url)).rejects.toThrow();
    expect(pageErrors).toEqual([]);
  } finally {
    await server.stop();
  }
});

test('shows an actionable error when opened without a session @smoke', async ({
  page,
}) => {
  const server = await startLocalServer({
    assetsDirectory: fileURLToPath(
      new URL('../../apps/web/dist/', import.meta.url),
    ),
    gitVersion: await checkGitVersion(),
  });
  try {
    await page.goto(server.url);
    await expect(page.getByRole('alert')).toContainText(
      'Abra a ferramenta pelo comando',
    );
    await expect(
      page.getByRole('button', { name: 'Encerrar sessão' }),
    ).toHaveCount(0);
  } finally {
    await server.stop();
  }
});
