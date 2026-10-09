# Instruções de desenvolvimento

Leia README.md, docs/PLAN.md e as ADRs relevantes antes de implementar.
O plano foi aprovado: execução local via CLI + navegador e stack inicial da ADR 0002.
Consulte docs/PHASE-0.md antes de avançar: há verificações de infraestrutura pendentes.
Não começar o app completo antes de concluir o harness da fase 0.
O usuário autorizou posteriormente avançar até a comparação de branches após
confirmar que compilou e rodou o bootstrap; consulte docs/COMPARISON.md e a ADR 0003.
Isso não permite declarar verificações bloqueadas como aprovadas.

## Fronteiras

- Core independente de HTTP, React, filesystem e subprocessos.
- Git e filesystem exclusivamente no adaptador local; web usa contratos da API.
- Schemas validam entrada externa; TypeScript strict e erros estruturados.
- Mudança de arquitetura ou de semântica requer atualizar uma ADR e o plano.

## Git e dados locais

- Executar Git com argv, sem shell; nunca montar comandos com entrada do usuário.
- Comparações usam IDs resolvidos e são estáveis durante a sessão.
- Distinguir merge-base→head de base→head e remote-tracking de remoto atualizado.
- Não executar checkout, pull, merge, rebase, push, hooks ou filtros externos.
- Fetch apenas como ação explícita; preservar working tree/index.
- Tratar caminhos e conteúdo como dados não confiáveis; não renderizar HTML ativo.
- Não registrar código-fonte, tokens ou credenciais nos logs.

## Harness e conclusão

Na fase 0, implementar e documentar os scripts definidos no plano. Não alegar
que comandos inexistentes passaram. Integração deve usar repos temporários e
remotes bare locais com configuração isolada; nunca depender da rede ou alterar
o repo do usuário para testar. Usar Git real para validar semântica e parsing.

Para cada mudança: verificar os contratos e fronteiras afetados, executar checks
apropriados e registrar o que passou e o que não foi executado. Mudanças visuais
pedem smoke do navegador; mudanças Git pedem integração real. Adicionar testes
para comportamento relevante e falhas, evitando testes que espelham código.

Uma entrega só está concluída com os critérios da fase satisfeitos, documentação
atualizada e limitações explícitas. Não introduzir funcionalidades de fases
posteriores como requisito para uma entrega pequena.
