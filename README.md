# Placar360

O Placar360 é uma central de futebol em português para acompanhar placares, consultar resultados e explorar o calendário. A interface tem navegação lateral no desktop e barra inferior no celular. As datas e os horários seguem o fuso de Brasília.

## Como executar

Requer Node.js 24 e acesso HTTPS à fonte esportiva. O servidor usa módulos nativos do Node.js e o navegador executa JavaScript, HTML e CSS.

```sh
npm start
```

Abra [http://127.0.0.1:3600/](http://127.0.0.1:3600/). A aplicação escuta na interface local. Use `PORT` para selecionar outra porta.

## O que é possível acompanhar

- A tela inicial reúne jogos do dia, partidas ao vivo, próximos jogos e resultados recentes. O histórico permite escolher uma data e consultar os resultados dos sete dias até ela.
- O calendário futuro tem atalhos para amanhã, sete dias e 30 dias. Filtre por campeonato, equipe e status.
- Na página de um campeonato, selecione a temporada, abra a aba Jogos para percorrer o calendário completo e filtre por rodada ou fase. As abas Classificação e Estatísticas exibem tabelas calculadas a partir da agenda disponível.
- Clique em um jogo para abrir sua página em `/partidas/<id>?date=<data>`. Use Resumo, Linha do tempo, Estatísticas, Escalações e Confrontos para consultar os dados fornecidos. É possível favoritar, copiar o link e voltar à consulta anterior.
- Abra um perfil de time pelo nome da equipe. Consulte sua agenda na competição selecionada, próximas partidas e os resultados usados para mostrar a forma recente.
- Pesquise equipes, campeonatos e partidas na janela carregada. Salve links de partidas, times e campeonatos em Favoritos. Os links e as preferências de tema e densidade ficam no navegador. O cabeçalho permite ativar som de gol.

## Alertas de partidas

Abra a página de um jogo e selecione **Ativar alertas**. Gols, cartões vermelhos e encerramento vêm selecionados. Também é possível escolher cartões amarelos, início, intervalo, pênaltis ou todos os acontecimentos disponíveis.

O sino abre a central com partidas acompanhadas, permissões, som, notificações não lidas e histórico. Para receber avisos do sistema operacional, clique em **Autorizar avisos do navegador**. O site pede permissão somente nessa ação. Se ela for negada, os alertas visuais continuam disponíveis enquanto a página estiver aberta.

Preferências e até 100 alertas são armazenados no navegador. A página acompanha por SSE os dias relevantes das partidas selecionadas, mesmo em outra seção. Eventos repetidos são deduplicados. Após uma reconexão, a fotografia do placar estabelece o novo ponto de partida para os alertas.

Os alertas exigem uma aba aberta. A entrega com a aba fechada exigiria um Service Worker, gestão de inscrições, chaves VAPID e um servidor acessível por HTTPS que continue consultando as fontes sem clientes conectados. Essas peças ainda não estão configuradas. [Especificação Push API](https://www.w3.org/TR/push-api/) · [RFC de VAPID](https://www.rfc-editor.org/rfc/rfc8292)

## Fontes avaliadas

| Fonte | Atualização e disponibilidade | Cobertura e custo | Acesso e uso |
| --- | --- | --- | --- |
| [OpenLigaDB](https://www.openligadb.de/en/terms-of-use) | REST. Sugere uma consulta a cada 30–60 s por liga ativa. Dados comunitários, sem SLA ou prazo de publicação. | Bundesliga, 2. Bundesliga, Premier League, Champions League e Europa League 2026/27. | Sem chave. [ODbL 1.0 com atribuição](https://www.openligadb.de/en/license). |
| [API-Football](https://www.api-football.com/documentation-v3) | REST. O fornecedor atualiza o endpoint ao vivo em ciclos de cerca de 15 s, com atraso variável por competição. | [100 consultas/dia no plano gratuito](https://www.api-football.com/pricing), com restrição de temporadas. A cobertura de cada competição varia por temporada e plano. | Chave no servidor. Aplicam-se os [termos do fornecedor](https://api-sports.io/terms) e os direitos de terceiros sobre escudos e marcas. |
| [Sportmonks](https://www.sportmonks.com/faq/) | REST por polling. O fornecedor relata eventos em questão de segundos, sem medição independente neste projeto. | Gratuito para as principais ligas da Dinamarca e Escócia. Demais ligas dependem de assinatura. | Token e uso sujeito aos termos da assinatura. |
| [football-data.org](https://www.football-data.org/pricing) | REST. Placares atrasados no plano gratuito. | 12 competições e 10 consultas/minuto no gratuito. | Token. Licença e dados conforme [plano e cadastro](https://www.football-data.org/client/register). |

A OpenLigaDB funciona sem cadastro. Sua agenda e seu histórico incluem placares e autores dos gols quando a comunidade os registra. No modo sem chave, a [ESPN](https://www.espn.com.br/futebol/) também fornece placares, calendário e acontecimentos para Brasileirão Série A, Copa do Brasil e Copa Libertadores da América. A ESPN fornece a classificação da Série A e dos grupos da Libertadores. As rodadas da Série A de 2026 seguem a [tabela da CBF](https://www.cbf.com.br/futebol-brasileiro/noticias/detalhes/competicoes-campeonato-brasileiro-serie-b/cbf-divulga-tabela-detalhada-das-primeiras-rodadas-do-brasileirao-2026) quando o placar da ESPN não informa o número.

A API-Football, quando configurada, continua fornecendo placares e calendários e pode retornar minutos, cartões, assistências, substituições, pênaltis e VAR. A disponibilidade depende da competição, da temporada e do plano.

Na avaliação local, a OpenLigaDB retornou calendários e resultados para as cinco competições configuradas. As consultas sem credenciais à API-Football, à football-data.org e à Sportmonks foram recusadas. Os tempos informados por esses fornecedores são estimativas de suas documentações.

## Configuração opcional

Para usar a API-Football, crie um arquivo `.env` na raiz:

```dotenv
API_FOOTBALL_KEY=
API_DAILY_LIMIT=100
PORT=3600
```

Preencha a chave para ativar a integração. O servidor usa a mesma cota para placares, agenda e histórico. Com 100 consultas por dia, o intervalo configurado para partidas em andamento começa em 72 segundos, mais o tempo de resposta. O arquivo de ambiente e o cache local ficam fora do Git.

## Arquitetura e atualizações

O servidor compartilha os dados por dia entre conexões e prioriza as consultas de partidas em andamento. A OpenLigaDB recebe consultas da rodada ativa em intervalos de pelo menos 30 segundos e a temporada é armazenada em disco. Com a API-Football, o servidor alterna consultas por data e por identificadores de partidas próximas do início ou em andamento, quando o volume cabe em uma consulta.

O navegador recebe um estado inicial por Server-Sent Events e aplica inclusões, alterações e remoções de partidas sem recarregar a página. Uma reconexão recebe outro estado completo. Se a fonte falhar, o último estado disponível pode continuar visível enquanto o servidor adia as próximas tentativas. A agenda combina os resultados da fonte com o estado mais recente dos placares abertos. As temporadas são carregadas sob demanda e as consultas idênticas podem compartilhar o resultado. Detalhes de partidas encerradas na API-Football ficam em memória por até um dia, sujeitos ao limite do cache.

O painel informa tempos de coleta, processamento e entrega local. A resposta HTTP da fonte mede somente a consulta. O atraso entre o acontecimento em campo e sua disponibilização pela fonte é desconhecido.

## Estrutura

- `source.js` integra e normaliza as fontes e controla seus limites de consulta.
- `espn.js` normaliza a cobertura sul-americana, com caches separados para calendário, placares do dia e classificação.
- `server.js` configura o cache, as rotas HTTP e o canal SSE.
- `public/` contém a interface.
- `public/notifications.js` compara estados de partidas, aplica preferências, deduplica acontecimentos e controla a central de alertas.
- `test/` e `browser-check.mjs` verificam a normalização e os fluxos da aplicação.
- `docs/backlog.md` registra a auditoria e as entregas incrementais.

## Testes

Execute `npm test` para verificar fuso, normalização, deduplicação, correções, cache de agenda e detalhes históricos, cota compartilhada e falhas da fonte. O teste de leitura de uma temporada real usa o cache local se disponível.

Com o servidor aberto e um Chrome isolado com depuração local na porta 9338, execute `node browser-check.mjs`. O roteiro usa o cache real de Bundesliga e verifica navegação, histórico, detalhes, perfis, calendário por rodada e por intervalo, busca, favoritos, som, temas, densidade, larguras móveis, reconexão do SSE e consultas locais concorrentes. Defina `APP_URL` para testar em outra porta. As capturas são gravadas no diretório temporário.

Com o servidor sem chave e acesso às fontes, execute o roteiro com `CHECK_SOUTH_AMERICA=1` para verificar o catálogo, a navegação lateral, os resultados, os jogos agendados, as fases e as tabelas das três competições sul-americanas. Esse roteiro bloqueia apenas o SSE no navegador para confirmar que a agenda funciona independentemente do placar ao vivo.

Use `CHECK_NOTIFICATIONS=1` para testar os alertas por partida no Chrome. Esse roteiro injeta atualizações controladas no navegador para verificar alterações de placar, tipos de eventos, deduplicação, permissão negada e desativação.

## Capturas

[Placar e linha do tempo no desktop](docs/screenshots/desktop.png) · [Placar compacto em tema claro no celular](docs/screenshots/mobile.png)

## Limitações

- A cobertura padrão depende da edição comunitária. Jogos sem atualização de placar e sem uma fase informada podem continuar aparecendo como agendados.
- A API-Football exige uma chave para confirmar cobertura, temporadas acessíveis e eventos de cada competição. A integração seleciona uma fonte por instância e usa o último estado disponível em caso de falha.
- A classificação calculada pode divergir da oficial devido a regras de desempate, sanções e cobertura parcial. A artilharia inclui os autores que constam da agenda. O perfil de clube usa a temporada e a competição selecionadas. Elenco completo depende de integração adicional.
- A busca consulta partidas e times da janela carregada. Nas competições eliminatórias, os filtros seguem os agrupamentos publicados pelo fornecedor. A disponibilidade de jogos de ida e volta depende da estrutura do calendário da fonte.
