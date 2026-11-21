import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultAlerts, matchAlerts, wantsAlert } from '../public/notifications.js';

const base = {id:'api-42',date:'2026-11-21',home:{name:'Mandante'},away:{name:'Visitante'},
  score:[0,0],status:'live',events:[]};
const goal = {kind:'Gol',detail:'Penalty',minute:32,extra:null,team:1,player:'Jogador'};

test('alertas de gol e pênalti compartilham a mesma identidade e incluem autor e placar',()=>{
  const match = {...base,score:[1,0],events:[goal,goal]};
  const alerts = matchAlerts(base,match);
  assert.equal(alerts.length,1);
  assert.match(alerts[0].detail,/Mandante 1 × 0 Visitante — Jogador, 32′/);
  assert(wantsAlert(defaultAlerts,alerts[0]));
  assert(wantsAlert(['penalty'],alerts[0]));
  assert(!wantsAlert(['yellow'],alerts[0]));
  assert.deepEqual(matchAlerts(null,match),[]);
  assert.deepEqual(matchAlerts(match,{...match,events:[{...goal,assist:'Outro'}]}),[]);
});

test('gol anulado segue o placar corrigido sem emitir um segundo gol',()=>{
  const match = {...base,score:[1,0],events:[goal]};
  const corrected = {...base,events:[{...goal,kind:'VAR',detail:'Goal cancelled'}]};
  const [record] = matchAlerts(match,corrected);
  assert.equal(record.title,'Gol anulado');
  assert.match(record.detail,/0 × 0/);
  assert(wantsAlert(['all'],record));
  assert(!wantsAlert(defaultAlerts,record));
});

test('identifica transições e cartões disponíveis na fonte',()=>{
  const start = matchAlerts({...base,status:'scheduled'},base);
  assert.equal(start[0].types[0],'start');
  const interval = matchAlerts(base,{...base,clock:'Intervalo'});
  assert.equal(interval[0].types[0],'interval');
  const results = matchAlerts(base,{...base,status:'final',events:[
    {kind:'Cartão',detail:'Yellow Card',minute:80},{kind:'Cartão',detail:'Second Yellow card',minute:85}
  ]});
  assert.deepEqual(results.map(alert=>alert.types[0]),['final','yellow','red']);
});
