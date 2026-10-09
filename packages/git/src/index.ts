import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  DomainError,
  type ChangedFile,
  type RepositoryReader,
  type RepositoryInfo,
  type FileDiff,
  type Hunk,
} from '@gpeek/core';
import { nulFields, decodePath, parseHunks } from './parser.js';
const execute = promisify(execFile);
const MAX_OUTPUT = 16 * 1024 * 1024;
const MAX_BLOB = 512 * 1024;
const flags = [
  '--no-ext-diff',
  '--no-textconv',
  '--no-color',
  '--no-relative',
  '--diff-algorithm=myers',
  '-M50%',
];
function cleanEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of Object.keys(env))
    if (key.startsWith('GIT_')) delete env[key];
  return {
    ...env,
    GIT_TERMINAL_PROMPT: '0',
    GIT_OPTIONAL_LOCKS: '0',
    GIT_NO_LAZY_FETCH: '1',
    GIT_PAGER: 'cat',
    LC_ALL: 'C',
  };
}
async function run(
  cwd: string,
  args: string[],
  signal?: AbortSignal,
  accepted = [0],
  timeout = 15000,
): Promise<Buffer> {
  try {
    const { stdout } = await execute(
      'git',
      [
        '--no-pager',
        '-c',
        'core.quotePath=false',
        '-c',
        'color.ui=false',
        '-c',
        'core.fsmonitor=false',
        '-c',
        'diff.suppressBlankEmpty=false',
        ...args,
      ],
      {
        cwd,
        env: cleanEnvironment(),
        encoding: 'buffer',
        timeout,
        maxBuffer: MAX_OUTPUT,
        windowsHide: true,
        ...(signal ? { signal } : {}),
      },
    );
    return stdout;
  } catch (cause) {
    const error = cause as {
      code?: string | number;
      stdout?: Buffer;
      killed?: boolean;
      name?: string;
    };
    if (typeof error.code === 'number' && accepted.includes(error.code))
      return error.stdout ?? Buffer.alloc(0);
    if (error.name === 'AbortError')
      throw new DomainError('CANCELLED', 'Operação cancelada.');
    if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER')
      throw new DomainError(
        'CONTENT_LIMIT',
        'A comparação excede o limite de 16 MiB de saída Git.',
      );
    if (error.killed)
      throw new DomainError('TIMEOUT', 'Git excedeu o tempo limite.');
    throw new DomainError(
      'GIT_ERROR',
      'Git não conseguiu concluir a operação. Verifique acesso, objetos locais e credenciais pelo terminal.',
    );
  }
}
export async function checkGitVersion(): Promise<string> {
  const output = (await run(process.cwd(), ['--version']))
    .toString('utf8')
    .trim();
  if (!output.startsWith('git version '))
    throw new DomainError('GIT_ERROR', 'Git não disponível no PATH.');
  return output;
}
interface Objects {
  oldObject: string;
  newObject: string;
}
export async function openRepository(
  directory: string,
): Promise<RepositoryReader> {
  let root: string;
  try {
    root = (await run(resolve(directory), ['rev-parse', '--show-toplevel']))
      .toString('utf8')
      .replace(/\r?\n$/, '');
  } catch {
    throw new DomainError(
      'NOT_REPOSITORY',
      'Informe um repositório Git local válido com --repo /caminho. Repositórios bare não são suportados nesta versão.',
    );
  }
  const objects = new Map<string, Objects>();
  let lastFetch: string | null = null;
  async function info(signal?: AbortSignal): Promise<RepositoryInfo> {
    const output = await run(
      root,
      [
        'for-each-ref',
        '--format=%(refname)%00%(objectname)%00%(symref)',
        'refs/heads/',
        'refs/remotes/',
      ],
      signal,
    );
    const refs = output
      .toString('utf8')
      .split('\n')
      .filter(Boolean)
      .flatMap((line) => {
        const [name, commitId, symbolic] = line.split('\0');
        return name && commitId && !symbolic
          ? [
              {
                name,
                commitId,
                kind: name.startsWith('refs/heads/')
                  ? ('local' as const)
                  : ('remote' as const),
              },
            ]
          : [];
      });
    const current = (
      await run(root, ['symbolic-ref', '--quiet', 'HEAD'], signal, [0, 1])
    )
      .toString('utf8')
      .trim();
    const upstream = current
      ? (
          await run(
            root,
            ['for-each-ref', '--format=%(upstream)', current],
            signal,
          )
        )
          .toString('utf8')
          .trim()
      : '';
    const defaultRemote = (
      await run(
        root,
        ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'],
        signal,
        [0, 1],
      )
    )
      .toString('utf8')
      .trim();
    const suggestedBase =
      [
        defaultRemote,
        upstream,
        'refs/remotes/origin/main',
        'refs/remotes/origin/master',
        'refs/heads/main',
        'refs/heads/master',
      ].find(
        (name) =>
          name && name !== current && refs.some((ref) => ref.name === name),
      ) ??
      refs.find((ref) => ref.name !== current)?.name ??
      null;
    return {
      name: basename(root),
      refs,
      currentRef: current || null,
      suggestedBase,
      remotes: (await run(root, ['remote'], signal))
        .toString('utf8')
        .split('\n')
        .filter(Boolean),
      shallow:
        (await run(root, ['rev-parse', '--is-shallow-repository'], signal))
          .toString('utf8')
          .trim() === 'true',
      lastFetch,
    };
  }
  return {
    info,
    async resolveRef(name, signal) {
      if (!(await info(signal)).refs.some((ref) => ref.name === name))
        throw new DomainError(
          'REF_NOT_FOUND',
          'A branch selecionada não existe mais. Atualize as branches.',
        );
      try {
        return (
          await run(
            root,
            ['rev-parse', '--verify', '--end-of-options', `${name}^{commit}`],
            signal,
          )
        )
          .toString('utf8')
          .trim();
      } catch (error) {
        if (
          error instanceof DomainError &&
          ['CANCELLED', 'TIMEOUT'].includes(error.code)
        )
          throw error;
        throw new DomainError(
          'REF_NOT_FOUND',
          'A referência não aponta para um commit disponível.',
        );
      }
    },
    async mergeBases(base, head, signal) {
      return (
        await run(root, ['merge-base', '--all', base, head], signal, [0, 1])
      )
        .toString('utf8')
        .split('\n')
        .filter(Boolean);
    },
    async changedFiles(base, head, ignoreWhitespace, signal) {
      const options = [...flags, ...(ignoreWhitespace ? ['-w'] : [])];
      const raw = nulFields(
        await run(
          root,
          ['diff', ...options, '--raw', '--no-abbrev', '-z', base, head, '--'],
          signal,
        ),
      );
      const stats = nulFields(
        await run(
          root,
          ['diff', ...options, '--numstat', '-z', base, head, '--'],
          signal,
        ),
      );
      const counts = new Map<
        string,
        { additions: number | null; deletions: number | null }
      >();
      for (let i = 0; i < stats.length; i++) {
        const record = stats[i]!;
        const first = record.indexOf(9);
        const second = record.indexOf(9, first + 1);
        if (first < 0 || second < 0)
          throw new DomainError('GIT_ERROR', 'Estatísticas Git inválidas.');
        const additions = record.subarray(0, first).toString();
        const deletions = record.subarray(first + 1, second).toString();
        let oldPath = record.subarray(second + 1);
        let newPath = oldPath;
        if (oldPath.length === 0) {
          oldPath = stats[++i]!;
          newPath = stats[++i]!;
        }
        if (!oldPath || !newPath)
          throw new DomainError('GIT_ERROR', 'Caminho Git incompleto.');
        counts.set(
          oldPath.toString('base64') + ':' + newPath.toString('base64'),
          {
            additions: additions === '-' ? null : Number(additions),
            deletions: deletions === '-' ? null : Number(deletions),
          },
        );
      }
      const files: ChangedFile[] = [];
      // File ids contain object ids only in the adapter's private registry.
      const pendingObjects = new Map<string, Objects>();
      for (let i = 0; i < raw.length; i++) {
        const header =
          /^:(\d{6}) (\d{6}) ([a-f0-9]+) ([a-f0-9]+) ([A-Z][0-9]*)$/.exec(
            raw[i]!.toString(),
          );
        if (!header)
          throw new DomainError('GIT_ERROR', 'Metadados Git inválidos.');
        const oldPathBytes = raw[++i];
        const newPathBytes =
          header[5]!.startsWith('R') || header[5]!.startsWith('C')
            ? raw[++i]
            : oldPathBytes;
        if (!oldPathBytes || !newPathBytes)
          throw new DomainError('GIT_ERROR', 'Caminho Git incompleto.');
        const count = counts.get(
          oldPathBytes.toString('base64') +
            ':' +
            newPathBytes.toString('base64'),
        );
        if (!count)
          throw new DomainError(
            'GIT_ERROR',
            'As estatísticas não correspondem aos arquivos. Compare novamente.',
          );
        const oldPath = decodePath(oldPathBytes);
        const newPath = decodePath(newPathBytes);
        const id = randomUUID();
        pendingObjects.set(id, {
          oldObject: header[3]!,
          newObject: header[4]!,
        });
        files.push({
          id,
          oldPath: oldPath.path,
          newPath: newPath.path,
          status: header[5]!,
          oldMode: header[1]!,
          newMode: header[2]!,
          ...count,
          kind:
            header[1] === '160000' || header[2] === '160000'
              ? 'submodule'
              : count.additions === null
                ? 'binary'
                : 'text',
          pathEncoding: oldPath.lossy || newPath.lossy ? 'lossy' : 'utf8',
        });
      }
      if (files.length > 10000)
        throw new DomainError(
          'CONTENT_LIMIT',
          'Mais de 10.000 arquivos alterados. Reduza o escopo da comparação.',
        );
      for (const [id, value] of pendingObjects) objects.set(id, value);
      return files;
    },
    async diff(file, ignoreWhitespace, signal): Promise<FileDiff> {
      const ids = objects.get(file.id);
      if (!ids)
        throw new DomainError(
          'NOT_FOUND',
          'Arquivo expirado. Compare novamente.',
        );
      const result = { fileId: file.id, hunks: [], notice: null } as FileDiff;
      if (file.kind !== 'text')
        return {
          ...result,
          notice:
            file.kind === 'binary'
              ? 'Arquivo binário: diff textual indisponível.'
              : 'Submódulo: a comparação mostra apenas a mudança de referência.',
        };
      async function blob(id: string): Promise<Buffer> {
        if (/^0+$/.test(id)) return Buffer.alloc(0);
        const size = Number(
          (await run(root, ['cat-file', '-s', id], signal)).toString(),
        );
        if (size > MAX_BLOB)
          throw new DomainError(
            'CONTENT_LIMIT',
            'Arquivo acima de 512 KiB por versão. O resumo permanece disponível.',
          );
        return run(root, ['cat-file', 'blob', id], signal);
      }
      let old: Buffer;
      let next: Buffer;
      try {
        old = await blob(ids.oldObject);
        next = await blob(ids.newObject);
      } catch (error) {
        if (error instanceof DomainError && error.code === 'CONTENT_LIMIT')
          return { ...result, notice: error.message };
        throw error;
      }
      if (
        old.subarray(0, 8192).includes(0) ||
        next.subarray(0, 8192).includes(0)
      )
        return {
          ...result,
          notice: 'Conteúdo binário: diff textual indisponível.',
        };
      try {
        const decoder = new TextDecoder('utf-8', { fatal: true });
        decoder.decode(old);
        decoder.decode(next);
      } catch {
        return {
          ...result,
          notice:
            'Conteúdo com codificação diferente de UTF-8: diff textual indisponível.',
        };
      }
      const temporary = await mkdtemp(join(tmpdir(), 'gpeek-diff-'));
      try {
        await writeFile(join(temporary, 'before'), old, { mode: 0o600 });
        await writeFile(join(temporary, 'after'), next, { mode: 0o600 });
        const patch = await run(
          temporary,
          [
            '-c',
            'core.autocrlf=false',
            'diff',
            '--no-index',
            '--no-ext-diff',
            '--no-textconv',
            '--no-color',
            '--diff-algorithm=myers',
            '--unified=3',
            '--inter-hunk-context=0',
            '--output-indicator-new=+',
            '--output-indicator-old=-',
            '--output-indicator-context= ',
            ...(ignoreWhitespace ? ['-w'] : []),
            '--',
            'before',
            'after',
          ],
          signal,
          [0, 1],
        );
        let hunks: Hunk[];
        try {
          hunks = parseHunks(patch.toString('utf8'));
        } catch (error) {
          if (error instanceof DomainError && error.code === 'CONTENT_LIMIT')
            return { ...result, notice: error.message };
          throw error;
        }
        return {
          ...result,
          hunks,
          notice: old.equals(next)
            ? 'Somente metadados ou caminho foram alterados.'
            : null,
        };
      } finally {
        await rm(temporary, { recursive: true, force: true });
      }
    },
    release(files) {
      for (const file of files) objects.delete(file.id);
    },
    async fetch(remote, signal) {
      if (!(await info(signal)).remotes.includes(remote))
        throw new DomainError('NOT_FOUND', 'Remote não encontrado.');
      const hooks = await mkdtemp(join(tmpdir(), 'gpeek-hooks-'));
      try {
        await run(
          root,
          [
            '-c',
            'core.hooksPath=' + hooks,
            'fetch',
            '--no-auto-maintenance',
            '--no-recurse-submodules',
            '--no-write-fetch-head',
            '--',
            remote,
          ],
          signal,
          [0],
          60000,
        );
      } finally {
        await rm(hooks, { recursive: true, force: true });
      }
      lastFetch = new Date().toISOString();
    },
  };
}
