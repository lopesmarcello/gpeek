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
it('exports immutable context, renamed files and pending comments while excluding approved and unannotated files', () => {
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
    'Verificar validação',
    'Cobrir falha\ncom teste',
    'base comum',
    'espaços: sim',
  ])
    expect(result).toContain(text);
  expect(result).not.toContain('approved.ts');
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
    'Nenhuma observação pendente.',
  );
});

it('exports the side and line of inline comments, retaining file notes', () => {
  const result = exportReview('project', comparison, {
    renamed: {
      ok: false,
      comments: [
        'General note',
        { side: 'old', line: 12, text: 'Removed code' },
        { side: 'new', line: 14, text: 'New code' },
      ],
    },
  });
  expect(result).toContain('Arquivo inteiro');
  expect(result).toContain('General note');
  expect(result).toContain('Linha 12 · Antes');
  expect(result).toContain('Removed code');
  expect(result).toContain('Linha 14 · Depois');
  expect(result).toContain('New code');
});

it('omits approved files even with comments and keeps the compact context', () => {
  const result = exportReview('project', comparison, {
    approved: {
      ok: true,
      comments: [
        'Resolved note',
        { side: 'new', line: 1, text: 'Resolved line' },
      ],
    },
    renamed: { ok: false, comments: ['Pending note'] },
  });
  expect(result).not.toContain('approved.ts');
  expect(result).not.toContain('Resolved');
  expect(result).toContain('Pending note');
  expect(result).not.toContain('Revisão:');
  expect(result).not.toContain('### Comentário');
  expect(result.match(/Commit de trabalho:/g)).toHaveLength(1);
  expect(
    exportReview('project', comparison, {
      approved: { ok: true, comments: ['Resolved'] },
    }),
  ).toContain('Nenhuma observação pendente.');
});
