# Estado da fase 0

A estrutura está implementada. A fase ainda não está encerrada: faltam validar
instalação limpa, serviço HTTP e jornadas de navegador em um ambiente que
permita rede e sockets locais.

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
2. Executar integração HTTP e lifecycle da CLI. Neste ambiente o sistema retorna
   `listen EPERM` ao tentar abrir `127.0.0.1`, antes de testar as requisições.
3. Instalar Chromium pelo Playwright e executar as jornadas de navegador.
4. Confirmar a matriz Linux/macOS/Windows na CI.

As pendências continuam obrigatórias antes de declarar o harness concluído.
O motor e a primeira UI de comparação avançaram sob a autorização posterior do
usuário. Benchmarks e distribuição instalável continuam pendentes.
