# Placar360

O Placar360 é uma central de futebol em português para acompanhar partidas e consultar o calendário sem sair do placar. A interface atende desktop e celular e apresenta datas e horários de Brasília.

## Como executar

Requer Node.js 24 e acesso HTTPS à fonte esportiva. O servidor usa módulos nativos do Node.js e o navegador executa JavaScript, HTML e CSS.

```sh
npm start
```

Abra [http://127.0.0.1:3600/](http://127.0.0.1:3600/). A aplicação escuta na interface local. Use `PORT` para selecionar outra porta.

## O que é possível acompanhar

- Consulte partidas por data, campeonato, equipe, status e favoritos.
- Use a agenda para consultar próximas partidas de um clube e abra a página de um campeonato pelo seu nome. Nela é possível filtrar a temporada por rodada, quando a fonte disponibiliza essa informação.
- Abra o placar de uma partida para ver sua linha do tempo. O painel de eventos reúne os acontecimentos informados para o dia selecionado.
- Ative o som de gol no cabeçalho. Em Configurações, escolha entre os temas claro e escuro e entre as visualizações padrão e compacta. Favoritos, tema e densidade ficam neste navegador.

## Fontes avaliadas

| Fonte | Atualização e disponibilidade | Cobertura e custo | Acesso e uso |
| --- | --- | --- | --- |
| [OpenLigaDB](https://www.openligadb.de/en/terms-of-use) | REST. Sugere uma consulta a cada 30–60 s por liga ativa. Dados comunitários, sem SLA ou prazo de publicação. | Bundesliga, 2. Bundesliga, Premier League, Champions League e Europa League 2026/27. | Sem chave. [ODbL 1.0 com atribuição](https://www.openligadb.de/en/license). |
| [API-Football](https://www.api-football.com/documentation-v3) | REST. O fornecedor atualiza o endpoint ao vivo em ciclos de cerca de 15 s, com atraso variável por competição. | [100 consultas/dia no plano gratuito](https://www.api-football.com/pricing), com restrição de temporadas. A cobertura de cada competição varia por temporada e plano. | Chave no servidor. Aplicam-se os [termos do fornecedor](https://api-sports.io/terms) e os direitos de terceiros sobre escudos e marcas. |
| [Sportmonks](https://www.sportmonks.com/faq/) | REST por polling. O fornecedor relata eventos em questão de segundos, sem medição independente neste projeto. | Gratuito para as principais ligas da Dinamarca e Escócia. Demais ligas dependem de assinatura. | Token e uso sujeito aos termos da assinatura. |
| [football-data.org](https://www.football-data.org/pricing) | REST. Placares atrasados no plano gratuito. | 12 competições e 10 consultas/minuto no gratuito. | Token. Licença e dados conforme [plano e cadastro](https://www.football-data.org/client/register). |

A OpenLigaDB funciona sem cadastro. Sua agenda e seu histórico incluem placares e autores dos gols quando a comunidade os registra. A fase e o relógio podem estar ausentes. A API-Football, quando configurada, oferece cobertura adicional, incluindo competições brasileiras, e pode retornar minutos, cartões, assistências, substituições, pênaltis e VAR. A disponibilidade depende da competição, da temporada e do plano.

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

O navegador recebe um estado inicial por Server-Sent Events e aplica inclusões, alterações e remoções de partidas sem recarregar a página. Uma reconexão recebe outro estado completo. Se a fonte falhar, o último estado disponível pode continuar visível enquanto o servidor adia as próximas tentativas. A agenda usa a fonte selecionada e combina seus resultados com o estado mais recente dos placares abertos.

O painel informa tempos de coleta, processamento e entrega local. A resposta HTTP da fonte mede somente a consulta. O atraso entre o acontecimento em campo e sua disponibilização pela fonte é desconhecido.

## Estrutura

- `source.js` integra e normaliza as fontes e controla seus limites de consulta.
- `server.js` configura o cache, as rotas HTTP e o canal SSE.
- `public/` contém a interface.
- `test/` e `browser-check.mjs` verificam a normalização e os fluxos da aplicação.

## Testes

Execute `npm test` para verificar fuso, normalização, deduplicação, correções, cache do calendário e cota compartilhada. O teste de leitura de uma temporada real usa o cache local se disponível.

Com o servidor aberto e um Chrome isolado com depuração local na porta 9338, execute `node browser-check.mjs`. O script verifica navegação, histórico, calendário por rodada, busca, favoritos, som, temas, densidade, larguras móveis, reconexão do SSE e consultas locais concorrentes. Defina `APP_URL` para testar em outra porta. As capturas são gravadas no diretório temporário.

## Capturas

[Placar e linha do tempo no desktop](docs/screenshots/desktop.png) · [Placar compacto em tema claro no celular](docs/screenshots/mobile.png)

## Limitações

- A cobertura padrão depende da edição comunitária. Jogos sem atualização de placar e sem uma fase informada podem continuar aparecendo como agendados.
- A API-Football exige uma chave para confirmar cobertura, temporadas acessíveis e eventos de cada competição. A integração seleciona uma fonte por instância e usa o último estado disponível em caso de falha.
- O calendário geral consulta uma janela em torno da data selecionada. A página de competição oferece a temporada e permite explorar suas rodadas.
