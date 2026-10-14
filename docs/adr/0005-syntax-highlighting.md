# ADR 0005 — Leitura do diff e destaque de sintaxe

Status: implementado.

## Decisão

Manter o renderer React existente. Usar highlight.js 11.11.1 (BSD-3-Clause)
apenas na web, com gramáticas importadas explicitamente e linguagem pelo caminho.
Não altera contratos, semântica Git ou conteúdo retornado pela API.

Verde/vermelho ficam nos números e sinais, com fundo de 4% nas linhas;
a cor do texto depende da sintaxe. Os sinais +/− permanecem no unificado.
No modo lado a lado, as colunas Antes/Depois e os números coloridos indicam a mudança.

Cada lado de cada hunk é destacado separadamente e memorizado, preservando
comentários e strings multilinha dentro do trecho disponível. O markup do
highlighter é convertido em texto e spans React com classes permitidas;
conteúdo do repositório não é inserido como HTML ativo.

## Limites

O contexto anterior ao hunk não está disponível: um trecho que começa dentro
de comentário ou string pode receber cores incompletas. Extensões desconhecidas,
falhas e hunks acima de 100.000 caracteres por lado usam texto simples.
Inclui Java, JS/TS/JSX/TSX, Python, JSON, HTML/XML/SVG, CSS/SCSS, shell,
SQL, YAML, Markdown, Go, Rust, C/C++, C#, Kotlin, Ruby, PHP, Swift,
Dockerfile, INI/TOML e patches. Não há autodetecção nem virtualização nesta mudança.

API usada: [highlight.js](https://highlightjs.readthedocs.io/en/latest/api.html).
