# ADR 0006 — Visualização de conflitos de merge

Status: implementado em 14/10/2026, sob autorização explícita do usuário.

## Decisão

A análise é uma ação separada na comparação. Simula integrar head na base com
os SHAs resolvidos da sessão, independentemente do modo do diff e da opção de
whitespace. Não executa merge, checkout ou resolução de conflitos no repositório.
Core fornece a porta e valida existência da comparação, histórico completo e
uma única base comum. API autenticada GET `/api/comparisons/:id/conflicts` retorna
contrato validado pela UI. Comparações expiradas retornam NOT_FOUND.

Usar `git merge-tree --write-tree --messages -z` (Git >= 2.38) em repositório bare
temporário, com formato de objetos do original e acesso somente de leitura aos
objetos originais via alternates. Objetos resultantes ficam exclusivamente no
temporário. Configurações global/sistema, atributos do sistema e templates são
isolados; configuração local, hooks, drivers e filtros externos do usuário não
são importados. Atributos versionados e drivers internos do Git continuam válidos.
Nenhum fetch implícito, acesso ao working tree ou escrita ao index/refs originais.
A estratégia e configuração isoladas podem divergir de um merge personalizado.

O status de saída define clean/conflituoso, nunca a ausência de stages ou marcadores.
Stages são parseados por NUL e caminhos preservados em bytes. Mensagens com tipos
CONFLICT são exibidas com seus caminhos e diagnóstico, incluindo conflitos sem
stages. Os textos não são usados para deduzir conteúdo ou executar comandos.
A árvore produzida pelo Git fornece os conteúdos com marcadores diff3, preservando
anotações de renomes e SHAs. Não se refaz merge de blobs individualmente.
A UI mostra cada arquivo em seção expansível e conteúdo literal com quebra de
linhas, base/ancestral/trabalho identificados. Marcadores também podem existir no
conteúdo original; o diagnóstico Git é a fonte da identificação de conflitos.

## Limites

Histórico shallow, sem ancestral ou múltiplas bases comuns produz diagnóstico;
não escolher bases ambíguas nem buscar histórico automaticamente. Git antigo gera
erro acionável e não impede a comparação de diffs existente.
Até 10.000 arquivos, 16 MiB por subprocesso, 512 KiB por conteúdo, 2 MiB de
conteúdo por análise e 10.000 linhas por arquivo. Binário, conteúdo não UTF-8,
symlink, submódulo e limites têm avisos; caminhos não UTF-8 são aproximados na UI.
Conteúdo de modify/delete pode não conter marcadores: consultar o diagnóstico.
Timeout de 15 segundos por subprocesso e cancelamento via AbortSignal. Temporários
são removidos em finally; crash abrupto pode deixar resíduos no diretório do sistema.
Não há edição ou gravação de resoluções, nem persistência da análise entre sessões.
Pendências da fase 0 e da matriz de plataformas permanecem abertas.

## Referência

[Documentação do git merge-tree](https://git-scm.com/docs/git-merge-tree).
