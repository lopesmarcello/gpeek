# Plano de desenvolvimento

## Objetivo e premissas

Revisar o que uma branch introduz antes de publicar um PR, com navegação semelhante
à aba Files/Changes. Execução local no navegador, conforme escolha do usuário.
O plano foi aprovado pelo usuário. A stack inicial e o harness estão registrados
na ADR 0002; a validação restante está em docs/PHASE-0.md. Metas de desempenho
continuam provisórias. Não estimamos prazo sem concluir os primeiros spikes.

## Experiência do MVP

1. Executar a CLI dentro do repositório ou informar seu caminho.
2. Selecionar base e branch de trabalho, locais ou referências remote-tracking.
3. Ver modo de comparação, SHAs utilizados, resumo de arquivos e estatísticas.
4. Navegar por árvore/lista e buscar caminhos; abrir diffs unified ou lado a lado.
5. Expandir contexto, alternar whitespace e marcar arquivos como revisados.
6. Atualizar referências por fetch explícito e criar uma nova comparação.

Revisão por teclado, foco visível, números de linha, identificação além de cores,
estados de carregamento, vazio, cancelamento e erro fazem parte da entrega.
Binários, submódulos, arquivos removidos, renomes e conteúdo grande devem ter
representação explícita: nunca esconder silenciosamente um arquivo não renderizado.

Ficam para depois: edição, staging, commit, merge, rebase, push, criação de PR,
comentários compartilhados, IA, diff semântico, comparação de imagens, Git LFS
com download automático e alterações não commitadas. O MVP informa que working
tree e index não entram na comparação. Conteúdo LFS aparece como ponteiro.

## Semântica Git

- **Mudanças da branch (padrão):** diff entre merge-base(base, head) e head,
  equivalente a `git diff base...head`. Explicar a direção na interface.
- **Comparação direta:** diff entre árvores de base e head, equivalente a
  `git diff base head`. Não confundir com uma previsão de conflitos de merge.
- Resolver seleções para IDs de commit uma vez, guardando base, head e merge-base
  na sessão. Todas as páginas/hunks usam esses IDs, mesmo se as refs mudarem.
- Listar refs completas, distinguindo `refs/heads/` e `refs/remotes/`.
  Sugerir upstream e fallback configurável; não assumir que a base se chama main.
- `origin/main` é a cópia local da ref remota. Fetch é uma ação explícita que
  atualiza refs/objetos e pode usar rede/credenciais. Não fazer pull ou checkout.
  Mostrar horário do último fetch feito pela ferramenta; refs existentes têm
  atualização desconhecida, não necessariamente atual.
- Sem ancestral comum, histórico shallow ou múltiplos merge-bases: apresentar
  diagnóstico e opções explícitas. No MVP não escolher uma base ambígua sozinho.
  Comparação direta segue disponível quando os objetos necessários existem.
- Renomes usam a detecção do Git com política documentada; não são garantia de
  identidade. Mostrar mudança de modo, symlinks e gitlinks como metadados.

