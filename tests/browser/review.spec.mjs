// UI smoke without an HTTP listener; API responses come from the real Git engine.
// This supplements, and does not replace, the HTTP end-to-end tests.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { createReview } from '@gpeek/server';
import { openRepository } from '@gpeek/git';
import { createRepositoryFixture } from '../fixtures/repository.ts';
test('renders real branch comparison and responds to review controls', async ({
  page,
}) => {
  const fixture = await createRepositoryFixture();
  const review = createReview(await openRepository(fixture.repo));
  const assets = fileURLToPath(
    new URL('../../apps/web/dist/', import.meta.url),
  );
  const longLines = [
    '  ' + 'Documentação longa com espaços. '.repeat(80),
    'https://example.invalid/' + 'x'.repeat(2000),
  ];
  try {
    await mkdir(join(fixture.repo, 'src/components'), { recursive: true });
    await writeFile(
      join(fixture.repo, 'src/components/button.ts'),
      'export const button = true;\n',
    );
    await writeFile(
      join(fixture.repo, 'src/components/input.ts'),
      'export const input = true;\n',
    );
    await fixture.git(['add', '.']);
    await fixture.git(['commit', '-m', 'nested UI fixture']);
    await mkdir(join(fixture.repo, 'z-docs'), { recursive: true });
    await writeFile(
      join(fixture.repo, 'z-docs/long-lines.md'),
      longLines.join('\n') + '\n',
    );
    await fixture.git(['add', '.']);
    await fixture.git(['commit', '-m', 'long lines fixture']);
    await page.route('http://review.test/**', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      let data;
      if (path === '/api/session')
        data = {
          application: 'gpeek',
          phase: 'bootstrap',
          gitVersion: 'git version fixture',
        };
      else if (path === '/api/repository') data = await review.info();
      else if (path === '/api/comparisons')
        data = await review.compare(request.postDataJSON());
      else if (path.startsWith('/api/comparisons/')) {
        const parts = path.split('/');
        data = await review.file(parts[3], parts[5]);
      } else {
        if (path !== '/' && !/^\/assets\/[a-zA-Z0-9._-]+$/.test(path)) {
          await route.fulfill({ status: 404 });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: path.endsWith('.css')
            ? 'text/css'
            : path.endsWith('.js')
              ? 'text/javascript'
              : 'text/html',
          body: await readFile(
            join(assets, path === '/' ? 'index.html' : path.slice(1)),
          ),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(data),
      });
    });
    await page.goto('http://review.test/');
    await page
      .getByLabel('Branch base', { exact: true })
      .selectOption('refs/remotes/origin/main');
    await page
      .getByLabel('Branch de trabalho', { exact: true })
      .selectOption('refs/heads/feature');
    await page
      .getByRole('button', { name: 'Comparar branches', exact: true })
      .click();
    await expect(page.locator('.addition pre')).toHaveText('feature');
    await expect(page.locator('.deletion pre')).toHaveText('base');
    await page
      .getByRole('checkbox', { name: 'Arquivo OK', exact: true })
      .check();
    await expect(page.locator('.review-storage')).toContainText('1 de');
    await page.getByText('Comentários pessoais (0)', { exact: true }).click();
    const personalText =
      '<script>window.untrusted = true</script> lembrar teste';
    await page.getByLabel('Seu comentário', { exact: true }).fill(personalText);
    await page
      .getByRole('button', { name: 'Adicionar comentário', exact: true })
      .click();
    await expect(page.locator('.personal-comments p')).toHaveText(personalText);
    expect(await page.evaluate(() => window.untrusted)).toBeUndefined();
    const downloadReady = page.waitForEvent('download');
    await page
      .getByRole('button', { name: 'Exportar revisão (.md)', exact: true })
      .click();
    const download = await downloadReady;
    expect(download.suggestedFilename()).toMatch(
      /^gpeek-review-[a-zA-Z0-9]+\.md$/,
    );
    const markdown = await readFile(await download.path(), 'utf8');
    expect(markdown).toContain(personalText);
    expect(markdown).toContain('Revisão: OK');
    expect(markdown).toContain('Commit de trabalho:');

    await page
      .getByRole('button', { name: 'Comparar branches', exact: true })
      .click();
    await expect(
      page.getByRole('checkbox', { name: 'Arquivo OK', exact: true }),
    ).toBeChecked();
    await page.getByText('Comentários pessoais (1)', { exact: true }).click();
    await expect(page.locator('.personal-comments p')).toHaveText(personalText);
    await page
      .getByRole('button', { name: 'Excluir comentário 1', exact: true })
      .click();
    await expect(page.locator('.personal-comments p')).toHaveCount(0);
    await page
      .getByRole('checkbox', { name: 'Arquivo OK', exact: true })
      .uncheck();

    await page
      .getByLabel('Visualização', { exact: true })
      .selectOption('split');
    await expect(
      page.getByRole('columnheader', { name: 'Depois', exact: true }),
    ).toBeVisible();
    const folder = page.getByRole('button', {
      name: 'Pasta src/components',
      exact: true,
    });
    const nestedFile = page.getByRole('button', {
      name: 'src/components/button.ts — Adicionado',
      exact: true,
    });
    await expect(folder).toHaveAttribute('aria-expanded', 'true');
    await expect(nestedFile).toBeVisible();
    await folder.click();
    await expect(folder).toHaveAttribute('aria-expanded', 'false');
    await expect(nestedFile).toHaveCount(0);
    await folder.focus();
    await page.keyboard.press('Enter');
    await expect(nestedFile).toBeVisible();
    await page
      .getByRole('button', { name: 'Recolher todas as pastas' })
      .click();
    await expect(nestedFile).toHaveCount(0);
    await page
      .getByLabel('Filtrar arquivos', { exact: true })
      .fill('button.ts');
    await expect(nestedFile).toBeVisible();
    await expect(
      page.getByRole('button', {
        name: 'src/components/input.ts — Adicionado',
        exact: true,
      }),
    ).toHaveCount(0);
    await nestedFile.click();
    await expect(page.locator('.file-header h2')).toHaveText(
      'src/components/button.ts',
    );
    await page.getByLabel('Filtrar arquivos', { exact: true }).fill('');
    await expect(nestedFile).toHaveAttribute('aria-pressed', 'true');
    await page
      .getByRole('button', { name: 'Expandir todas as pastas' })
      .click();
    await page
      .getByRole('button', {
        name: 'z-docs/long-lines.md — Adicionado',
        exact: true,
      })
      .click();
    await expect(page.locator('.file-header h2')).toHaveText(
      'z-docs/long-lines.md',
    );
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const view of ['unified', 'split']) {
        await page
          .getByLabel('Visualização', { exact: true })
          .selectOption(view);
        const content = page.locator('.addition pre');
        await expect(content).toHaveCount(2);
        expect(
          await content.evaluateAll((elements) =>
            elements.map((element) => element.textContent),
          ),
        ).toEqual(longLines);
        expect(
          await page
            .locator('.diff-scroll')
            .evaluate(
              (element) => element.scrollWidth <= element.clientWidth + 1,
            ),
        ).toBe(true);
        expect(
          await content
            .first()
            .evaluate(
              (element) =>
                element.getBoundingClientRect().height >
                parseFloat(getComputedStyle(element).lineHeight),
            ),
        ).toBe(true);
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: 'test-results/review-desktop.png',
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: 'test-results/review-mobile.png',
      fullPage: true,
    });
  } finally {
    await fixture.dispose();
  }
});
