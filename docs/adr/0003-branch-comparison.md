# ADR 0003 — Primeira comparação de branches

Status: implementado; HTTP/E2E passaram localmente em 09/10/2026 fora do sandbox.
Confirmação da matriz corrigida permanece pendente; veja docs/PHASE-0.md.

## Escopo e autorização

Após confirmar que a aplicação compilou e rodou, o usuário autorizou continuar
até conseguir testar a comparação de branches. Esta fatia avança o motor Git
e a ligação CLI/API/UI, preservando as pendências de instalação, HTTP,
navegador e matriz de sistemas da fase 0. Não representa conclusão do MVP.

## Decisões

A CLI aceita `--repo` e usa o diretório atual quando ele é um repositório.
Sem repositório e sem caminho explícito, mantém a sessão inicial e apresenta
instruções para reiniciar com um caminho. Caminho explícito inválido encerra
com erro. Repositórios bare não fazem parte desta primeira entrega; worktrees
usam a raiz resolvida pelo próprio Git.

Core fornece o serviço de revisão e a porta RepositoryReader. O adaptador Git
implementa a porta, e o servidor compõe o serviço com IDs aleatórios. A CLI não
importa core diretamente. A API recebe apenas refs enumeradas, IDs opacos e
nomes de remotes existentes; o repositório é definido somente na CLI.

Comparações resolvem base/head para commits e guardam o commit inicial do diff.
O modo padrão exige uma única merge-base; comparação direta usa base→head.
Ausência de ancestral e bases ambíguas produzem erros acionáveis. Histórico
shallow é identificado, sem buscar objetos automaticamente. As últimas 12
comparações permanecem na sessão; refs que se movem não modificam os resultados.

Lista e estatísticas usam `git diff --raw` e `--numstat` com delimitadores NUL,
renomes a 50% e opções consistentes. Identidade dos caminhos permanece em bytes
no parsing; nomes fora de UTF-8 recebem indicação de exibição aproximada.
Caminhos especiais não entram em comandos de shell ou pathspecs recebidos da UI.

O diff textual por arquivo lê blobs por seus IDs, com limite de 512 KiB por
versão. Para arquivos adicionados/removidos, uma das versões é vazia. O adaptador
escreve os dois conteúdos em um diretório temporário privado, em arquivos com
modo 0600, e usa `git diff --no-index` sem filtros ou diffs externos. Remove o
diretório em finally. Não lê o conteúdo do working tree nem segue symlinks.
Isso evita confundir nomes e renomes com a identidade dos blobs. Depois de uma
interrupção abrupta do processo/sistema, temporários podem permanecer no diretório
do sistema; a limpeza garantida aplica-se à saída normal/erros controlados.

A UI mostra hunks com três linhas de contexto, números de linha, indicação
explícita de adição/remoção e modo unificado ou lado a lado. Contexto expansível,
syntax highlighting, virtualização, marcação de revisado e atalhos avançados
continuam para a fase de experiência de revisão.

## Limites e operações

- Resumo: até 10.000 arquivos e 16 MiB de saída por subprocesso Git.
- Diff textual: UTF-8, até 512 KiB por versão e 10.000 linhas renderizadas.
- Binários, submódulos, codificações e conteúdo acima do limite têm avisos;
  indisponibilidade nunca é apresentada como comparação vazia.
- Cancelamento de requisições interrompe subprocessos Git associados.
- Timeout: 15 segundos para leitura e 60 segundos para fetch.
- Fetch é explícito, valida o remote, não faz checkout/pull, não recursa
  submódulos, não escreve FETCH_HEAD e desabilita hooks e manutenção automática.
  Usa o Git e suas credenciais/configuração de transporte existentes, sem prompt
  de terminal. O horário registrado corresponde apenas a fetch bem-sucedido
  iniciado pela ferramenta. Comparações anteriores permanecem estáveis.
- Cookies são isolados por porta para permitir sessões simultâneas da ferramenta.

## Referências

- https://git-scm.com/docs/git-diff
- https://git-scm.com/docs/git-for-each-ref
- https://git-scm.com/docs/git-cat-file
- https://git-scm.com/docs/git-fetch
