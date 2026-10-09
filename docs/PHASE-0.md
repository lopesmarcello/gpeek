# Estado da fase 0

A estrutura está implementada. A fase ainda não está encerrada: faltam completar
a verificação do lockfile e confirmar a matriz de plataformas. HTTP e jornadas
de navegador passaram localmente em 09/10/2026 com execução fora do sandbox.

O usuário confirmou que compilou e rodou a ferramenta e autorizou avançar
até poder testar a comparação de branches. Essa confirmação não é tratada como
execução automatizada de HTTP/E2E ou da matriz de CI. A fatia está documentada
em docs/COMPARISON.md e na ADR 0003.

## Entregue

- Seis workspaces com contratos e fronteiras explícitas.
- TypeScript strict, ESLint, Prettier e scripts de verificação.
- CLI com verificação do Git e abertura do navegador sem shell.
- Serviço local com assets próprios, bootstrap de uso único, cookie de sessão,
  validação de Host/Origin, limites de entrada e encerramento.
- Interface React mínima para estado de conexão e encerramento da sessão.
- Fixture de Git real com remoto bare, configuração isolada e cleanup.
- Testes HTTP e da CLI, smoke Playwright e CI para os três sistemas.

## Evidência local

`lint`, `typecheck`, `build` e 19 testes unitários passaram. O teste de integração
que cria dois repositórios isolados, confere conteúdo local/remoto e verifica
commits determinísticos passou usando Git real.

O npm validou o lockfile via `install --package-lock-only --offline`. Isso não
comprova uma instalação limpa. As dependências instaláveis localmente foram
obtidas do cache em um diretório temporário; não alteramos a configuração global
do npm. O lockfile usa URLs públicas, sem caminhos ou credenciais privados.

## Pendências obrigatórias

1. Validar `npm ci` com acesso ao registro público, incluindo o Playwright e os
   binários por plataforma; completar os checksums ausentes do lockfile com os
   metadados do registro.
2. Integração HTTP e lifecycle da CLI: concluídos localmente em 09/10/2026
   fora do sandbox (14 testes de integração, incluindo Git real). Dentro do
   sandbox, sockets continuam retornando `listen EPERM`.
3. Chromium instalado pelo Playwright; três jornadas E2E passaram localmente
   fora do sandbox em 09/10/2026.
4. Confirmar a matriz Linux/macOS/Windows na CI.

As pendências continuam obrigatórias antes de declarar o harness concluído.
O motor e a primeira UI de comparação avançaram sob a autorização posterior do
usuário. Benchmarks e distribuição instalável continuam pendentes.

## Correção das falhas de CI de 09/10/2026

Logs da execução `37964830751` confirmaram instalação via `npm ci` nas três
plataformas, mas a matriz falhou em etapas distintas:

- Windows: Prettier rejeitou CRLF do checkout. `.gitattributes` agora fixa LF.
- macOS: a fixture tentou escrever nome não UTF-8 no filesystem. Agora cria
  o blob e insere o caminho em bytes pelo stdin de `git update-index -z
--index-info`, sem exigir que o filesystem represente esse nome. A mesma
  asserção passa a executar também no Windows.
- Linux: o E2E não encontrou o label exato dos selects. Os selects agora têm
  nomes acessíveis explícitos, sem incorporar o texto das opções.

Após as correções, lint/fronteiras, tipos, build, 25 testes unitários,
14 testes de integração e três E2E passaram localmente em Linux. Isso não
confirma macOS/Windows: é necessário executar a CI novamente com as mudanças.

O smoke suplementar `test:ui` também passou, incluindo marcação OK,
comentários e download Markdown. Seu seletor de OK agora busca o checkbox
por papel/nome, evitando ambiguidade com o indicador da árvore.

Uma execução posterior no Windows passou 13 testes de integração, mas falhou
na preservação de CRLF. A causa foi reproduzida localmente: `core.autocrlf=true`
global normalizava os temporários usados por `git diff --no-index`. O adaptador
agora desativa essa conversão somente para o diff de blobs. O teste configura
um HOME temporário com autocrlf ativo, falha antes da correção e passa depois,
sem alterar configuração do usuário. Build/tipos, lint/fronteiras, 25 testes
unitários e os 14 testes de integração passaram após essa mudança em Linux.
Windows ainda exige nova execução na CI; E2E não foi repetido nesta mudança.
