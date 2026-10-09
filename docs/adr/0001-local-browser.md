# ADR 0001 — Serviço local com interface no navegador

Status: plano aprovado pelo usuário; stack inicial implementada conforme ADR 0002.

## Contexto

Precisamos comparar branches locais e referências remotas sem publicar código
em um serviço externo. A pasta inicial não contém uma aplicação existente.

## Decisão

Uma CLI inicia um serviço em loopback e abre uma SPA servida pelo próprio serviço.
O serviço usa o Git instalado na máquina. A interface acessa uma API específica
de revisão, sem acesso direto ao filesystem ou execução de comandos arbitrários.

Proposta de stack: TypeScript em modo strict, Node.js LTS, React e Vite,
workspaces npm, Vitest para integração/unidade e Playwright para jornadas.
Validar versões e compatibilidade no bootstrap; fixar versões no lockfile.

Separar domínio, adaptador Git, API e interface. A lógica de comparação não
depende de HTTP, React ou de um wrapper desktop.

## Alternativas

| Opção           | Benefício                                                   | Custo neste momento                                                             |
| --------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------- |
| CLI + navegador | Acesso local, distribuição simples para desenvolvedores     | Node e Git instalados; serviço e sessão locais precisam de proteção             |
| Electron        | Runtime de renderização consistente, integração com desktop | Distribuição de instaladores, atualização e manutenção por plataforma           |
| Tauri           | Integração nativa usando WebViews do sistema                | Rust e testes entre WebViews; custo inicial maior para esta proposta TypeScript |
| Web hospedada   | Acesso por URL                                              | Exige agente local ou envio de dados para acessar branches locais               |

Desktop pode ser avaliado depois de validar a experiência. Isso exige uma nova ADR;
não adicionaremos um wrapper antecipadamente.

## Consequências

Não há necessidade de APIs de GitHub/GitLab/Azure para o MVP. HTTPS/SSH e
credenciais são tratados pelo Git da máquina na operação explícita de fetch.
Primeiro suporte: repositório no mesmo ambiente do processo; WSL, containers e
acesso remoto exigem decisão própria sobre abertura do navegador e conectividade.

## Referências

- https://git-scm.com/docs/git-diff
- https://git-scm.com/docs/git-fetch
- https://tauri.app/concept/process-model/
- https://www.electronjs.org/docs/latest/tutorial/security/
