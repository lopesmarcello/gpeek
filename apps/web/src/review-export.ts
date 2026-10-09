import type { Comparison } from '@gpeek/contracts';
import type { Annotation } from './review-notes.js';

// Repository names and notes remain literal text, even when they contain Markdown fences.
function literal(text: string): string {
  const longest = Math.max(
    0,
    ...(text.match(/`+/g) ?? []).map((run) => run.length),
  );
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}text\n${text}\n${fence}`;
}
export function exportReview(
  repository: string,
  comparison: Comparison,
  annotations: Record<string, Annotation>,
): string {
  const reviewed = comparison.files.filter((file) => {
    const value = annotations[file.id];
    return value?.ok || value?.comments.length;
  });
  const okCount = comparison.files.filter(
    (file) => annotations[file.id]?.ok,
  ).length;
  const lines = [
    '# Revisão pessoal — gpeek',
    '',
    'Notas pessoais para apoiar a análise desta comparação. Os comentários referem-se ao arquivo inteiro.',
    '',
    '## Contexto da comparação',
    '',
    literal(
      [
        `Repositório: ${JSON.stringify(repository)}`,
        `Branch base: ${JSON.stringify(comparison.baseRef)}`,
        `Branch de trabalho: ${JSON.stringify(comparison.headRef)}`,
        `Commit base: ${comparison.baseCommit}`,
        `Commit de trabalho: ${comparison.headCommit}`,
        `Diff começa em: ${comparison.fromCommit}`,
        `Modo: ${comparison.mode === 'merge-base' ? 'Mudanças desde a base comum' : 'Diferença entre as pontas'}`,
        `Ignorar diferenças de espaços: ${comparison.ignoreWhitespace ? 'sim' : 'não'}`,
      ].join('\n'),
    ),
    '',
    `${okCount} de ${comparison.files.length} arquivos marcados como OK.`,
    'O relatório inclui arquivos com marcação OK ou comentários, independentemente do filtro da árvore. Não inclui código-fonte nem o diff.',
    '',
  ];
  if (!reviewed.length)
    lines.push(
      'Nenhum arquivo marcado como OK e nenhum comentário adicionado.',
      '',
    );
  for (const [index, file] of reviewed.entries()) {
    const value = annotations[file.id]!;
    lines.push(
      `## Arquivo ${index + 1}`,
      '',
      literal(
        [
          `Caminho: ${JSON.stringify(file.newPath)}`,
          ...(file.oldPath !== file.newPath
            ? [`Caminho anterior: ${JSON.stringify(file.oldPath)}`]
            : []),
          `Status Git: ${file.status}`,
          `Revisão: ${value.ok ? 'OK' : 'Não marcado como OK'}`,
        ].join('\n'),
      ),
      '',
    );
    if (!value.comments.length) lines.push('Sem comentários pessoais.', '');
    for (const [commentIndex, text] of value.comments.entries()) {
      lines.push(`### Comentário ${commentIndex + 1}`, '', literal(text), '');
    }
  }
  return lines.join('\n');
}
