import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { startLocalServer, createReview } from '@gpeek/server';
import { checkGitVersion, openRepository } from '@gpeek/git';
import { createRepositoryFixture } from '../fixtures/repository.ts';

test('reviews a local branch against origin/main with unified and split diff @smoke', async ({
  page,
}) => {
  const fixture = await createRepositoryFixture();
  let server;
  try {
    server = await startLocalServer({
      assetsDirectory: fileURLToPath(
        new URL('../../apps/web/dist/', import.meta.url),
      ),
      gitVersion: await checkGitVersion(),
      review: createReview(await openRepository(fixture.repo)),
    });
    await page.goto(server.bootstrapUrl);
    await page
      .getByLabel('Branch base', { exact: true })
      .selectOption('refs/remotes/origin/main');
    await page
      .getByLabel('Branch de trabalho', { exact: true })
      .selectOption('refs/heads/feature');
    await page
      .getByRole('button', { name: 'Comparar branches', exact: true })
      .click();
    const panel = page.getByRole('region', { name: 'Diff do arquivo' });
    await expect(panel.locator('.addition pre')).toHaveText('feature');
    await expect(panel.locator('.deletion pre')).toHaveText('base');
    await expect(
      page.getByRole('button', { name: /hello.txt/ }),
    ).toHaveAttribute('aria-pressed', 'true');
    await page
      .getByLabel('Visualização', { exact: true })
      .selectOption('split');
    await expect(
      panel.getByRole('columnheader', { name: 'Depois', exact: true }),
    ).toBeVisible();
    await expect(panel.locator('.addition pre')).toHaveText('feature');
    await page.getByLabel('Filtrar arquivos', { exact: true }).fill('missing');
    await expect(
      page.getByText('Nenhum arquivo corresponde ao filtro.'),
    ).toBeVisible();
    await page
      .getByLabel('Branch de trabalho', { exact: true })
      .selectOption('refs/heads/main');
    await page
      .getByRole('button', { name: 'Comparar branches', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Nenhuma diferença encontrada' }),
    ).toBeVisible();
    expect(await fixture.git(['symbolic-ref', 'HEAD'])).toBe(
      'refs/heads/feature',
    );
    expect(await fixture.git(['status', '--porcelain'])).toBe('');
  } finally {
    await server?.stop();
    await fixture.dispose();
  }
});
