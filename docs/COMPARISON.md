# Testar a comparação de branches

Na pasta da ferramenta, execute:

```sh
npm run dev -- --repo /caminho/absoluto/do/seu/repositorio
```

O navegador abre uma sessão local. O comando aceita caminhos entre aspas para
pastas com espaços. Se esta ferramenta estiver dentro de um repositório válido,
`npm run dev` usa esse repositório. Não é necessário trocar a branch corrente.

1. Escolha **Branch base**, por exemplo `origin/main`.
2. Escolha **Branch de trabalho**, por exemplo sua branch de feature local.
3. Use **Mudanças desde a base comum** para revisar mudanças que a branch
   introduziu. **Diferença entre as pontas** compara os dois commits finais.
4. Clique em **Comparar branches** e selecione um arquivo na lista.
5. A sidebar organiza arquivos por pastas expansíveis. Use **Expandir** ou
   **Recolher** para todas as pastas; a busca revela os resultados automaticamente.
   Sequências de pastas sem ramificações aparecem juntas para economizar espaço.
6. Alterne **Visualização** entre unificado e lado a lado; filtre caminhos se
   necessário. Para ignorar diferenças de espaços, marque a opção e compare
   novamente.

Referências remotas como `origin/main` são cópias locais. Para atualizá-las, use
**Atualizar remoto (fetch)** e depois compare novamente. Fetch acessa a rede e
usa as credenciais Git existentes. Sem credenciais disponíveis, autentique-se
pelo terminal e tente novamente. A ferramenta não faz checkout, pull ou push.

Mudanças não commitadas e staging ficam fora da comparação. Um resultado
continua mostrando os SHAs selecionados mesmo se você criar novos commits ou
atualizar refs. Clique em **Atualizar branches** para recarregar a seleção.

Binários, submódulos, codificações diferentes de UTF-8 e conteúdo grande têm
avisos explícitos. Não há edição de arquivos ou operação de merge.

## Validação desta entrega

Build, lint, tipos, 20 testes unitários e nove testes de integração com Git real
passaram. O serviço de revisão compilado também foi exercitado diretamente em
Node, usando uma fixture temporária. Testes de motor
usam Git real e remotes bare locais: modos, branches divergentes, snapshots,
fetch, renomes, adição/remoção, empty files, binários, symlinks, modo executável,
CRLF, caminhos especiais/bytes não UTF-8, bases ambíguas, ancestral ausente,
shallow, whitespace, codificação, limites de conteúdo e cancelamento.

Existem testes HTTP autenticados e E2E de seleção de branches/diff real,
mas esta sessão não consegue executá-los: sockets loopback retornam EPERM.
O Chromium gerenciado pelo Playwright não está instalado neste ambiente.
O teste suplementar tentou o Chromium do sistema e ele também foi impedido
de iniciar por restrições de sockets.
Não houve confirmação visual da tela nesta sessão nem execução da matriz de CI.

Para validar em sua máquina:

```sh
npm run check
```

O smoke suplementar `npm run test:ui` intercepta transporte HTTP e usa o motor
Git real para verificar a UI e gerar screenshots, sem servidor. Ele não substitui
`test:e2e`. Instale Chromium pelo Playwright antes de rodar os testes de navegador.

Ainda pendentes: benchmarks, cobertura de timeout com carga real, limpeza após
crash, checksums faltantes no lockfile e confirmação da matriz de plataformas.

A árvore de pastas foi adicionada após a confirmação do usuário de que a
comparação está funcional. Build e checks estáticos são verificados localmente;
o smoke com expansão, recolhimento, busca e seleção está no harness de UI.

Linhas longas no diff quebram automaticamente na largura do painel, nos modos
unificado e lado a lado. A quebra é visual: conteúdo, indentação e números das
linhas originais permanecem preservados.

A identidade visual usa verde `oklch(72.3% 0.219 149.579)` como cor principal
e superfícies em cinza zinc. Os tokens de cor ficam em `apps/web/src/style.css`;
adições, remoções e avisos preservam suas cores semânticas.

Renomeação para `gpeek`: lint, build com checagem de tipos, 20 testes unitários
e `npm link` em prefixo temporário com `gpeek --help` passaram. O smoke visual
foi tentado novamente; Chromium não iniciou por restrições de sockets.

## Revisão pessoal

Use **Arquivo OK** para marcar/desmarcar o arquivo. A árvore sinaliza OK e
comentários; o resumo mostra o progresso. Abra **Comentários pessoais** para
adicionar ou excluir comentários em texto. Eles são privados ao navegador.
Recomparar os mesmos commits recupera os dados no mesmo endereço; novos commits
não herdam a revisão. Uma nova execução/porta não recupera automaticamente
esses dados. Não há comentários por linha nesta entrega.

Validação da revisão pessoal: lint, build com tipos e 22 testes unitários
passaram na cópia temporária. O smoke inclui OK, comentários, texto sem HTML
ativo, recomparação e exclusão; execução bloqueada na inicialização do Chromium.
O checkout original está somente leitura e não recebeu estas alterações.

## Exportar para outra IA

Clique em **Exportar revisão (.md)** após criar uma comparação. O download
contém repositório, branches, SHAs, modo, opção de whitespace e os arquivos
com OK ou comentários. Inclui todos os comentários adicionados, mesmo em
arquivos ocultos pelo filtro; rascunhos ainda não adicionados ficam fora.
Comentários são exportados como texto literal. Código-fonte e diff não entram
no relatório. Você pode anexar o `.md` à outra IA junto do contexto necessário.

Validação da exportação: lint, build com checagem de tipos e 25 testes unitários
passaram na cópia temporária. O smoke verifica download, nome e conteúdo do
Markdown; execução bloqueada ao iniciar Chromium por restrições de sockets.
