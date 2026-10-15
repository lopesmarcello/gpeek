import { DiffView } from './diff-view.js';
import { exportReview } from './review-export.js';
import { ReviewNotes, type Annotation } from './review-notes.js';
import { FileTree } from './file-tree.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  annotationsSchema,
  sessionSchema,
  errorSchema,
  repositorySchema,
  comparisonSchema,
  fileDiffSchema,
  conflictAnalysisSchema,
  type ConflictAnalysis,
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
  const [conflicts, setConflicts] = useState<ConflictAnalysis>();
  const [conflictLoading, setConflictLoading] = useState(false);
  const conflictOperation = useRef<AbortController>();
  const [annotations, setAnnotations] = useState<Record<string, Annotation>>(
    {},
  );
  const pendingSaves = useRef<Promise<void>>(Promise.resolve());
  const [storageError, setStorageError] = useState('');
  const [selected, setSelected] = useState('');
  const [fullContext, setFullContext] = useState(false);
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
      conflictOperation.current?.abort();
      operation.current?.abort();
      fileOperation.current?.abort();
    };
  }, []);
  async function compare() {
    await pendingSaves.current;
    operation.current?.abort();
    fileOperation.current?.abort();
    const controller = new AbortController();
    operation.current = controller;
    setLoading(true);
    setDiffLoading(false);
    setError('');
    conflictOperation.current?.abort();
    setConflicts(undefined);
    setConflictLoading(false);
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
      let saved: Record<string, Annotation> = {};
      try {
        saved = annotationsSchema.parse(
          await request(
            `/api/comparisons/${result.id}/annotations`,
            undefined,
            controller.signal,
          ),
        );
        setStorageError('');
      } catch {
        if (controller.signal.aborted) return;
        setStorageError(
          'Não foi possível ler a revisão local. A revisão ficará apenas nesta aba.',
        );
      }
      if (controller.signal.aborted) return;
      setAnnotations(saved);
      setComparison(result);
      if (result.files[0]) void selectFile(result, result.files[0].id);
    } catch (cause) {
      if (!controller.signal.aborted) setError(message(cause));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }
  async function selectFile(snapshot: Comparison, id: string, full = false) {
    fileOperation.current?.abort();
    const controller = new AbortController();
    fileOperation.current = controller;
    setSelected(id);
    setFullContext(full);
    setDiff(undefined);
    setDiffLoading(true);
    setError('');
    try {
      const result = fileDiffSchema.parse(
        await request(
          `/api/comparisons/${snapshot.id}/files/${id}?context=${full ? 'full' : 'changes'}`,
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
  async function analyzeConflicts() {
    if (!comparison) return;
    conflictOperation.current?.abort();
    const controller = new AbortController();
    conflictOperation.current = controller;
    setConflictLoading(true);
    setConflicts(undefined);
    setError('');
    try {
      const result = conflictAnalysisSchema.parse(
        await request(
          `/api/comparisons/${comparison.id}/conflicts`,
          undefined,
          controller.signal,
        ),
      );
      if (!controller.signal.aborted) setConflicts(result);
    } catch (cause) {
      if (!controller.signal.aborted) setError(message(cause));
    } finally {
      if (!controller.signal.aborted) setConflictLoading(false);
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
    conflictOperation.current?.abort();
    try {
      await pendingSaves.current;
      await request('/api/shutdown', {});
      setClosed(true);
    } catch {
      setError('Não foi possível encerrar. Use Ctrl+C no terminal.');
    }
  }
  const file = comparison?.files.find((item) => item.id === selected);
  function saveAnnotations(values: Record<string, Annotation>) {
    if (!comparison || Object.keys(values).length === 0) return;
    setAnnotations((previous) => ({ ...previous, ...values }));
    const comparisonId = comparison.id;
    pendingSaves.current = pendingSaves.current
      .catch(() => {})
      .then(async () => {
        let failed = false;
        for (const [fileId, value] of Object.entries(values)) {
          try {
            await request(
              `/api/comparisons/${comparisonId}/annotations/${fileId}`,
              value,
            );
          } catch {
            failed = true;
          }
        }
        setStorageError(
          failed
            ? 'Não foi possível salvar toda a revisão local. As alterações não salvas ficam apenas nesta aba.'
            : '',
        );
      });
  }
  function saveAnnotation(value: Annotation) {
    if (file) saveAnnotations({ [file.id]: value });
  }
  function approveFiles(ids: string[]) {
    saveAnnotations(
      Object.fromEntries(
        ids.map((id) => [
          id,
          { ...(annotations[id] ?? { comments: [] }), ok: true },
        ]),
      ),
    );
  }
  useEffect(() => {
    function approveShortcut(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.isComposing ||
        !event.shiftKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.key.toLowerCase() !== 'a' ||
        !file ||
        loading ||
        closed ||
        (event.target instanceof HTMLElement &&
          (event.target.isContentEditable ||
            event.target.closest('input, textarea, select')))
      )
        return;
      event.preventDefault();
      approveFiles([file.id]);
    }
    window.addEventListener('keydown', approveShortcut);
    return () => window.removeEventListener('keydown', approveShortcut);
  });

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
                  aria-label="Branch base"
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
                  aria-label="Branch de trabalho"
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
                  aria-label="Modo de comparação"
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
                    aria-label="Remote"
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
              <button
                className="quiet"
                onClick={() => {
                  const markdown = exportReview(
                    repository.name,
                    comparison,
                    annotations,
                  );
                  const url = URL.createObjectURL(
                    new Blob([markdown], {
                      type: 'text/markdown;charset=utf-8',
                    }),
                  );
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = `gpeek-review-${comparison.headCommit.slice(0, 10).replace(/[^a-zA-Z0-9]/g, '')}.md`;
                  document.body.append(link);
                  link.click();
                  link.remove();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                }}
              >
                Exportar revisão (.md)
              </button>
              <section className="conflicts" aria-label="Conflitos de merge">
                <h2>Conflitos de merge</h2>
                <p>
                  Simula integrar a branch de trabalho na base, usando os SHAs
                  acima. Working tree e index são preservados. A opção de
                  whitespace do diff não altera esta análise.
                </p>
                <button
                  className="quiet"
                  disabled={conflictLoading || loading}
                  onClick={() => {
                    void analyzeConflicts();
                  }}
                >
                  {conflictLoading
                    ? 'Analisando conflitos…'
                    : 'Analisar conflitos'}
                </button>
                {conflictLoading && (
                  <p role="status">Analisando merge com Git…</p>
                )}
                {conflicts && (
                  <>
                    <p
                      role="status"
                      className={conflicts.clean ? 'added' : 'warning'}
                    >
                      {conflicts.clean
                        ? 'Nenhum conflito encontrado para estes commits.'
                        : `Conflitos encontrados · ${conflicts.files.length} arquivos em conflito.`}
                    </p>
                    <p>
                      Estratégia padrão do Git em ambiente isolado, sem drivers
                      externos ou configuração personalizada. O resultado de um
                      merge no seu ambiente pode variar.
                    </p>
                    {conflicts.messages.map((item, index) => (
                      <div key={index} className="conflict-diagnostic">
                        <strong>{item.type}</strong>
                        <pre>{item.message}</pre>
                      </div>
                    ))}
                    {conflicts.files.map((item, index) => (
                      <details key={index}>
                        <summary>{item.path}</summary>
                        {item.pathEncoding === 'lossy' && (
                          <p className="warning">
                            Nome aproximado: caminho fora de UTF-8.
                          </p>
                        )}
                        {item.notice && (
                          <p className="warning">{item.notice}</p>
                        )}
                        {item.content !== null && (
                          <>
                            <p>
                              Resultado simulado: primeiro lado = base;
                              ancestral comum entre ||||||| e =======; segundo
                              lado = trabalho. Os marcadores pertencem ao
                              conteúdo produzido pelo Git.
                            </p>
                            <pre className="conflict-content">
                              {item.content}
                            </pre>
                          </>
                        )}
                      </details>
                    ))}
                  </>
                )}
              </section>
              <p className="review-storage">
                {
                  comparison.files.filter((item) => annotations[item.id]?.ok)
                    .length
                }{' '}
                de {comparison.files.length} arquivos OK. Revisão pessoal salva
                neste navegador e endereço; uma nova porta não recupera estes
                dados automaticamente.
              </p>
              {storageError && (
                <p role="alert" className="warning">
                  {storageError}
                </p>
              )}
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
                      annotations={annotations}
                      onApprove={approveFiles}
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
                        <ReviewNotes
                          key={file.id}
                          value={
                            annotations[file.id] ?? { ok: false, comments: [] }
                          }
                          onChange={saveAnnotation}
                        />
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
                          <button
                            type="button"
                            className="quiet"
                            aria-pressed={fullContext}
                            onClick={() =>
                              void selectFile(comparison, file.id, !fullContext)
                            }
                          >
                            {fullContext
                              ? 'Ver apenas alterações'
                              : 'Visualizar arquivo completo'}
                          </button>
                          <div
                            className="view-toggle"
                            role="group"
                            aria-label="Visualização"
                          >
                            <button
                              type="button"
                              aria-label="Unificado"
                              title="Unificado"
                              aria-pressed={view === 'unified'}
                              onClick={() => setView('unified')}
                            >
                              <svg
                                width="20"
                                height="20"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                aria-hidden="true"
                              >
                                <rect
                                  x="3"
                                  y="3"
                                  width="18"
                                  height="18"
                                  rx="2"
                                />
                                <path d="M7 8h10M7 12h10M7 16h10" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              aria-label="Lado a lado"
                              title="Lado a lado"
                              aria-pressed={view === 'split'}
                              onClick={() => setView('split')}
                            >
                              <svg
                                width="20"
                                height="20"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                aria-hidden="true"
                              >
                                <rect
                                  x="3"
                                  y="3"
                                  width="18"
                                  height="18"
                                  rx="2"
                                />
                                <path d="M12 3v18M6 8h3M6 12h3M6 16h3M15 8h3M15 12h3M15 16h3" />
                              </svg>
                            </button>
                          </div>
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
                    {fullContext && (
                      <p className="diff-notice">
                        Arquivo completo · Antes / Depois dos commits da
                        comparação. Todas as diferenças de espaços são exibidas.
                      </p>
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
                    {diff && (
                      <DiffView
                        key={file?.id}
                        annotation={
                          annotations[selected] ?? { ok: false, comments: [] }
                        }
                        onChange={saveAnnotation}
                        diff={diff}
                        view={view}
                        oldPath={file?.oldPath ?? ''}
                        newPath={file?.newPath ?? ''}
                      />
                    )}
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
const root = document.getElementById('root');
if (!root) throw new Error('Missing root element');
createRoot(root).render(<App />);
