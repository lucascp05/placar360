# Placar360

Central de futebol local em português. Requer Node.js 24. Use `npm start` e abra http://127.0.0.1:3600/. O projeto usa módulos nativos e dispensa instalação de dependências.

## Fontes avaliadas

| Fonte | Atualização e disponibilidade | Cobertura e custo | Acesso e uso |
| --- | --- | --- | --- |
| [OpenLigaDB](https://www.openligadb.de/en/terms-of-use) | REST. Sugere uma consulta a cada 30–60 s por liga ativa. Dados comunitários, sem SLA ou prazo de publicação. | Bundesliga no Placar360, gratuita. | Sem chave. [ODbL 1.0 com atribuição](https://www.openligadb.de/en/license). |
| [API-Football](https://www.api-football.com/documentation-v3) | REST. O fornecedor atualiza o endpoint ao vivo em ciclos de cerca de 15 s, com atraso variável por competição. | [100 consultas/dia no plano gratuito](https://www.api-football.com/pricing), com restrição de temporadas. A cobertura de cada competição varia por temporada e plano. | Chave no servidor. Aplicam-se os [termos do fornecedor](https://api-sports.io/terms) e os direitos de terceiros sobre escudos e marcas. |
| [Sportmonks](https://www.sportmonks.com/faq/) | REST por polling. O fornecedor relata eventos em questão de segundos, sem medição independente neste projeto. | Gratuito para as principais ligas da Dinamarca e Escócia. Demais ligas dependem de assinatura. | Token e uso sujeito aos termos da assinatura. |
| [football-data.org](https://www.football-data.org/pricing) | REST. Placares atrasados no plano gratuito. | 12 competições e 10 consultas/minuto no gratuito. | Token. Licença e dados conforme [plano e cadastro](https://www.football-data.org/client/register). |

A OpenLigaDB foi escolhida para funcionar sem cadastro e permitir testar com dados reais. A fonte pode omitir o minuto corrente e fases em andamento. Seu histórico inclui gols e autores quando registrados. Cartões, assistências, substituições e VAR dependem da integração opcional API-Football. Quando configurada, ela substitui a fonte padrão. O app não mede o intervalo entre um evento em campo e sua publicação, pois os feeds não fornecem ambos os horários.

## Configuração opcional

Crie um arquivo local `.env` com `API_FOOTBALL_KEY`. Defina `API_DAILY_LIMIT` somente se a cota do seu plano permitir. O padrão de 100 consultas usa um intervalo ao vivo de pelo menos 72 segundos, sujeito à cota diária e ao tempo de resposta. Consultas de agenda e histórico também consomem cota. Nenhuma chave fica no navegador. Não houve contratação de serviço.

## Operação

O backend compartilha o cache por data e entrega mudanças incrementais por SSE. O navegador se reconecta automaticamente e recebe uma cópia atualizada. O cache em disco da temporada OpenLigaDB é atualizado após uma consulta completa. O painel informa o horário da consulta, o tempo de coleta/cache e o processamento após a coleta.

Execute `npm test` para validar datas, normalização de dados reais quando o cache estiver disponível, eventos duplicados e correções. Com o servidor aberto e um Chrome isolado com depuração local na porta 9338, `node browser-check.mjs` valida navegação, histórico, busca, favoritos, controle de som, layout móvel e resposta sob 100 consultas locais concorrentes. Arquivos de captura ficam no diretório temporário.
