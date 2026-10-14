# ADR 0004 — Revisão pessoal no navegador

Marcação OK e múltiplos comentários em texto por arquivo ficam no localStorage,
sem envio ao servidor ou operações Git. Chaves incluem base, head, início do diff,
modo, whitespace e caminhos antigo/novo. Novos commits não herdam aprovação.
Comentários podem ser excluídos; texto é renderizado pelo React sem HTML ativo.
Limites: 100 comentários por arquivo, 10.000 caracteres por comentário.

Persistência é limitada à mesma origem do navegador. Como a CLI usa porta dinâmica,
uma nova execução não recupera esses dados automaticamente. Persistência entre
execuções permanece pendente. Comentários por linha foram adicionados conforme
a decisão abaixo. Falha de storage é visível;
a revisão permanece disponível em memória. Dados externos são validados ao ler.

A interface exporta Markdown no navegador, sem API ou acesso ao filesystem do
repositório. Inclui somente arquivos não OK com comentários de toda a comparação, sem aplicar
o filtro da árvore; metadados e notas ficam em blocos literais com delimitadores seguros.

## Comentários por linha

Comentários podem ser strings legadas (arquivo inteiro) ou objetos com texto,
lado `old`/`new` e número inteiro positivo da linha. A mesma chave de storage
é mantida para recuperar notas existentes. A leitura valida os dois formatos;
limites de quantidade e texto são compartilhados entre comentários gerais e por linha.

A referência pertence ao caminho e aos commits imutáveis da comparação:
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
Não inclui seleção de intervalos, edição de comentários ou persistência entre portas.
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
