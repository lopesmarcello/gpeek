import { DomainError, type DiffLine, type Hunk } from '@gpeek/core';
export function nulFields(buffer: Buffer): Buffer[] {
  const fields: Buffer[] = [];
  let offset = 0;
  for (let i = 0; i < buffer.length; i++)
    if (buffer[i] === 0) {
      fields.push(buffer.subarray(offset, i));
      offset = i + 1;
    }
  if (offset !== buffer.length)
    throw new DomainError('GIT_ERROR', 'Saída Git incompleta.');
  return fields;
}
export function decodePath(buffer: Buffer): { path: string; lossy: boolean } {
  try {
    return {
      path: new TextDecoder('utf-8', { fatal: true }).decode(buffer),
      lossy: false,
    };
  } catch {
    return { path: buffer.toString('utf8'), lossy: true };
  }
}
export function parseHunks(patch: string): Hunk[] {
  const hunks: Hunk[] = [];
  let hunk: Hunk | undefined;
  let count = 0;
  let oldLine = 0;
  let newLine = 0;
  const lines = patch.split('\n');
  if (lines.at(-1) === '') lines.pop();
  for (const line of lines) {
    const header = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (header) {
      oldLine = Number(header[1]);
      newLine = Number(header[2]);
      hunk = { header: line, lines: [] };
      hunks.push(hunk);
      continue;
    }
    if (!hunk) continue;
    let entry: DiffLine;
    if (line.startsWith('+'))
      entry = {
        kind: 'addition',
        text: line.slice(1),
        oldLine: null,
        newLine: newLine++,
      };
    else if (line.startsWith('-'))
      entry = {
        kind: 'deletion',
        text: line.slice(1),
        oldLine: oldLine++,
        newLine: null,
      };
    else if (line.startsWith(' '))
      entry = {
        kind: 'context',
        text: line.slice(1),
        oldLine: oldLine++,
        newLine: newLine++,
      };
    else if (line.startsWith('\\'))
      entry = {
        kind: 'note',
        text: 'Sem quebra de linha no final do arquivo',
        oldLine: null,
        newLine: null,
      };
    else throw new DomainError('GIT_ERROR', 'Formato de diff não reconhecido.');
    if (++count > 10000)
      throw new DomainError(
        'CONTENT_LIMIT',
        'Diff acima de 10.000 linhas. O resumo permanece disponível; consulte o arquivo pelo terminal.',
      );
    hunk.lines.push(entry);
  }
  return hunks;
}
