import { expect, it } from 'vitest';
import { parseAnnotation } from '../../apps/web/src/review-notes.js';
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
it('reads line anchors alongside legacy file comments and rejects invalid anchors', () => {
  const comments = [
    'Existing file note',
    { side: 'old', line: 4, text: 'Removed implementation' },
    { side: 'new', line: 9, text: '<img src=x>New implementation' },
  ];
  expect(parseAnnotation(JSON.stringify({ ok: true, comments }))).toEqual({
    ok: true,
    comments,
  });
  for (const change of [
    { line: 0 },
    { line: -1 },
    { line: 1.5 },
    { line: '1' },
    { side: 'both' },
    { text: '' },
    { line: Number.MAX_SAFE_INTEGER + 1 },
  ]) {
    expect(
      parseAnnotation(
        JSON.stringify({
          ok: false,
          comments: [{ side: 'new', line: 1, text: 'note', ...change }],
        }),
      ),
    ).toEqual({ ok: false, comments: [] });
  }
});
