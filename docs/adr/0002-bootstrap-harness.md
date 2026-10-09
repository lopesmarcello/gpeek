# ADR 0002 — Workspace e harness da fase 0

Status: implementado; HTTP/E2E passaram localmente em 09/10/2026 fora do sandbox.
Verificação completa do lockfile e matriz CI corrigida permanecem pendentes.

## Decisão

Usar npm workspaces e ESM com Node 24 LTS, TypeScript strict, React/Vite,
Vitest e Playwright. Dependências diretas têm versões exatas; o lockfile aponta
para o registro público do npm. Nesta entrega: React 18.3.1, Vite 6.4.3,
TypeScript 5.7.3, Vitest 2.1.9 e Playwright 1.64.0. As versões instaladas foram
selecionadas do cache disponível e verificadas em conjunto; a instalação do
Playwright depende da restauração do acesso ao npm.

Workspace modules exportam fonte para TypeScript e a condição `development`,
e JavaScript compilado para Node. Vitest e o build da UI usam a condição de
fonte. A CLI em produção usa o código compilado. O script de build executa a
checagem de tipos antes da emissão; não cria um bundle do servidor nem copia
node_modules. Distribuição pública da CLI permanece para a fase 4.

A verificação de fronteiras lê imports, exports, imports de tipos e imports
dinâmicos com o parser do TypeScript, além das dependências dos manifests.
Não são permitidos caminhos dinâmicos de módulo dentro da aplicação. Os testes
verificam tanto exemplos proibidos como os arquivos reais do workspace.
O adaptador Git ainda contém apenas a verificação do executável.

O servidor carrega somente assets compilados em uma tabela de rotas, sem leitura
arbitrária de paths recebidos. A restrição de filesystem ao adaptador Git se
refere a dados do repositório; servir assets próprios é responsabilidade do servidor.
Tokens são aleatórios, efêmeros e usados uma vez. O navegador remove o fragmento
antes do bootstrap e recebe um cookie HttpOnly/SameSite=Strict. Não há configuração
para expor o serviço fora do loopback. Abrir URL no navegador usa argv sem shell.

## Validação e limites

CI declara Linux, macOS e Windows com Chromium. O harness é configurado para
smoke e traces em falhas; ainda não houve execução da CI. Testes de integração
não são mockados ou ignorados quando a máquina proíbe sockets.

O ambiente de implementação permitiu instalação pelo cache de dependências e
execução dos testes puros e Git, mas bloqueou DNS do npm e abertura de portas.
O lockfile foi validado estruturalmente pelo npm com `--package-lock-only`.
Playwright e alguns binários de outras plataformas estão fixados por versão e
URL; seus checksums não puderam ser obtidos localmente. Uma instalação limpa
com acesso ao registro e a execução da matriz são critérios ainda pendentes.

## Referências

- https://vite.dev/guide/
- https://playwright.dev/docs/ci
- https://registry.npmjs.org/@playwright/test/latest
- https://github.com/microsoft/playwright/tree/v1.64.0/packages

## Comando local durante o desenvolvimento

O manifest raiz expõe `gpeek` via `bin`, instalável com `npm link`
após o build. O launcher carrega a CLI compilada sem mudar o diretório atual;
sem `--repo`, a CLI usa `process.cwd()`, inclusive em subpastas do repositório.
O link depende do checkout e dos workspaces instalados, sem empacotamento público.

Nome aprovado: `gpeek`, usado no pacote raiz, comando, interface e identificação
da API. Workspaces internos usam o namespace `@gpeek/`.
