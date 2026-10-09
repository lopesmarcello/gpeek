import { FileTree } from './file-tree.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  sessionSchema,
  errorSchema,
  repositorySchema,
  comparisonSchema,
  fileDiffSchema,
  type Session,
  type RepositoryInfo,
  type Comparison,
  type FileDiff,
} from '@gpeek/contracts';
import './style.css';
const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
window.history.replaceState(null, '', window.location.pathname);
async function request(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await fetch(path, {
    ...(body === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) {
    const error = errorSchema.safeParse(await response.json());
    throw new Error(
      error.success
        ? error.data.code === 'UNAUTHORIZED'
          ? 'Abra a ferramenta pelo comando no terminal para iniciar uma sessão.'
          : error.data.message
        : 'Falha na comunicação com o serviço local.',
    );
  }
  return response.status === 204 ? null : response.json();
}
async function connect(): Promise<Session> {
  if (token) await request('/api/bootstrap', { token });
  return sessionSchema.parse(await request('/api/session'));
}
const connection = connect();
void connection.catch(() => {});
const label = (ref: string) => ref.replace(/^refs\/(heads|remotes)\//, '');
const message = (error: unknown) =>
  error instanceof Error ? error.message : 'Operação não concluída.';
const statusLabel = (status: string) =>
  ({
    A: 'Adicionado',
    D: 'Removido',
    M: 'Modificado',
    R: 'Renomeado',
    T: 'Tipo alterado',
    C: 'Copiado',
  })[status[0] as 'A'] ?? status;
function App() {
  const [session, setSession] = useState<Session>();
  const [repository, setRepository] = useState<RepositoryInfo>();
  const [error, setError] = useState('');
  const [closed, setClosed] = useState(false);
  const [base, setBase] = useState('');
  const [head, setHead] = useState('');
  const [mode, setMode] = useState<'merge-base' | 'direct'>('merge-base');
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [comparison, setComparison] = useState<Comparison>();
  const [selected, setSelected] = useState('');
  const [diff, setDiff] = useState<FileDiff>();
  const [loading, setLoading] = useState(false);
  const [diffLoading, setDiffLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [remote, setRemote] = useState('');
  const [view, setView] = useState<'unified' | 'split'>('unified');
  const operation = useRef<AbortController>();
  const fileOperation = useRef<AbortController>();
  async function refresh(initial = false) {
    const info = repositorySchema.parse(await request('/api/repository'));
    setRepository(info);
    setRemote((value) =>
      info.remotes.includes(value) ? value : (info.remotes[0] ?? ''),
    );
    setBase((value) =>
      !initial && info.refs.some((ref) => ref.name === value)
        ? value
        : (info.suggestedBase ?? info.refs[0]?.name ?? ''),
    );
    setHead((value) =>
      !initial && info.refs.some((ref) => ref.name === value)
        ? value
        : (info.currentRef ??
          info.refs.find((ref) => ref.kind === 'local')?.name ??
          ''),
    );
  }
  useEffect(() => {
    let active = true;
    void connection
      .then(async (value) => {
        if (!active) return;
        setSession(value);
        try {
          await refresh(true);
        } catch {
          if (active)
            setError(
              'Nenhum repositório disponível. Reinicie com --repo /caminho/do/repositorio.',
            );
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(message(cause));
      });
    return () => {
      active = false;
      operation.current?.abort();
      fileOperation.current?.abort();
    };
  }, []);
  async function compare() {
    operation.current?.abort();
    fileOperation.current?.abort();
    const controller = new AbortController();
    operation.current = controller;
    setLoading(true);
    setDiffLoading(false);
    setError('');
    setComparison(undefined);
    setDiff(undefined);
    setSelected('');
    try {
      const result = comparisonSchema.parse(
        await request(
          '/api/comparisons',
          { baseRef: base, headRef: head, mode, ignoreWhitespace },
          controller.signal,
        ),
      );
      if (controller.signal.aborted) return;
      setComparison(result);
      if (result.files[0]) void selectFile(result, result.files[0].id);
    } catch (cause) {
      if (!controller.signal.aborted) setError(message(cause));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }
  async function selectFile(snapshot: Comparison, id: string) {
    fileOperation.current?.abort();
    const controller = new AbortController();
    fileOperation.current = controller;
    setSelected(id);
    setDiff(undefined);
    setDiffLoading(true);
    setError('');
    try {
      const result = fileDiffSchema.parse(
        await request(
          `/api/comparisons/${snapshot.id}/files/${id}`,
          undefined,
          controller.signal,
        ),
      );
      if (!controller.signal.aborted) setDiff(result);
    } catch (cause) {
      if (!controller.signal.aborted) setError(message(cause));
    } finally {
      if (!controller.signal.aborted) setDiffLoading(false);
    }
  }
  async function fetchRemote() {
    setLoading(true);
    setError('');
    try {
      const info = repositorySchema.parse(
        await request('/api/fetch', { remote }),
      );
      setRepository(info);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setLoading(false);
    }
  }
  async function shutdown() {
    operation.current?.abort();
    fileOperation.current?.abort();
    try {
      await request('/api/shutdown', {});
      setClosed(true);
    } catch {
      setError('Não foi possível encerrar. Use Ctrl+C no terminal.');
    }
  }
  const file = comparison?.files.find((item) => item.id === selected);
  const filtered = useMemo(
    () =>
      comparison?.files.filter((item) =>
        `${item.oldPath} ${item.newPath}`
          .toLocaleLowerCase()
          .includes(filter.toLocaleLowerCase()),
      ) ?? [],
    [comparison, filter],
  );
  const pending =
    comparison &&
    (comparison.baseRef !== base ||
      comparison.headRef !== head ||
      comparison.mode !== mode ||
      comparison.ignoreWhitespace !== ignoreWhitespace);
  return (
    <main>
      <header className="topbar">
        <div>
          <p className="eyebrow">REVISÃO LOCAL DE BRANCHES</p>
          <h1>gpeek</h1>
        </div>
        {session && !closed && (
          <button
            className="quiet"
            onClick={() => {
              void shutdown();
            }}
          >
            Encerrar sessão
          </button>
        )}
      </header>
      <p role="status" className="connection">
        {closed
          ? 'Sessão encerrada. Você pode fechar esta aba.'
          : session
            ? 'Serviço local conectado'
            : 'Conectando ao serviço local…'}
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {repository && !closed && (
        <>
          <section className="setup" aria-label="Comparar branches">
            <div className="repo-heading">
              <div>
                <h2>{repository.name}</h2>
                <p>
                  Somente commits. Alterações não commitadas e staging não
                  entram no diff.
                </p>
              </div>
              <button
                className="quiet"
                disabled={loading}
                onClick={() => {
                  void refresh().catch((cause: unknown) =>
                    setError(message(cause)),
                  );
                }}
              >
                Atualizar branches
              </button>
            </div>
            <div className="selectors">
              <label>
                Branch base
                <select
                  value={base}
                  onChange={(event) => setBase(event.target.value)}
                >
                  {['local', 'remote'].map((kind) => (
                    <optgroup
                      key={kind}
                      label={
                        kind === 'local' ? 'Locais' : 'Referências remotas'
                      }
                    >
                      {repository.refs
                        .filter((ref) => ref.kind === kind)
                        .map((ref) => (
                          <option key={ref.name} value={ref.name}>
                            {label(ref.name)}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <span className="direction" aria-hidden="true">
                →
              </span>
              <label>
                Branch de trabalho
                <select
                  value={head}
                  onChange={(event) => setHead(event.target.value)}
                >
                  {['local', 'remote'].map((kind) => (
                    <optgroup
                      key={kind}
                      label={
                        kind === 'local' ? 'Locais' : 'Referências remotas'
                      }
                    >
                      {repository.refs
                        .filter((ref) => ref.kind === kind)
                        .map((ref) => (
                          <option key={ref.name} value={ref.name}>
                            {label(ref.name)}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <label>
                Modo de comparação
                <select
                  value={mode}
                  onChange={(event) =>
                    setMode(event.target.value as typeof mode)
                  }
                >
                  <option value="merge-base">
                    Mudanças desde a base comum
                  </option>
                  <option value="direct">Diferença entre as pontas</option>
                </select>
              </label>
              <button
                disabled={loading || !base || !head}
                onClick={() => {
                  void compare();
                }}
              >
                {loading ? 'Aguarde…' : 'Comparar branches'}
              </button>
            </div>
            <div className="options">
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={ignoreWhitespace}
                  onChange={(event) =>
                    setIgnoreWhitespace(event.target.checked)
                  }
                />
                Ignorar diferenças de espaços
              </label>
              <span>
                {mode === 'merge-base'
                  ? 'Mostra o que a branch de trabalho mudou desde o ancestral comum.'
                  : 'Compara diretamente os commits finais da base e da branch de trabalho.'}
              </span>
            </div>
            {repository.remotes.length > 0 && (
              <div className="remote-row">
                <label>
                  Remote
                  <select
                    value={remote}
                    onChange={(event) => setRemote(event.target.value)}
                  >
                    {repository.remotes.map((name) => (
                      <option key={name}>{name}</option>
                    ))}
                  </select>
                </label>
                <button
                  className="quiet"
                  disabled={loading}
                  onClick={() => {
                    void fetchRemote();
                  }}
                >
                  Atualizar remoto (fetch)
                </button>
                <p>
                  Referências remotas são cópias locais.{' '}
                  {repository.lastFetch
                    ? `Último fetch da ferramenta: ${new Date(repository.lastFetch).toLocaleString()}. Compare novamente para usar os novos commits.`
                    : 'Atualização anterior desconhecida. Fetch acessa a rede e usa suas credenciais Git.'}
                </p>
              </div>
            )}
            {repository.shallow && (
              <p className="warning">
                Clone shallow: parte do histórico pode estar indisponível.
              </p>
            )}
            {repository.refs.length === 0 && (
              <p>Não há branches com commits neste repositório.</p>
            )}
          </section>
          {loading && <p role="status">Executando operação Git…</p>}
          {comparison && (
            <>
              <section className="summary" aria-label="Resumo da comparação">
                <div>
                  <h2>
                    {label(comparison.baseRef)}{' '}
                    <span aria-hidden="true">→</span>{' '}
                    {label(comparison.headRef)}
                  </h2>
                  <p>
                    {comparison.files.length} arquivos alterados{' '}
                    <span className="added">
                      +
                      {comparison.files.reduce(
                        (sum, item) => sum + (item.additions ?? 0),
                        0,
                      )}
                    </span>{' '}
                    <span className="deleted">
                      −
                      {comparison.files.reduce(
                        (sum, item) => sum + (item.deletions ?? 0),
                        0,
                      )}
                    </span>
                  </p>
                </div>
                <div className="commits">
                  <span>
                    Base:{' '}
                    <code title={comparison.baseCommit}>
                      {comparison.baseCommit.slice(0, 10)}
                    </code>
                  </span>
                  <span>
                    Trabalho:{' '}
                    <code title={comparison.headCommit}>
                      {comparison.headCommit.slice(0, 10)}
                    </code>
                  </span>
                  <span>
                    Diff começa em:{' '}
                    <code title={comparison.fromCommit}>
                      {comparison.fromCommit.slice(0, 10)}
                    </code>
                  </span>
                </div>
              </section>
              {pending && (
                <p className="warning">
                  As opções foram alteradas. Clique em Comparar branches para
                  atualizar o resultado.
                </p>
              )}
              {comparison.files.length === 0 ? (
                <section className="empty">
                  <h2>Nenhuma diferença encontrada</h2>
                  <p>
                    Os commits não apresentam mudanças para o modo e as opções
                    selecionados.
                  </p>
                </section>
              ) : (
                <div className="review-layout">
                  <aside aria-label="Arquivos alterados">
                    <label className="filter-label">
                      Filtrar arquivos
                      <input
                        type="search"
                        value={filter}
                        onChange={(event) => setFilter(event.target.value)}
                        placeholder="Nome ou caminho"
                      />
                    </label>
                    <p className="file-count">
                      {filtered.length} de {comparison.files.length} arquivos
                    </p>
                    <FileTree
                      key={comparison.id}
                      files={filtered}
                      selected={selected}
                      filter={filter}
                      onSelect={(id) => {
                        void selectFile(comparison, id);
                      }}
                    />
                    {filtered.length === 0 && (
                      <p>Nenhum arquivo corresponde ao filtro.</p>
                    )}
                  </aside>
                  <section className="diff-panel" aria-label="Diff do arquivo">
                    {file && (
                      <>
                        <div className="file-header">
                          <div>
                            <h2>{file.newPath}</h2>
                            <p>
                              {statusLabel(file.status)}
                              {file.oldPath !== file.newPath &&
                                ` · ${file.oldPath} → ${file.newPath}`}
                              {file.oldMode !== file.newMode &&
                                ` · Modo ${file.oldMode} → ${file.newMode}`}
                            </p>
                          </div>
                          <label>
                            Visualização
                            <select
                              value={view}
                              onChange={(event) =>
                                setView(event.target.value as typeof view)
                              }
                            >
                              <option value="unified">Unificado</option>
                              <option value="split">Lado a lado</option>
                            </select>
                          </label>
                        </div>
                        {file.pathEncoding === 'lossy' && (
                          <p className="warning">
                            O caminho contém bytes fora de UTF-8. O nome exibido
                            é aproximado; o conteúdo é identificado por objeto
                            Git.
                          </p>
                        )}
                      </>
                    )}
                    {diffLoading && (
                      <p role="status" className="diff-notice">
                        Carregando diff…
                      </p>
                    )}
                    {diff?.notice && (
                      <p className="diff-notice">{diff.notice}</p>
                    )}
                    {diff && !diff.notice && diff.hunks.length === 0 && (
                      <p className="diff-notice">
                        Nenhuma mudança textual para as opções selecionadas.
                      </p>
                    )}
                    {diff && <DiffView diff={diff} view={view} />}
                  </section>
                </div>
              )}
            </>
          )}
          {!comparison && !loading && (
            <section className="empty">
              <h2>Revise sua branch antes do PR</h2>
              <p>
                Escolha a base e a branch de trabalho para visualizar os
                arquivos alterados.
              </p>
            </section>
          )}
        </>
      )}
    </main>
  );
}
function DiffView({
  diff,
  view,
}: {
  diff: FileDiff;
  view: 'unified' | 'split';
}) {
  return (
    <div
      className={`diff-scroll ${view}`}
      tabIndex={0}
      aria-label="Conteúdo do diff"
    >
      {diff.hunks.map((hunk, index) => (
        <div key={index}>
          <div className="hunk-header">{hunk.header}</div>
          {view === 'unified' ? (
            <table className="diff-table">
              <colgroup>
                <col className="number-column" />
                <col className="number-column" />
                <col className="sign-column" />
                <col />
              </colgroup>
              <thead className="sr-only">
                <tr>
                  <th>Linha anterior</th>
                  <th>Linha nova</th>
                  <th>Alteração</th>
                  <th>Conteúdo</th>
                </tr>
              </thead>
              <tbody>
                {hunk.lines.map((line, i) => (
                  <tr key={i} className={line.kind}>
                    <td className="line-number">{line.oldLine}</td>
                    <td className="line-number">{line.newLine}</td>
                    <td className="sign">
                      {line.kind === 'addition'
                        ? '+'
                        : line.kind === 'deletion'
                          ? '−'
                          : ''}
                    </td>
                    <td className="code">
                      <pre>{line.text || ' '}</pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="diff-table split-table">
              <colgroup>
                <col className="number-column" />
                <col className="code-column" />
                <col className="number-column" />
                <col className="code-column" />
              </colgroup>
              <thead>
                <tr>
                  <th colSpan={2}>Antes</th>
                  <th colSpan={2}>Depois</th>
                </tr>
              </thead>
              <tbody>
                {splitLines(hunk.lines).map((row, i) => (
                  <tr key={i}>
                    <td className="line-number">{row.old?.oldLine}</td>
                    <td className={`code ${row.old?.kind ?? 'blank'}`}>
                      <pre>{row.old?.text || ' '}</pre>
                    </td>
                    <td className="line-number">{row.next?.newLine}</td>
                    <td className={`code ${row.next?.kind ?? 'blank'}`}>
                      <pre>{row.next?.text || ' '}</pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  );
}
type Line = FileDiff['hunks'][number]['lines'][number];
function splitLines(lines: Line[]) {
  const rows: { old?: Line; next?: Line }[] = [];
  for (let i = 0; i < lines.length; ) {
    const line = lines[i]!;
    if (line.kind === 'context' || line.kind === 'note') {
      rows.push({ old: line, next: line });
      i++;
      continue;
    }
    const old: Line[] = [];
    const next: Line[] = [];
    while (lines[i]?.kind === 'deletion') old.push(lines[i++]!);
    while (lines[i]?.kind === 'addition') next.push(lines[i++]!);
    for (let j = 0; j < Math.max(old.length, next.length); j++)
      rows.push({
        ...(old[j] ? { old: old[j] } : {}),
        ...(next[j] ? { next: next[j] } : {}),
      });
  }
  return rows;
}
const root = document.getElementById('root');
if (!root) throw new Error('Missing root element');
createRoot(root).render(<App />);
