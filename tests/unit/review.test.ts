import { expect, it } from 'vitest';
import {
  annotationKey,
  parseAnnotation,
} from '../../apps/web/src/review-notes.js';
import type { Comparison } from '@gpeek/contracts';
it('rejects damaged or oversized browser annotations and preserves literal text', () => {
  for (const raw of [
    '{',
    '{"ok":"yes","comments":[]}',
    '{"ok":true,"comments":[1]}',
    JSON.stringify({ ok: true, comments: ['x'.repeat(10001)] }),
  ])
    expect(parseAnnotation(raw)).toEqual({ ok: false, comments: [] });
  expect(
    parseAnnotation(
      JSON.stringify({ ok: true, comments: ['<script>alert(1)</script>'] }),
    ),
  ).toEqual({ ok: true, comments: ['<script>alert(1)</script>'] });
});
it('isolates review by immutable commits, options and file paths instead of session IDs', () => {
  const comparison = {
    baseCommit: 'a',
    headCommit: 'b',
    fromCommit: 'a',
    mode: 'direct',
    ignoreWhitespace: false,
  } as Comparison;
  const file = {
    oldPath: 'old.md',
    newPath: 'new.md',
    status: 'R',
  } as Comparison['files'][number];
  const key = annotationKey(comparison, file);
  expect(
    annotationKey(
      { ...comparison, id: 'another-session' },
      { ...file, id: 'another-file-id' },
    ),
  ).toBe(key);
  for (const changed of [
    { headCommit: 'c' },
    { baseCommit: 'd' },
    { fromCommit: 'e' },
    { ignoreWhitespace: true },
    { mode: 'merge-base' as const },
  ])
    expect(annotationKey({ ...comparison, ...changed }, file)).not.toBe(key);
  expect(annotationKey(comparison, { ...file, newPath: 'other.md' })).not.toBe(
    key,
  );
});
