# ADR 0004 — Revisão pessoal no navegador

Marcação OK e múltiplos comentários em texto por arquivo ficam no localStorage,
sem envio ao servidor ou operações Git. Chaves incluem base, head, início do diff,
modo, whitespace e caminhos antigo/novo. Novos commits não herdam aprovação.
Comentários podem ser excluídos; texto é renderizado pelo React sem HTML ativo.
Limites: 100 comentários por arquivo, 10.000 caracteres por comentário.

Persistência é limitada à mesma origem do navegador. Como a CLI usa porta dinâmica,
uma nova execução não recupera esses dados automaticamente. Persistência entre
execuções e comentários por linha ficam pendentes. Falha de storage é visível;
a revisão permanece disponível em memória. Dados externos são validados ao ler.
