import { describe, expect, it } from 'vitest';
import {
  bootstrapSchema,
  compareInputSchema,
  fetchInputSchema,
  sessionSchema,
} from '../../packages/contracts/src/index.js';
describe('API contracts', () => {
  it('rejects unknown properties and invalid bootstrap input', () => {
    expect(
      bootstrapSchema.safeParse({ token: 'a'.repeat(64), command: 'git reset' })
        .success,
    ).toBe(false);
    expect(bootstrapSchema.safeParse({ token: 42 }).success).toBe(false);
    expect(bootstrapSchema.safeParse({ token: 'a'.repeat(64) }).success).toBe(
      true,
    );
  });
  it('rejects incompatible server responses', () => {
    expect(
      sessionSchema.safeParse({
        application: 'gpeek',
        phase: 'ready',
        gitVersion: 'git version 2',
      }).success,
    ).toBe(false);
  });
});

it('validates comparison options and forbids arbitrary command fields', () => {
  const valid = {
    baseRef: 'refs/remotes/origin/main',
    headRef: 'refs/heads/feature',
    mode: 'merge-base',
    ignoreWhitespace: false,
  };
  expect(compareInputSchema.safeParse(valid).success).toBe(true);
  expect(
    compareInputSchema.safeParse({ ...valid, mode: 'merge' }).success,
  ).toBe(false);
  expect(
    compareInputSchema.safeParse({ ...valid, command: 'git reset' }).success,
  ).toBe(false);
  expect(
    fetchInputSchema.safeParse({ remote: 'origin', url: 'file:///tmp/other' })
      .success,
  ).toBe(false);
});
