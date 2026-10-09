# gpeek

Ferramenta local para revisar diferenças entre branches antes de abrir um PR.
Um comando inicia um serviço local e abre a interface no navegador.

A primeira comparação de branches está implementada: seleção de refs locais/remotas,
modo desde a base comum ou direto, lista de arquivos, estatísticas, diff unificado
ou lado a lado, fetch explícito, marcação OK e comentários pessoais por arquivo. Consulte [como testar](docs/COMPARISON.md).
As verificações de infraestrutura pendentes continuam em [estado da fase 0](docs/PHASE-0.md).

## Pré-requisitos e execução

Node.js 24 LTS, npm 11 e Git no PATH. Para abrir a interface, é necessário um
navegador padrão e o launcher do sistema (`xdg-open`, `open` ou `rundll32`).
O processo e o navegador devem estar no mesmo ambiente de rede; WSL e containers
não fazem parte da matriz inicial.

```sh
npm ci
npx playwright install --with-deps chromium
npm run dev -- --repo /caminho/absoluto/do/seu/repositorio
```

`dev` compila os módulos e a UI, inicia uma porta dinâmica em `127.0.0.1` e abre
uma sessão no navegador. Nesta fase, o comando não tem hot reload: execute-o
novamente após alterar o código. Encerre pelo botão da interface ou com Ctrl+C.

O endereço impresso no terminal não contém o token. A abertura pelo comando
estabelece a sessão; copiar somente o endereço para outro navegador não a cria.
O token inicial expira em cinco minutos e só pode ser usado uma vez. Reload na
mesma aba usa o cookie da sessão. `npm run dev -- --no-open` inicia somente o
serviço, sem autenticar uma interface; é útil para verificar o processo.

## Comando local (sem publicação no npm)

Na pasta desta ferramenta, após `npm ci`:

```sh
npm run build
npm link
```

Depois, em qualquer repositório, inclusive em uma subpasta dele:

```sh
cd /caminho/do/repositorio
gpeek
```

O comando usa a pasta atual e abre a interface no navegador. Para escolher outro
repositório, use `gpeek --repo /caminho`. Veja as opções com
`gpeek --help`. O link aponta para este checkout: mantenha-o no disco
e rode `npm run build` após atualizar o código. Não é necessário instalar
Playwright para usar a aplicação.

O diretório de executáveis do prefixo global do npm precisa estar no PATH.
Para remover o link: `npm unlink --global gpeek`.
Este fluxo serve para desenvolvimento local; publicação via npm/npx continua pendente.

## Comandos do harness

| Comando                    | Verificação                                                             |
| -------------------------- | ----------------------------------------------------------------------- |
| `npm run build`            | Tipos, módulos ESM e assets da UI                                       |
| `npm run lint`             | ESLint, formatação e fronteiras de arquitetura                          |
| `npm run format`           | Aplica a formatação                                                     |
| `npm run typecheck`        | TypeScript strict                                                       |
| `npm test`                 | Contratos, fronteiras e política de requisições locais                  |
| `npm run test:integration` | Git real, API HTTP e lifecycle da CLI; execute build antes              |
| `npm run test:e2e`         | Sessão no Chromium, reload, teclado e encerramento; execute build antes |
| `npm run check`            | Todas as verificações, incluindo build, integração e navegador          |

A CI configura Linux, macOS e Windows com Node 24 e smoke E2E em Chromium.
Todos os testes de Git usam diretórios temporários e remotes bare locais, com
configuração e identidade isoladas. Não precisam de credenciais ou serviços Git.
Testes de HTTP e navegador precisam de permissão para abrir portas loopback.
Falhas de infraestrutura não são convertidas em testes aprovados ou ignorados.

## Documentação

- [Testar a comparação de branches](docs/COMPARISON.md)
- [Decisão do motor de comparação](docs/adr/0003-branch-comparison.md)
- [Plano de produto, arquitetura e validação](docs/PLAN.md)
- [Decisão de execução local](docs/adr/0001-local-browser.md)
- [Decisões do harness](docs/adr/0002-bootstrap-harness.md)
- [Estado e validação da fase 0](docs/PHASE-0.md)
- [Instruções para implementação](AGENTS.md)
