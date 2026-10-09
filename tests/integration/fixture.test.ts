import { expect, it } from 'vitest';
import { createRepositoryFixture } from '../fixtures/repository.js';
it('creates an isolated repository with a local bare remote and deterministic commits', async () => {
  const first = await createRepositoryFixture();
  try {
    const second = await createRepositoryFixture();
    try {
      expect(await first.git(['rev-parse', 'HEAD'])).toBe(
        await second.git(['rev-parse', 'HEAD']),
      );
      expect(await first.git(['show', 'origin/main:hello.txt'])).toBe('base');
      expect(await first.git(['show', 'feature:hello.txt'])).toBe('feature');
      expect(await first.git(['status', '--porcelain'])).toBe('');
    } finally {
      await second.dispose();
    }
  } finally {
    await first.dispose();
  }
});
