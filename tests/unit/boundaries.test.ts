import { describe, expect, it } from 'vitest';
import { violation, checkBoundaries } from '../../scripts/boundaries.mjs';
describe('architecture boundaries', () => {
  it.each([
    ['core', 'node:fs'],
    ['core', 'react'],
    ['core', '@gpeek/git'],
    ['web', '@gpeek/server'],
    ['web', '../../../packages/git/src/index.ts'],
    ['contracts', 'node:http'],
  ])('rejects %s → %s', (project, dependency) => {
    expect(violation(project, dependency)).toBeTruthy();
  });
  it('allows the adapters to depend on core and the UI on contracts', () => {
    expect(violation('git', '@gpeek/core')).toBeUndefined();
    expect(violation('web', '@gpeek/contracts')).toBeUndefined();
  });
  it('checks real source files and package manifests', async () => {
    expect(await checkBoundaries()).toEqual([]);
  });
});
