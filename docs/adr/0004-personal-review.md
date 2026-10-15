# ADR 0004 — Revisão pessoal no navegador

Marcação OK e comentários são persistidos pelo adaptador local em
`gpeek-reviews-v1` dentro do diretório Git da sessão. Não entram no working tree,
index ou refs, nem são compartilhados por Git. A API autenticada valida entrada
externa e o navegador mantém estado imediato; falhas de leitura/escrita são visíveis.
O core recebe uma porta de leitura/escrita sem depender de filesystem ou HTTP.

Cada arquivo usa uma chave SHA-256 dos caminhos em bytes, objetos Antes/Depois,
modos e status. Commits que alteram outros arquivos preservam OK e comentários;
alterações em qualquer lado, modo ou caminho iniciam uma revisão vazia. Opções de
visualização e whitespace não invalidam a identidade dos conteúdos. Reabrir a CLI
em outra porta recupera as notas. Worktrees têm armazenamento próprio no seu diretório Git.
Escritas usam arquivo temporário privado e rename; saves da aba são serializados.
Limites: 100 comentários por arquivo, 10.000 caracteres por comentário.
Texto é renderizado pelo React sem HTML ativo; dados lidos são validados.
Notas antigas em localStorage não são migradas automaticamente. Duas abas podem
sobrescrever a mesma anotação; a última gravação vence. Rascunhos não são salvos.

A interface exporta Markdown no navegador, sem API ou acesso ao filesystem do
repositório. Inclui somente arquivos não OK com comentários de toda a comparação, sem aplicar
o filtro da árvore; metadados e notas ficam em blocos literais com delimitadores seguros.

## Comentários por linha

Comentários podem ser strings legadas (arquivo inteiro) ou objetos com texto,
lado `old`/`new` e número inteiro positivo da linha. O armazenamento aceita os dois formatos. A leitura valida os dois formatos;
limites de quantidade e texto são compartilhados entre comentários gerais e por linha.

A referência pertence ao caminho e aos objetos imutáveis dos dois lados:
`old` representa o blob inicial do diff (`fromCommit`) e `new` o blob do head.
Nunca é uma referência ao working tree. No unificado, clicar no código de contexto
usa o lado novo; os dois números permitem escolher explicitamente o lado.
No split, cada coluna abre uma referência independente. Notas de fim de arquivo
e células vazias não têm linha comentável. Os comentários aparecem abaixo da
linha nos dois modos, e o resumo do arquivo lista todas as notas com sua referência.
Números de linha são botões acessíveis por teclado; selecionar texto não abre o formulário.

A exportação inclui lado e número, junto dos caminhos e SHAs já presentes,
sem incorporar código-fonte. Comentários antigos mantêm a indicação de arquivo inteiro.
A funcionalidade é local e pessoal: não publica comentários em provedores Git.
Não inclui seleção de intervalos nem edição de comentários.
Rascunhos não são persistidos e são descartados ao trocar arquivo ou comparação.

## Exportação compacta para consumo por LLMs

Arquivos OK são omitidos mesmo quando têm comentários; a marcação indica que
não há observação pendente a exportar. Arquivos sem comentários também ficam fora.
Contexto (refs, SHAs, modo e whitespace) aparece uma vez, com a relação dos lados
Antes/Depois aos commits. Cada arquivo mantém caminhos e status Git; cada nota
mantém texto integral e referência geral ou de linha. Não repetir estado OK,
contadores nem títulos numerados. Sem notas pendentes, emitir contexto e aviso.

Comentários são identificados como dados da revisão, não instruções. Blocos
literais continuam protegendo delimitadores e texto não confiável; isso não
constitui garantia contra prompt injection. Não truncar notas silenciosamente
nem impor orçamento arbitrário de tokens. Código e diff permanecem omitidos;
o consumidor precisa consultar os commits para verificar as observações.
