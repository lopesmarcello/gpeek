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
  let failNextSave = false;
  const longLines = [
    '  ' + 'Documentação longa com espaços. '.repeat(80),
    'https://example.invalid/' + 'x'.repeat(2000),
  ];
  try {
    await mkdir(join(fixture.repo, 'src/components'), { recursive: true });
    await writeFile(
      join(fixture.repo, 'src/components/button.ts'),
      '/* multiline\n * comment */\nexport const button = "<img src=x onerror=window.untrusted=true>";\n',
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
      else if (/^\/api\/comparisons\/[^/]+\/conflicts$/.test(path))
        data = await review.conflicts(path.split('/')[3]);
      else if (
        /^\/api\/comparisons\/[^/]+\/annotations(?:\/[^/]+)?$/.test(path)
      ) {
        const parts = path.split('/');
        if (request.method() === 'POST') {
          if (failNextSave) {
            failNextSave = false;
            await route.fulfill({
              status: 500,
              contentType: 'application/json',
              body: '{}',
            });
            return;
          }
          data = request.postDataJSON();
          await review.annotate(parts[3], parts[5], JSON.stringify(data));
        } else {
          const saved = await review.annotations(parts[3]);
          data = Object.fromEntries(
            Object.entries(saved).map(([id, raw]) => [
              id,
              raw ? JSON.parse(raw) : { ok: false, comments: [] },
            ]),
          );
        }
      } else if (path.startsWith('/api/comparisons/')) {
        const parts = path.split('/');
        data = await review.file(
          parts[3],
          parts[5],
          undefined,
          new URL(request.url()).searchParams.get('context') === 'full',
        );
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
    await page.getByLabel('Filtrar arquivos', { exact: true }).fill('A');
    await page.keyboard.press('Shift+A');
    await expect(
      page.getByRole('checkbox', { name: 'Arquivo OK', exact: true }),
    ).not.toBeChecked();
    await page.getByLabel('Filtrar arquivos', { exact: true }).fill('');
    await page.locator('.file-header h2').click();
    await page.keyboard.press('Shift+A');
    await expect(
      page.getByRole('checkbox', { name: 'Arquivo OK', exact: true }),
    ).toBeChecked();
    await page.keyboard.press('Shift+A');
    await expect(
      page.getByRole('checkbox', { name: 'Arquivo OK', exact: true }),
    ).toBeChecked();
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
    expect(markdown).not.toContain(personalText);
    expect(markdown).toContain('Nenhuma observação pendente.');
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

    // The two versions share a line number but must keep independent notes.
    const before = page.getByRole('region', {
      name: 'Comentários da linha 1 · antes',
      exact: true,
    });
    const after = page.getByRole('region', {
      name: 'Comentários da linha 1 · depois',
      exact: true,
    });
    await page.locator('.deletion .code').click();
    await expect(before.getByLabel('Seu comentário')).toBeFocused();
    await before
      .getByLabel('Seu comentário')
      .fill('Rever implementação removida');
    await before
      .getByRole('button', { name: 'Adicionar comentário', exact: true })
      .click();
    const newLine = page.getByRole('button', {
      name: 'Comentar linha 1 · depois',
      exact: true,
    });
    await newLine.focus();
    await page.keyboard.press('Enter');
    await expect(after.getByLabel('Seu comentário')).toBeFocused();
    await after.getByLabel('Seu comentário').fill('rascunho cancelado');
    await after.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(after).toHaveCount(0);
    await page.locator('.addition .code').click();
    const lineText =
      '<img src=x onerror=window.untrusted=true> Rever implementação nova';
    await after.getByLabel('Seu comentário').fill(lineText);
    await after
      .getByRole('button', { name: 'Adicionar comentário', exact: true })
      .click();
    await expect(before.locator('.personal-comments p')).toHaveText(
      'Rever implementação removida',
    );
    await expect(after.locator('.personal-comments p')).toHaveText(lineText);
    await expect(after.locator('img')).toHaveCount(0);
    await page
      .getByRole('button', { name: 'Visualizar arquivo completo', exact: true })
      .click();
    await expect(
      page.getByText('Arquivo completo · Antes / Depois dos commits', {
        exact: false,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Ver apenas alterações', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await page
      .getByRole('button', { name: 'Ver apenas alterações', exact: true })
      .click();
    await expect(
      page.getByRole('button', {
        name: 'Visualizar arquivo completo',
        exact: true,
      }),
    ).toHaveAttribute('aria-pressed', 'false');
    await page
      .getByRole('button', { name: 'Lado a lado', exact: true })
      .click();
    await expect(before.locator('.personal-comments p')).toHaveText(
      'Rever implementação removida',
    );
    await expect(after.locator('.personal-comments p')).toHaveText(lineText);
    await page.screenshot({
      path: 'test-results/line-comments-split.png',
      fullPage: true,
    });
    await page.reload();
    await page
      .getByLabel('Branch base', { exact: true })
      .selectOption('refs/remotes/origin/main');
    await page
      .getByLabel('Branch de trabalho', { exact: true })
      .selectOption('refs/heads/feature');
    await page
      .getByRole('button', { name: 'Comparar branches', exact: true })
      .click();
    await expect(before.locator('.personal-comments p')).toHaveText(
      'Rever implementação removida',
    );
    await expect(after.locator('.personal-comments p')).toHaveText(lineText);
    const inlineDownloadReady = page.waitForEvent('download');
    await page
      .getByRole('button', { name: 'Exportar revisão (.md)', exact: true })
      .click();
    const inlineMarkdown = await readFile(
      await (await inlineDownloadReady).path(),
      'utf8',
    );
    expect(inlineMarkdown).toContain('Linha 1 · Antes');
    expect(inlineMarkdown).toContain('Linha 1 · Depois');
    expect(inlineMarkdown).toContain(lineText);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: 'test-results/line-comments-mobile.png',
      fullPage: true,
    });
    expect(
      await page
        .locator('.diff-scroll')
        .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
    ).toBe(true);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await before
      .getByRole('button', {
        name: 'Excluir comentário da linha 1',
        exact: true,
      })
      .click();
    await expect(before).toHaveCount(0);
    await expect(after.locator('.personal-comments p')).toHaveText(lineText);
    await after
      .getByRole('button', {
        name: 'Excluir comentário da linha 1',
        exact: true,
      })
      .click();
    await expect(after).toHaveCount(0);

    await page
      .getByRole('button', { name: 'Lado a lado', exact: true })
      .click();
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
    for (const mode of ['unified', 'split']) {
      await page
        .getByRole('button', {
          name: mode === 'unified' ? 'Unificado' : 'Lado a lado',
          exact: true,
        })
        .click();
      await expect(page.locator('.code .hljs-keyword').first()).toHaveText(
        'export',
      );
      await expect(page.locator('.code .hljs-comment').nth(1)).toHaveText(
        ' * comment */',
      );
      await expect(page.locator('.code .hljs-string')).toHaveText(
        '"<img src=x onerror=window.untrusted=true>"',
      );
      await expect(page.locator('.code img')).toHaveCount(0);
      expect(await page.evaluate(() => window.untrusted)).toBeUndefined();
      await page.screenshot({
        path: `test-results/syntax-${mode}.png`,
        fullPage: true,
      });
    }
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
          .getByRole('button', {
            name: view === 'unified' ? 'Unificado' : 'Lado a lado',
            exact: true,
          })
          .click();
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
    await page
      .getByLabel('Filtrar arquivos', { exact: true })
      .fill('hello.txt');
    await page
      .getByRole('button', { name: 'hello.txt — Modificado', exact: true })
      .click();
    await page.getByText('Comentários pessoais (0)', { exact: true }).click();
    await page
      .getByLabel('Seu comentário', { exact: true })
      .fill('Preservar nota na aprovação em lote');
    await page
      .getByRole('button', { name: 'Adicionar comentário', exact: true })
      .click();
    // Bulk approval keeps selected files across filters and preserves their notes.
    await page
      .getByLabel('Filtrar arquivos', { exact: true })
      .fill('src/components');
    await page
      .getByRole('button', { name: 'Selecionar visíveis', exact: true })
      .click();
    await page
      .getByLabel('Filtrar arquivos', { exact: true })
      .fill('hello.txt');
    await page
      .getByRole('checkbox', {
        name: 'Selecionar hello.txt para aprovação',
        exact: true,
      })
      .check();
    await page
      .getByRole('button', { name: 'Aprovar selecionados (3)', exact: true })
      .click();
    await expect(page.locator('.review-storage')).toContainText('3 de');
    await expect(page.locator('.personal-comments p')).toHaveText(
      'Preservar nota na aprovação em lote',
    );
    await expect(
      page.getByRole('button', {
        name: 'Aprovar selecionados (0)',
        exact: true,
      }),
    ).toBeDisabled();
    await page.getByLabel('Filtrar arquivos', { exact: true }).fill('');
    await page
      .getByRole('button', { name: 'Comparar branches', exact: true })
      .click();
    await expect(page.locator('.review-storage')).toContainText('3 de');
    await expect(
      page.getByRole('checkbox', { name: 'Arquivo OK', exact: true }),
    ).toBeChecked();
    // A later successful file save must not hide an earlier batch failure.
    failNextSave = true;
    await page
      .getByLabel('Filtrar arquivos', { exact: true })
      .fill('src/components');
    await page
      .getByRole('button', { name: 'Selecionar visíveis', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Aprovar selecionados (2)', exact: true })
      .click();
    await expect(
      page.getByText(
        'Não foi possível salvar toda a revisão local. As alterações não salvas ficam apenas nesta aba.',
        { exact: true },
      ),
    ).toBeVisible();
    await page.getByLabel('Filtrar arquivos', { exact: true }).fill('');
    await page
      .getByRole('button', { name: 'Analisar conflitos', exact: true })
      .click();
    await expect(
      page.getByText('Nenhum conflito encontrado para estes commits.', {
        exact: true,
      }),
    ).toBeVisible();
    await fixture.git(['switch', 'main']);
    await writeFile(
      join(fixture.repo, 'hello.txt'),
      '<img src=x onerror=window.conflictUnsafe=true>\n',
    );
    await fixture.git(['commit', '-am', 'conflicting base']);
    await page
      .getByLabel('Branch base', { exact: true })
      .selectOption('refs/heads/main');
    await page
      .getByRole('button', { name: 'Comparar branches', exact: true })
      .click();
    await expect(
      page.getByText('Nenhum conflito encontrado para estes commits.', {
        exact: true,
      }),
    ).toHaveCount(0);
    await page
      .getByRole('button', { name: 'Analisar conflitos', exact: true })
      .click();
    await expect(page.locator('.conflicts')).toContainText(
      'Conflitos encontrados',
    );
    await page
      .locator('.conflicts summary')
      .filter({ hasText: 'hello.txt' })
      .click();
    await expect(page.locator('.conflict-content')).toContainText('<<<<<<<');
    await expect(page.locator('.conflict-content')).toContainText('feature');
    await expect(page.locator('.conflict-content img')).toHaveCount(0);
    expect(await page.evaluate(() => window.conflictUnsafe)).toBeUndefined();
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(
        await page
          .locator('.conflict-content')
          .evaluate(
            (element) => element.scrollWidth <= element.clientWidth + 1,
          ),
      ).toBe(true);
      await page.screenshot({
        path: `test-results/conflicts-${width}.png`,
        fullPage: true,
      });
    }
  } finally {
    await fixture.dispose();
  }
});
