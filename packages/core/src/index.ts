export type ComparisonMode = 'merge-base' | 'direct';
export type DomainCode =
  | 'NOT_REPOSITORY'
  | 'REF_NOT_FOUND'
  | 'NO_MERGE_BASE'
  | 'AMBIGUOUS_BASE'
  | 'INCOMPLETE_HISTORY'
  | 'GIT_ERROR'
  | 'TIMEOUT'
  | 'CONTENT_LIMIT'
  | 'NOT_FOUND'
  | 'CANCELLED';
export class DomainError extends Error {
  constructor(
    public readonly code: DomainCode,
    message: string,
  ) {
    super(message);
  }
}
export interface RepositoryRef {
  name: string;
  commitId: string;
  kind: 'local' | 'remote';
}
export interface RepositoryInfo {
  name: string;
  refs: RepositoryRef[];
  currentRef: string | null;
  suggestedBase: string | null;
  remotes: string[];
  shallow: boolean;
  lastFetch: string | null;
}
export interface ChangedFile {
  id: string;
  oldPath: string;
  newPath: string;
  status: string;
  oldMode: string;
  newMode: string;
  additions: number | null;
  deletions: number | null;
  kind: 'text' | 'binary' | 'submodule';
  pathEncoding: 'utf8' | 'lossy';
}
export interface DiffLine {
  kind: 'context' | 'addition' | 'deletion' | 'note';
  text: string;
  oldLine: number | null;
  newLine: number | null;
}
export interface Hunk {
  header: string;
  lines: DiffLine[];
}
export interface FileDiff {
  fileId: string;
  hunks: Hunk[];
  notice: string | null;
}
export interface Comparison {
  id: string;
  baseRef: string;
  headRef: string;
  baseCommit: string;
  headCommit: string;
  fromCommit: string;
  mode: ComparisonMode;
  ignoreWhitespace: boolean;
  files: ChangedFile[];
}
export interface RepositoryReader {
  info(signal?: AbortSignal): Promise<RepositoryInfo>;
  resolveRef(name: string, signal?: AbortSignal): Promise<string>;
  mergeBases(
    base: string,
    head: string,
    signal?: AbortSignal,
  ): Promise<string[]>;
  changedFiles(
    base: string,
    head: string,
    ignoreWhitespace: boolean,
    signal?: AbortSignal,
  ): Promise<ChangedFile[]>;
  diff(
    file: ChangedFile,
    ignoreWhitespace: boolean,
    signal?: AbortSignal,
  ): Promise<FileDiff>;
  fetch(remote: string, signal?: AbortSignal): Promise<void>;
  release(files: ChangedFile[]): void;
}
export function createReviewService(
  repository: RepositoryReader,
  nextId: () => string,
) {
  const comparisons = new Map<string, Comparison>();
  return {
    info: (signal?: AbortSignal) => repository.info(signal),
    async compare(
      input: {
        baseRef: string;
        headRef: string;
        mode: ComparisonMode;
        ignoreWhitespace: boolean;
      },
      signal?: AbortSignal,
    ): Promise<Comparison> {
      const baseCommit = await repository.resolveRef(input.baseRef, signal);
      const headCommit = await repository.resolveRef(input.headRef, signal);
      let fromCommit = baseCommit;
      if (input.mode === 'merge-base') {
        const bases = await repository.mergeBases(
          baseCommit,
          headCommit,
          signal,
        );
        if (bases.length === 0) {
          const info = await repository.info(signal);
          throw new DomainError(
            info.shallow ? 'INCOMPLETE_HISTORY' : 'NO_MERGE_BASE',
            info.shallow
              ? 'Histórico shallow: a base comum pode não estar disponível. Use comparação direta ou obtenha o histórico pelo terminal.'
              : 'As branches não têm ancestral comum. Escolha comparação direta.',
          );
        }
        if (bases.length !== 1)
          throw new DomainError(
            'AMBIGUOUS_BASE',
            'Há múltiplas bases comuns. Use comparação direta nesta versão.',
          );
        fromCommit = bases[0]!;
      }
      const files = await repository.changedFiles(
        fromCommit,
        headCommit,
        input.ignoreWhitespace,
        signal,
      );
      const comparison: Comparison = {
        ...input,
        id: nextId(),
        baseCommit,
        headCommit,
        fromCommit,
        files,
      };
      // Bounded session history. Active snapshots never track moving refs.
      if (comparisons.size >= 12) {
        const oldest = comparisons.keys().next().value!;
        repository.release(comparisons.get(oldest)!.files);
        comparisons.delete(oldest);
      }
      comparisons.set(comparison.id, comparison);
      return comparison;
    },
    async file(
      comparisonId: string,
      fileId: string,
      signal?: AbortSignal,
    ): Promise<FileDiff> {
      const comparison = comparisons.get(comparisonId);
      const file = comparison?.files.find((item) => item.id === fileId);
      if (!comparison || !file)
        throw new DomainError(
          'NOT_FOUND',
          'Comparação ou arquivo expirado. Compare novamente.',
        );
      return repository.diff(file, comparison.ignoreWhitespace, signal);
    },
    async fetch(remote: string, signal?: AbortSignal) {
      const info = await repository.info(signal);
      if (!info.remotes.includes(remote))
        throw new DomainError('NOT_FOUND', 'Remote não encontrado.');
      await repository.fetch(remote, signal);
      return repository.info(signal);
    },
  };
}
export type ReviewService = ReturnType<typeof createReviewService>;