Fontes: [git diff](https://git-scm.com/docs/git-diff),
[git fetch](https://git-scm.com/docs/git-fetch),
[git rev-parse](https://git-scm.com/docs/git-rev-parse).

## Arquitetura proposta

```text
apps/cli          inicia sessão, verifica pré-requisitos, abre navegador
apps/server       HTTP, sessão local, cancelamento, lifecycle
apps/web          React, navegação, renderização e estado de revisão
packages/core     casos de uso e modelos; sem filesystem/HTTP/React
packages/git      subprocessos Git, refs, objetos e normalização de diff
packages/contracts schemas da API e erros estruturados
tests/fixtures    geradores de repositórios temporários determinísticos
tests/e2e         jornadas com Git real e navegador
scripts           validações e benchmarks
docs/adr          decisões e mudanças de arquitetura
```

Core recebe uma porta RepositoryReader; git implementa essa porta. Server
chama os casos de uso e web depende apenas dos contratos. Não criar dependência
do core sobre git, server ou web. Validar essas fronteiras automaticamente.

API mínima: listar refs; criar comparação; listar arquivos; carregar diff e
contexto de um arquivo; fetch de remote previamente enumerado; encerrar sessão.
RepositoryId, ComparisonId e FileId são opacos. A API não aceita comandos Git,
paths arbitrários ou URLs de remote enviadas pelo navegador.

Modelo de comparação: refs exibidas + IDs resolvidos + modo + opções + merge-base.
Modelo de arquivo: caminhos antigo/novo, status, modos, estatísticas opcionais,
tipo e disponibilidade. Modelo de hunk: intervalos de linhas e linhas tipadas.
Erros estáveis: ref inexistente, sem base comum, histórico incompleto, Git ausente,
timeout, acesso negado e limite de conteúdo. Limitação nunca equivale a diff vazio.

Usar Git CLI como fonte de verdade, com argumentos separados, sem shell,
`--no-ext-diff`, `--no-textconv`, saída sem cores/pager e formatos delimitados
por NUL para caminhos. Validar refs e resolver para commits antes do diff.
Não aplicar parsers por linha a listagens de caminhos. Spikes devem definir como
associar metadados e patches sem perder caminhos com tabs, quebras de linha ou
bytes inválidos em UTF-8. Conteúdo do repositório nunca executa scripts ou HTML.

## Sessão local e desempenho

Bind exclusivamente em loopback, porta dinâmica, token efêmero por execução,
validação de Host e Origin, sem CORS permissivo. Trocar token de bootstrap por
sessão local; não persistir token em URL ou logs. Proteção de DNS rebinding e
requisições de sites externos deve ter teste de integração. Servir somente assets
do app; nenhuma rota genérica de leitura do disco. Abrir navegador sem shell.

Fetch usa Git e credenciais existentes, com timeout/cancelamento e erro acionável;
não armazenar segredos. A política inicial não abre prompts interativos no servidor.
Nenhum upload de código, telemetria ou banco obrigatório no MVP.

Resumo primeiro, diffs sob demanda, virtualização e limites explícitos. Cancelar
requisições obsoletas ao trocar comparação. Cache limitado por IDs de commit,
caminhos e opções. Revisado é salvo localmente por identidade da comparação;
mudança de commits não herda marcação automaticamente.

Metas provisórias: em fixture de 1.000 arquivos alterados, resumo p95 <= 2s e
primeiro arquivo textual de até 200 KiB p95 <= 500ms, após startup. Registrar
hardware, versões, cache frio/quente e tamanho do repositório. Conteúdo acima de
limites deve oferecer diagnóstico/ação, sem congelar a UI. Limites definitivos,
memória e escolha do renderer serão definidos no spike, não prometidos agora.

## Harness e entregas

### Fase 0 — Base executável

Criar workspace, TS strict, lockfile, lint/format, contratos de exemplo e testes
de fronteiras. Padronizar comandos `dev`, `build`, `lint`, `typecheck`, `test`,
`test:integration`, `test:e2e` e `check`. Os comandos estão implementados;
a conclusão da fase depende das verificações em docs/PHASE-0.md.
CI roda em Linux, macOS e Windows para integração Git; smoke E2E nas três
plataformas, suíte completa inicialmente em Chromium/Linux. Instalar navegadores
de teste explicitamente. Não depender de config ou credenciais do desenvolvedor.

Critério: checkout limpo consegue instalar, verificar e executar um smoke test
que inicia/encerra serviço local. Testes rejeitam acesso externo e cruzamento
indevido das fronteiras entre pacotes. Documentar pré-requisitos e comandos.

### Fase 1 — Motor Git

Primeira implementação e testes reais entregues conforme ADR 0003; ver
docs/COMPARISON.md para escopo, limites e verificações pendentes.

Gerador de repos temporários com branch divergente e remote bare local; testar
os dois modos, refs locais/remotas, fetch e imutabilidade dos SHAs da sessão.
Cobrir add/delete/rename, whitespace, CRLF, sem newline final, Unicode, caminhos
especiais, binário, symlink quando suportado, mudança de modo, submódulo,
shallow, sem ancestral e bases ambíguas. Testar injeção, timeouts e limites.

Critério: resultados correspondem ao Git real em fixtures com expectativas
independentes; repositório de origem permanece intacto nas operações de leitura.
Fetch só modifica o que sua política documenta. Erros de parsing não perdem dados.

### Fase 2 — Fatia vertical

CLI, API e UI implementadas para teste local. O usuário confirmou execução do
bootstrap e autorizou esta fatia; validação HTTP/E2E permanece bloqueada no
ambiente atual. Não declarar a fase validada antes desses testes.

CLI → serviço → refs → comparação → lista → um diff real. Integrar cancelamento
e erros. E2E seleciona uma branch local contra origin/main e verifica um hunk
conhecido sem alterar a branch corrente ou o working tree.

### Fase 3 — Experiência de revisão

Escolher renderer após avaliar unified/split, expansão de contexto, virtualização,
licença, acessibilidade e bundle. Acrescentar filtros, atalhos, whitespace e
revisado. E2E verifica navegação por teclado, contexto, troca de modo e reset
da marcação ao mudar commits. Screenshots ajudam a revisar layout, mas não
substituem as verificações de conteúdo.

### Fase 4 — Preparação para uso

Comando local via `npm link` disponível após build; distribuição pública pendente.
Benchmark de repos grandes, lifecycle robusto, empacotamento da CLI, README de
uso e matriz real de plataformas. Critério: instalação limpa, execução de ponta
a ponta, saída que encerra processos e limites documentados. Desktop só depois.

## Processo de implementação

Cada tarefa identifica fase, contrato afetado, critérios observáveis e validação.
Entregar fatias pequenas funcionando, atualizar ADR quando mudar uma decisão e
registrar limitações verificadas. Não implementar todos os recursos antes de
provar a semântica Git e a execução local. Testes unitários cobrem lógica pura;
integração usa Git real; E2E cobre o percurso do usuário. Evitar mocks do motor
Git como única evidência e testes que apenas repetem a implementação.

Nome e comando definidos: `gpeek`. Disponibilidade no registro npm ainda não verificada.

Decisões pendentes: renderer de diff, atualização da
stack após validação inicial, limites definitivos, idiomas da UI e se WSL entra na primeira matriz.

Marcação OK e comentários pessoais por arquivo implementados conforme ADR 0004.
Persistência entre execuções permanece pendente.

Exportação Markdown da revisão pessoal disponível na interface: contexto imutável
da comparação, caminhos, marcação OK e comentários, sem código-fonte ou diff.
