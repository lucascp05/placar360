import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createSource, dateOf, normalizeApi, normalizeOpen } from '../source.js';

test('agrupa partidas pelo dia de Brasília e rejeita dados incompletos',()=>{
  assert.equal(dateOf('2026-11-20T01:15:00Z'),'2026-11-19');
  assert.equal(normalizeOpen({matchID:1}),null);
  assert.equal(normalizeApi({fixture:{id:1}}),null);
});

test('compartilha consultas de calendário e respeita a cota entre rotas',async t=>{
  const queries = [];
  t.mock.method(globalThis,'fetch',async url=>{
    queries.push(new URL(url).searchParams);
    return Response.json({response:[]});
  });
  const source = createSource('chave-de-teste',1);
  const results = await Promise.all([
    source.calendar('2026-11-15','2026-12-13',78,2026),
    source.calendar('2026-11-16','2026-12-14',78,2026)
  ]);
  assert.deepEqual(results,[{matches:[],cached:false},{matches:[],cached:false}]);
  assert.equal(queries.length,1);
  assert.equal(queries[0].get('league'),'78');
  assert.equal(queries[0].get('season'),'2026');
  await assert.rejects(source.collect('2026-11-20',[]),/Cota diária/);
});

test('normaliza placares e autores dos gols de uma temporada real',async t=>{
  let rows;
  try { rows=JSON.parse(await readFile(new URL('../bundesliga-cache.json',import.meta.url),'utf8')); }
  catch (error) { if(error.code==='ENOENT') { t.skip('Cache real ainda não disponível');return; } throw error; }
  const normalized=rows.map(normalizeOpen);
  assert(normalized.every(Boolean));
  const game=normalized.find(match=>match.status==='final' && match.events.some(event=>event.kind==='Gol'&&event.player));
  assert(game);
  assert(game.score.every(Number.isFinite));
  assert.equal(game.events[0].kind,'Gol');
  assert(!game.events.some(event=>event.detail==='Intervalo'));
  assert.equal(game.events.at(-1).detail,'Encerramento');
  assert.equal(new Set(game.events.map(event=>event.id)).size,game.events.length);
});

test('normaliza eventos duplicados, VAR, acréscimos e correções de placar',()=>{
  const goal={type:'Goal',detail:'Normal Goal',time:{elapsed:90,extra:2},team:{id:10},player:{name:'Jogador'},assist:{name:'Assistente'}};
  const game={
    fixture:{id:123,date:'2026-11-20T01:15:00Z',status:{short:'2H',elapsed:90,extra:2}},
    league:{id:71,name:'Serie A'},
    teams:{home:{id:10,name:'Casa',logo:'javascript:alert(1)'},away:{id:20,name:'Visitante'}},
    goals:{home:1,away:0},events:[goal,goal]
  };
  const first=normalizeApi(game);
  assert.equal(first.clock,'90+2′');
  assert.equal(first.home.logo,'');
  assert.equal(first.events.filter(event=>event.kind==='Gol').length,1);
  assert.equal(first.events.at(-1).assist,'Assistente');
  const corrected=normalizeApi({...game,goals:{home:0,away:0},events:[{...goal,type:'Var',detail:'Goal cancelled'}]});
  assert.deepEqual(corrected.score,[0,0]);
  assert.equal(corrected.events.at(-1).kind,'VAR');
  assert(!corrected.events.some(event=>event.kind==='Gol'));

  const booked=normalizeApi({...game,events:[{...goal,type:'Card',detail:'Red Card'}]});
  assert.equal(booked.events.at(-1).kind,'Cartão');
  assert.equal(booked.events.at(-1).detail,'Red Card');
  const postponed=normalizeApi({...game,fixture:{...game.fixture,status:{short:'PST'}},events:[]});
  assert.equal(postponed.status,'other');
  assert.equal(postponed.statusLabel,'Adiado');
  assert.deepEqual(postponed.events,[]);
});
