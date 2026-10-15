import { randomUUID } from 'node:crypto';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createReviewService } from '../../packages/core/src/index.js';
import { openRepository } from '../../packages/git/src/index.js';
import { conflictAnalysisSchema } from '../../packages/contracts/src/index.js';
import { createRepositoryFixture } from '../fixtures/repository.js';

it('simulates clean and conflicted merges with stable commits, isolated config and untouched repository data', async () => {
  const fixture = await createRepositoryFixture();
  try {
    const review = createReviewService(
      await openRepository(fixture.repo),
      randomUUID,
    );
    const input = {
      baseRef: 'refs/heads/main',
      headRef: 'refs/heads/feature',
      mode: 'direct' as const,
      ignoreWhitespace: true,
    };
    const clean = await review.compare(input);
    expect(
      conflictAnalysisSchema.parse(await review.conflicts(clean.id)).clean,
    ).toBe(true);
    await writeFile(
      join(fixture.repo, '.gitattributes'),
      'hello.txt merge=untrusted\n',
    );
    await fixture.git(['add', '.']);
    await fixture.git(['commit', '-m', 'attributes']);
    await fixture.git(['switch', 'main']);
    await writeFile(
      join(fixture.repo, 'hello.txt'),
      '<script>untrusted</script>\n',
    );
    await writeFile(
      join(fixture.repo, '.gitattributes'),
      'hello.txt merge=untrusted\n',
    );
    await fixture.git(['add', '.']);
    await fixture.git(['commit', '-m', 'base divergence']);
    // A driver that would resolve everything must not influence the isolated merge.
    await fixture.git(['config', 'merge.untrusted.driver', 'true']);
    await fixture.git(['switch', 'feature']);
    const comparison = await review.compare(input);
    await writeFile(join(fixture.repo, 'hello.txt'), 'staged change\n');
    await fixture.git(['add', 'hello.txt']);
    await writeFile(join(fixture.repo, 'hello.txt'), 'unstaged change\n');
    await writeFile(join(fixture.repo, 'untracked.txt'), 'preserve\n');
    const index = await readFile(join(fixture.repo, '.git/index'));
    const status = await fixture.git(['status', '--porcelain=v1']);
    const objects = await readdir(join(fixture.repo, '.git/objects'), {
      recursive: true,
    });
    const refs = await fixture.git(['show-ref']);
    const result = conflictAnalysisSchema.parse(
      await review.conflicts(comparison.id),
    );
    expect(result.clean).toBe(false);
    expect(
      result.messages.some((item) => item.type === 'CONFLICT (contents)'),
    ).toBe(true);
    expect(result.files[0]?.path).toBe('hello.txt');
    expect(result.files[0]?.content).toContain('<<<<<<<');
    expect(result.files[0]?.content).toContain('|||||||');
    expect(result.files[0]?.content).toContain('<script>untrusted</script>');
    expect(result.files[0]?.content).toContain('feature');
    expect(await readFile(join(fixture.repo, '.git/index'))).toEqual(index);
    expect(await fixture.git(['status', '--porcelain=v1'])).toBe(status);
    expect(await fixture.git(['show-ref'])).toBe(refs);
    expect(
      await readdir(join(fixture.repo, '.git/objects'), { recursive: true }),
    ).toEqual(objects);
    expect(await readFile(join(fixture.repo, 'hello.txt'), 'utf8')).toBe(
      'unstaged change\n',
    );
    await fixture.git(['update-ref', 'refs/heads/main', comparison.headCommit]);
    expect(await review.conflicts(comparison.id)).toEqual(result);
    expect((await review.conflicts(clean.id)).clean).toBe(true);
    await expect(review.conflicts(randomUUID())).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    const controller = new AbortController();
    controller.abort();
    await expect(
      review.conflicts(comparison.id, controller.signal),
    ).rejects.toMatchObject({ code: 'CANCELLED' });
  } finally {
    await fixture.dispose();
  }
});

it('reports binary and modify/delete conflicts without pretending they are empty text', async () => {
  const fixture = await createRepositoryFixture();
  try {
    await writeFile(join(fixture.repo, 'binary.dat'), Buffer.from([0, 1]));
    await fixture.git(['add', '.']);
    await fixture.git(['commit', '-m', 'binary ancestor']);
    await fixture.git(['branch', 'conflict-base']);
    await writeFile(join(fixture.repo, 'binary.dat'), Buffer.from([0, 2]));
    await fixture.git(['commit', '-am', 'binary head']);
    await fixture.git(['switch', 'conflict-base']);
    await writeFile(join(fixture.repo, 'binary.dat'), Buffer.from([0, 3]));
    await fixture.git(['rm', 'hello.txt']);
    await fixture.git(['commit', '-am', 'base delete']);
    await fixture.git(['switch', 'feature']);
    await writeFile(join(fixture.repo, 'hello.txt'), 'head modified\n');
    await fixture.git(['commit', '-am', 'head modify']);
    const review = createReviewService(
      await openRepository(fixture.repo),
      randomUUID,
    );
    const comparison = await review.compare({
      baseRef: 'refs/heads/conflict-base',
      headRef: 'refs/heads/feature',
      mode: 'direct',
      ignoreWhitespace: false,
    });
    const result = await review.conflicts(comparison.id);
    expect(result.clean).toBe(false);
    expect(
      result.files.find((file) => file.path === 'binary.dat')?.notice,
    ).toContain('binário');
    expect(
      result.messages.some((item) => item.type.includes('modify/delete')),
    ).toBe(true);
    expect(
      result.files.find((file) => file.path === 'hello.txt')?.content,
    ).toBe('head modified\n');
  } finally {
    await fixture.dispose();
  }
});

it('preserves special paths and diagnoses rename/rename conflicts', async () => {
  const fixture = await createRepositoryFixture();
  try {
    const special =
      process.platform === 'win32'
        ? 'renamed espaço.txt'
        : 'renamed\t espaço\n.txt';
    await fixture.git(['switch', 'main']);
    await fixture.git(['branch', '-f', 'feature', 'main']);
    await fixture.git(['switch', 'feature']);
    await fixture.git(['mv', 'hello.txt', special]);
    await fixture.git(['commit', '-m', 'head rename']);
    await fixture.git(['switch', 'main']);
    await fixture.git(['mv', 'hello.txt', 'base-name.txt']);
    await fixture.git(['commit', '-m', 'base rename']);
    const review = createReviewService(
      await openRepository(fixture.repo),
      randomUUID,
    );
    const comparison = await review.compare({
      baseRef: 'refs/heads/main',
      headRef: 'refs/heads/feature',
      mode: 'direct',
      ignoreWhitespace: false,
    });
    const result = await review.conflicts(comparison.id);
    expect(result.clean).toBe(false);
    expect(
      result.messages.some(
        (message) =>
          message.type.includes('rename/rename') &&
          message.paths.includes(special),
      ),
    ).toBe(true);
    expect(result.files.some((file) => file.path === special)).toBe(true);
  } finally {
    await fixture.dispose();
  }
});
