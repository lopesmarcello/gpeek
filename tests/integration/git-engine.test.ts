import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { writeFile, rename, chmod, symlink, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createReviewService,
  DomainError,
} from '../../packages/core/src/index.js';
import { openRepository } from '../../packages/git/src/index.js';
import { createRepositoryFixture } from '../fixtures/repository.js';
async function setup() {
  const fixture = await createRepositoryFixture();
  const repository = await openRepository(fixture.repo);
  return {
    ...fixture,
    repository,
    review: createReviewService(repository, randomUUID),
  };
}
const input = {
  baseRef: 'refs/remotes/origin/main',
  headRef: 'refs/heads/feature',
  mode: 'merge-base' as const,
  ignoreWhitespace: false,
};
describe('Git branch comparison with real repositories', () => {
  it('distinguishes local/remote refs, compares diverged branches in both modes and preserves working tree', async () => {
    const fixture = await setup();
    try {
      await fixture.git(['switch', 'main']);
      await writeFile(join(fixture.repo, 'base-only.txt'), 'base change\n');
      await fixture.git(['add', '.']);
      await fixture.git(['commit', '-m', 'base advance']);
      await fixture.git(['switch', 'feature']);
      await writeFile(join(fixture.repo, 'untracked.txt'), 'do not touch');
      const before = await fixture.git(['status', '--porcelain']);
      const info = await fixture.review.info();
      expect(info.currentRef).toBe('refs/heads/feature');
      expect(
        info.refs.find((ref) => ref.name === 'refs/remotes/origin/main')?.kind,
      ).toBe('remote');
      const branch = await fixture.review.compare({
        ...input,
        baseRef: 'refs/heads/main',
      });
      expect(branch.files.map((file) => file.newPath)).toEqual(['hello.txt']);
      const direct = await fixture.review.compare({
        ...input,
        baseRef: 'refs/heads/main',
        mode: 'direct',
      });
      expect(direct.files.map((file) => [file.newPath, file.status])).toEqual([
        ['base-only.txt', 'D'],
        ['hello.txt', 'M'],
      ]);
      // Both snapshots remain usable after another comparison and a moving branch.
      const oldFile = branch.files[0]!;
      await writeFile(join(fixture.repo, 'hello.txt'), 'later commit\n');
      await fixture.git(['commit', '-am', 'later']);
      const diff = await fixture.review.file(branch.id, oldFile.id);
      expect(
        diff.hunks[0]?.lines.map((line) => [
          line.kind,
          line.text,
          line.oldLine,
          line.newLine,
        ]),
      ).toEqual([
        ['deletion', 'base', 1, null],
        ['addition', 'feature', null, 1],
      ]);
      expect(branch.headCommit).not.toBe(
        await fixture.git(['rev-parse', 'HEAD']),
      );
      expect(await fixture.git(['symbolic-ref', 'HEAD'])).toBe(
        'refs/heads/feature',
      );
      expect(await fixture.git(['status', '--porcelain'])).toBe(before);
      expect(await readFile(join(fixture.repo, 'untracked.txt'), 'utf8')).toBe(
        'do not touch',
      );
    } finally {
      await fixture.dispose();
    }
  });
  it('handles rename paths, added/deleted/empty files, binary, symlinks and mode changes', async () => {
    const fixture = await setup();
    try {
      await writeFile(join(fixture.repo, 'old name.txt'), 'one\ntwo\nthree\n');
      await writeFile(join(fixture.repo, 'delete.txt'), 'removed\n');
      await fixture.git(['add', '.']);
      await fixture.git(['commit', '-m', 'before edge cases']);
      const before = await fixture.git(['rev-parse', 'HEAD']);
      await fixture.git(['branch', 'edge-base', before]);
      const path =
        process.platform === 'win32' ? 'new espaço.txt' : 'new\t espaço\n.txt';
      await rename(
        join(fixture.repo, 'old name.txt'),
        join(fixture.repo, path),
      );
      await fixture.git(['rm', '--', 'delete.txt']);
      await writeFile(join(fixture.repo, 'empty.txt'), '');
      await writeFile(
        join(fixture.repo, 'binary.dat'),
        Buffer.from([0, 1, 2, 3]),
      );
      await writeFile(join(fixture.repo, 'newline.txt'), 'no newline');
      if (process.platform !== 'win32') {
        await chmod(join(fixture.repo, 'hello.txt'), 0o755);
        await symlink('hello.txt', join(fixture.repo, 'link'));
      }
      await fixture.git(['add', '.']);
      await fixture.git(['commit', '-m', 'edge cases']);
      const result = await fixture.review.compare({
        ...input,
        baseRef: 'refs/heads/edge-base',
      });
      const renamed = result.files.find((file) => file.newPath === path)!;
      expect(renamed.status).toBe('R100');
      expect(renamed.oldPath).toBe('old name.txt');
      expect(
        (await fixture.review.file(result.id, renamed.id)).notice,
      ).toContain('metadados');
      const binary = result.files.find(
        (file) => file.newPath === 'binary.dat',
      )!;
      expect(binary.kind).toBe('binary');
      expect(
        (await fixture.review.file(result.id, binary.id)).notice,
      ).toContain('binário');
      const deleted = result.files.find(
        (file) => file.newPath === 'delete.txt',
      )!;
      expect(deleted.status).toBe('D');
      expect(
        (await fixture.review.file(result.id, deleted.id)).hunks[0]?.lines[0]
          ?.text,
      ).toBe('removed');
      const noNewline = result.files.find(
        (file) => file.newPath === 'newline.txt',
      )!;
      expect(
        (await fixture.review.file(result.id, noNewline.id)).hunks[0]?.lines.at(
          -1,
        )?.kind,
      ).toBe('note');
      expect(
        result.files.find((file) => file.newPath === 'empty.txt')?.status,
      ).toBe('A');
      if (process.platform !== 'win32') {
        expect(
          result.files.find((file) => file.newPath === 'link')?.newMode,
        ).toBe('120000');
        expect(
          result.files.find((file) => file.newPath === 'hello.txt')?.newMode,
        ).toBe('100755');
      }
    } finally {
      await fixture.dispose();
    }
  });
  it('offers direct comparison for unrelated histories and rejects ambiguous merge bases', async () => {
    const fixture = await setup();
    try {
      const tree = await fixture.git(['rev-parse', 'HEAD^{tree}']);
      const ancestor = await fixture.git(['rev-parse', 'main']);
      const unrelated = await fixture.git([
        'commit-tree',
        tree,
        '-m',
        'unrelated',
      ]);
      await fixture.git(['update-ref', 'refs/heads/unrelated', unrelated]);
      await expect(
        fixture.review.compare({ ...input, baseRef: 'refs/heads/unrelated' }),
      ).rejects.toMatchObject({ code: 'NO_MERGE_BASE' });
      expect(
        (
          await fixture.review.compare({
            ...input,
            baseRef: 'refs/heads/unrelated',
            mode: 'direct',
          })
        ).files,
      ).toEqual([]);
      const a = await fixture.git([
        'commit-tree',
        tree,
        '-p',
        ancestor,
        '-m',
        'A',
      ]);
      const b = await fixture.git([
        'commit-tree',
        tree,
        '-p',
        ancestor,
        '-m',
        'B',
      ]);
      const c = await fixture.git([
        'commit-tree',
        tree,
        '-p',
        a,
        '-p',
        b,
        '-m',
        'C',
      ]);
      const d = await fixture.git([
        'commit-tree',
        tree,
        '-p',
        b,
        '-p',
        a,
        '-m',
        'D',
      ]);
      await fixture.git(['update-ref', 'refs/heads/criss-a', c]);
      await fixture.git(['update-ref', 'refs/heads/criss-b', d]);
      await expect(
        fixture.review.compare({
          ...input,
          baseRef: 'refs/heads/criss-a',
          headRef: 'refs/heads/criss-b',
        }),
      ).rejects.toMatchObject({ code: 'AMBIGUOUS_BASE' });
      await expect(
        fixture.review.compare({ ...input, headRef: '--help' }),
      ).rejects.toMatchObject({ code: 'REF_NOT_FOUND' });
      await expect(
        fixture.review.file(randomUUID(), randomUUID()),
      ).rejects.toBeInstanceOf(DomainError);
    } finally {
      await fixture.dispose();
    }
  });
  it('fetches only an enumerated local remote, preserves HEAD and keeps snapshots stable', async () => {
    const fixture = await setup();
    try {
      const snapshot = await fixture.review.compare(input);
      const originalHead = await fixture.git(['rev-parse', 'HEAD']);
      await fixture.git(['push', 'origin', 'feature:main']);
      const info = await fixture.review.fetch('origin');
      expect(info.lastFetch).not.toBeNull();
      expect(await fixture.git(['rev-parse', 'origin/main'])).toBe(
        originalHead,
      );
      expect(await fixture.git(['rev-parse', 'HEAD'])).toBe(originalHead);
      expect(
        (await fixture.review.file(snapshot.id, snapshot.files[0]!.id)).hunks[0]
          ?.lines[1]?.text,
      ).toBe('feature');
      await expect(
        fixture.review.fetch('--upload-pack=evil'),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    } finally {
      await fixture.dispose();
    }
  });
  it('ignores whitespace without losing metadata and reports content limits/encoding', async () => {
    const fixture = await setup();
    try {
      await writeFile(join(fixture.repo, 'hello.txt'), 'base   \n');
      await writeFile(join(fixture.repo, 'large.txt'), 'x'.repeat(600000));
      await writeFile(join(fixture.repo, 'latin.txt'), Buffer.from([0xe9, 10]));
      await fixture.git(['add', '.']);
      await fixture.git(['commit', '-m', 'limits']);
      const result = await fixture.review.compare({
        ...input,
        ignoreWhitespace: true,
      });
      const white = result.files.find((file) => file.newPath === 'hello.txt');
      if (white)
        expect((await fixture.review.file(result.id, white.id)).hunks).toEqual(
          [],
        );
      const large = result.files.find((file) => file.newPath === 'large.txt')!;
      expect((await fixture.review.file(result.id, large.id)).notice).toContain(
        '512 KiB',
      );
      const latin = result.files.find((file) => file.newPath === 'latin.txt')!;
      expect((await fixture.review.file(result.id, latin.id)).notice).toContain(
        'UTF-8',
      );
      const controller = new AbortController();
      controller.abort();
      await expect(
        fixture.review.info(controller.signal),
      ).rejects.toMatchObject({ code: 'CANCELLED' });
    } finally {
      await fixture.dispose();
    }
  });
});

it('handles gitlinks, CRLF and byte paths without reading the working tree', async () => {
  const fixture = await setup();
  try {
    const commit = await fixture.git(['rev-parse', 'HEAD']);

    await writeFile(join(fixture.repo, 'crlf.txt'), 'one\r\ntwo\r\n');
    await fixture.git(['add', '.']);
    // Store the byte path in Git's index: macOS/Windows filesystems cannot
    // represent this name, but Git trees can on every supported platform.
    const blob = await fixture.git(
      ['hash-object', '-w', '--stdin'],
      fixture.repo,
      Buffer.from('byte path\n'),
    );
    await fixture.git(
      ['update-index', '-z', '--index-info'],
      fixture.repo,
      Buffer.concat([
        Buffer.from(`100644 ${blob}\t`),
        Buffer.from([0xff]),
        Buffer.from('.txt\0'),
      ]),
    );
    await fixture.git([
      'update-index',
      '--add',
      '--cacheinfo',
      `160000,${commit},module`,
    ]);
    await fixture.git(['commit', '-m', 'gitlink and encoding']);
    const result = await fixture.review.compare(input);
    const module = result.files.find((file) => file.newPath === 'module')!;
    expect(module.kind).toBe('submodule');
    expect((await fixture.review.file(result.id, module.id)).notice).toContain(
      'Submódulo',
    );
    const crlf = result.files.find((file) => file.newPath === 'crlf.txt')!;
    expect(
      (await fixture.review.file(result.id, crlf.id)).hunks[0]?.lines[0]?.text,
    ).toBe('one\r');
    const file = result.files.find((item) => item.pathEncoding === 'lossy')!;
    expect(file).toBeDefined();
    expect(
      (await fixture.review.file(result.id, file.id)).hunks[0]?.lines[0]?.text,
    ).toBe('byte path');
  } finally {
    await fixture.dispose();
  }
});

it('diagnoses missing merge bases in a shallow clone without fetching implicitly', async () => {
  const fixture = await setup();
  try {
    await fixture.git(['push', 'origin', 'feature:main']);
    const shallow = join(fixture.root, 'shallow');
    await fixture.git([
      'clone',
      '--depth=1',
      '--no-local',
      pathToFileURL(fixture.remote).href,
      shallow,
    ]);
    const tree = await fixture.git(['rev-parse', 'HEAD^{tree}'], shallow);
    const orphan = await fixture.git(
      ['commit-tree', tree, '-m', 'unrelated'],
      shallow,
    );
    await fixture.git(['update-ref', 'refs/heads/unrelated', orphan], shallow);
    const review = createReviewService(
      await openRepository(shallow),
      randomUUID,
    );
    expect((await review.info()).shallow).toBe(true);
    await expect(
      review.compare({
        ...input,
        baseRef: 'refs/heads/unrelated',
        headRef: 'refs/heads/main',
      }),
    ).rejects.toMatchObject({ code: 'INCOMPLETE_HISTORY' });
    expect(
      (
        await review.compare({
          ...input,
          baseRef: 'refs/heads/unrelated',
          headRef: 'refs/heads/main',
          mode: 'direct',
        })
      ).files,
    ).toEqual([]);
  } finally {
    await fixture.dispose();
  }
});

it('reports a line rendering limit without presenting a large diff as empty', async () => {
  const fixture = await setup();
  try {
    await writeFile(
      join(fixture.repo, 'many-lines.txt'),
      'line\n'.repeat(10001),
    );
    await fixture.git(['add', '.']);
    await fixture.git(['commit', '-m', 'line limit']);
    const comparison = await fixture.review.compare(input);
    const file = comparison.files.find(
      (item) => item.newPath === 'many-lines.txt',
    )!;
    expect(file.additions).toBe(10001);
    expect(
      (await fixture.review.file(comparison.id, file.id)).notice,
    ).toContain('10.000 linhas');
  } finally {
    await fixture.dispose();
  }
});
