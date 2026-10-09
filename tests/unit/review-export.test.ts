import { expect, it } from 'vitest';
import type { Comparison } from '@gpeek/contracts';
import { exportReview } from '../../apps/web/src/review-export.js';
const comparison = {
  baseRef: 'refs/remotes/origin/main',
  headRef: 'refs/heads/feature',
  baseCommit: 'base-sha',
  headCommit: 'head-sha',
  fromCommit: 'merge-sha',
  mode: 'merge-base',
  ignoreWhitespace: true,
  files: [
    { id: 'renamed', newPath: 'new.md', oldPath: 'old.md', status: 'R' },
    {
      id: 'approved',
      newPath: 'approved.ts',
      oldPath: 'approved.ts',
      status: 'M',
    },
    {
      id: 'untouched',
      newPath: 'untouched.ts',
      oldPath: 'untouched.ts',
      status: 'M',
    },
  ],
} as Comparison;
it('exports immutable context, renamed files and all annotations while excluding unannotated files', () => {
  const result = exportReview('project', comparison, {
    renamed: {
      ok: false,
      comments: ['Verificar validação', 'Cobrir falha\ncom teste'],
    },
    approved: { ok: true, comments: [] },
    stale: { ok: true, comments: ['not part of this comparison'] },
  });
  for (const text of [
    'base-sha',
    'head-sha',
    'merge-sha',
    'refs/heads/feature',
    'old.md',
    'new.md',
    'approved.ts',
    'Verificar validação',
    'Cobrir falha\ncom teste',
    '1 de 3',
    'base comum',
    'espaços: sim',
  ])
    expect(result).toContain(text);
  expect(result).not.toContain('untouched.ts');
  expect(result).not.toContain('not part of this comparison');
});
it('preserves multiline notes and fences as literal content', () => {
  const text = '```\n# heading\n<script>literal</script>\n````';
  const result = exportReview('project', comparison, {
    renamed: { ok: false, comments: [text] },
  });
  expect(result).toContain('`````text\n' + text + '\n`````');
});
it('describes empty reviews instead of exporting an empty document', () => {
  expect(exportReview('project', comparison, {})).toContain(
    'Nenhum arquivo marcado',
  );
});
