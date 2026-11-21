# Evolução do Placar360

A base inclui placar por data, SSE com reconexão, eventos normalizados, agenda e preferências locais. A agenda pública lê temporadas já carregadas e a interface restringe a lista do campeonato a uma janela curta por padrão. A cobertura autenticada depende da chave, do plano e da cota compartilhada.

| ID | Prioridade | Dependência | Entrega e aceite | Status inicial |
| --- | --- | --- | --- | --- |
| 001 | Alta | — | Auditar a base e registrar o fluxo de entrega | Concluída |
| 002 | Alta | 001 | Carregar calendários da fonte por temporada e servir janelas validadas de até 30 dias | A fazer |
| 003 | Alta | 002 | Navegar campeonatos por temporada, fase e status, com acesso a toda a agenda | A fazer |
| 004 | Alta | 002 | Abrir detalhes de partidas e perfis de times por endereço próprio | A fazer |
| 005 | Alta | 003, 004 | Integrar início, calendário futuro, histórico, busca e favoritos nas duas larguras | A fazer |
| 006 | Alta | 005 | Verificar dados, testes e interface no navegador e atualizar o README | A fazer |

A recuperação de placares continua compartilhada por data via SSE. As rotas de consulta devem compartilhar as restrições da fonte. A publicação depende de um remoto GitHub e de uma sessão autenticada. As branches locais devem conservar os commits de cada entrega.
