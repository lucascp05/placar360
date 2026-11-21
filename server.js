import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { createSource, dateOf, priority } from './source.js';

const key = process.env.API_FOOTBALL_KEY?.trim();
const limit = Math.max(1, Number(process.env.API_DAILY_LIMIT) || 100);
const source = createSource(key,limit);
let seed = await source.initialize();
const days = new Map();
const validDay = date => /^20\d\d-\d\d-\d\d$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0,10)===date;
const shiftDay = (date,n) => new Date(Date.parse(date)+n*86400000).toISOString().slice(0,10);
const assets = new Map(await Promise.all([
  ['/','index.html','text/html'],['/app.js','app.js','text/javascript'],
  ['/notifications.js','notifications.js','text/javascript'],['/style.css','style.css','text/css']
].map(async ([route,file,type])=>[route,{body:await readFile(new URL('./public/'+file,import.meta.url)),type}])));
const frontendVersion = createHash('sha256').update(assets.get('/app.js').body).digest('hex').slice(0,12);
let busy = false;

function getDay(date) {
  let entry = days.get(date);
  if (!entry) {
    if (days.size>=35) {
      const unused = [...days].find(([,value])=>!value.clients.size);
      if (!unused) return null;
      days.delete(unused[0]);
    }
    entry = {date,matches:seed.filter(m=>m.date===date),clients:new Set(),updated:null,error:null,failures:0,next:0,processing:null,upstream:null};
    days.set(date,entry);
  }
  return entry;
}
function send(client, type, value) {
  if (client.writableLength > 256000) { client.destroy(); return; }
  client.write('event: '+type+'\ndata: '+JSON.stringify(value)+'\n\n');
}
function status(entry) {
  const {updated,error,processing,upstream,next} = entry;
  const nearby = seed.map(m=>m.date).filter(date=>date>entry.date).sort()[0] ?? null;
  return {updated,error,processing,upstream,next,nearby,source:source.name,supplemental:source.supplemental,limited:!key,leagues:source.leagues};
}
function publish(entry, type, value) {
  for (const client of entry.clients) send(client,type,value);
}
const seededAt = seed.length ? Date.now() : null;
async function refresh(entry) {
  busy = true;
  const started = performance.now();
  try {
    const all = await source.collect(entry.date,entry.matches);
    const received = performance.now();
    if (!key && all.length && entry.date===dateOf(Date.now())) seed = all;
    const matches = all.filter(m=>m.date===entry.date).sort((a,b)=>Date.parse(a.kickoff)-Date.parse(b.kickoff));
    const old = new Map(entry.matches.map(m=>[m.id,JSON.stringify(m)]));
    const upsert = matches.filter(m=>old.get(m.id)!==JSON.stringify(m));
    const idSet = new Set(matches.map(m=>m.id));
    const remove = entry.matches.filter(m=>!idSet.has(m.id)).map(m=>m.id);
    const first = !entry.updated && !entry.matches.length;
    entry.matches = matches;
    entry.updated = Date.now();
    entry.processing = Math.round((performance.now()-received)*100)/100;
    entry.upstream = Math.round(received-started);
    entry.error = null;
    entry.failures = 0;
    if (upsert.length || remove.length) publish(entry,'patch',{upsert,remove,first,publishedAt:Date.now()});
  } catch (error) {
    entry.error = error.name==='TimeoutError' || error.message==='fetch failed' ? 'Fonte temporariamente indisponível' : error.message;
    entry.failures++;
  } finally {
    const today = entry.date===dateOf(Date.now());
    const live = entry.matches.some(m=>m.status==='live' || (m.status==='scheduled' && Math.abs(Date.now()-Date.parse(m.kickoff))<150*60000));
    const apiLive = Math.max(15000, Math.ceil(7200000/limit));
    const detailsDue = key && !live && entry.matches.some(m=>m.status==='final' && !m.detailed);
    const delay = entry.failures ? Math.min(3600000, Math.max(key ? apiLive : 32000, 30000*2**Math.min(entry.failures,7)))
      : detailsDue ? Math.max(60000, apiLive) : today ? live ? (key ? apiLive : 33000) : key ? Math.max(apiLive,900000) : 900000 : 21600000;
    const nextKickoff = today && !live && entry.matches.filter(m=>m.status==='scheduled').map(m=>Date.parse(m.kickoff)-Date.now()).filter(ms=>ms>0).sort((a,b)=>a-b)[0];
    entry.next = Date.now()+Math.min(delay,nextKickoff || delay)+Math.floor(Math.random()*1500);
    publish(entry,'status',status(entry));
    busy = false;
  }
}
setInterval(()=>{
  if (busy) return;
  const today = dateOf(Date.now());
  const rank = e => e.date!==today ? 2 : e.matches.some(m=>m.status==='live') ? 0 : 1;
  const due = [...days.values()].filter(e=>e.clients.size && e.next<=Date.now()).sort((a,b)=>rank(a)-rank(b)||a.next-b.next);
  if (due.length) void refresh(due[0]);
},1000).unref();
setInterval(()=>{
  for (const entry of days.values()) for (const client of entry.clients) {
    if (client.writableLength>256000) client.destroy();
    else client.write(': keepalive\n\n');
  }
},15000).unref();

createServer(async (req,res)=>{
  const url = new URL(req.url,'http://localhost');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Placar360-Frontend',frontendVersion);
  res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' https:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  if (req.method!=='GET') { res.writeHead(405).end(); return; }
  const matchRoute = /^\/partidas\/(?:api|open|espn)-\d+$/.test(url.pathname);
  const asset = assets.get(matchRoute ? '/' : url.pathname);
  if (asset) {
    res.writeHead(200,{'Content-Type':asset.type+'; charset=utf-8','Cache-Control':'no-cache'});
    res.end(asset.body);
    return;
  }
  if (url.pathname==='/api/competitions') {
    res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-cache'});
    res.end(JSON.stringify({leagues:source.leagues}));
    return;
  }
  if (!['/api/stream','/api/status','/api/calendar','/api/match','/api/standings'].includes(url.pathname)) { res.writeHead(404).end(); return; }
  const date = url.searchParams.get('date') ?? dateOf(Date.now());
  if (!validDay(date)) { res.writeHead(400).end(); return; }
  if (url.pathname==='/api/standings') {
    const id = Number(url.searchParams.get('league'));
    const season = Number(url.searchParams.get('season'));
    if (![71,13].includes(id) || !Number.isInteger(season) || season<2000 || season>2099) {
      res.writeHead(400).end();
      return;
    }
    res.setHeader('Content-Type','application/json; charset=utf-8');
    try {
      const result = await source.standings(id,season);
      res.end(JSON.stringify({groups:result.value,cached:result.cached,error:result.error}));
    } catch {
      res.writeHead(503).end(JSON.stringify({error:'Classificação temporariamente indisponível'}));
    }
    return;
  }
  if (url.pathname==='/api/match') {
    const id = url.searchParams.get('id') ?? '';
    if (!/^(?:open|api|espn)-\d+$/.test(id)) { res.writeHead(400).end(); return; }
    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.setHeader('Cache-Control','no-store');
    let match = days.get(date)?.matches.find(m=>m.id===id) ?? seed.find(m=>m.id===id);
    let error;
    try {
      if (key && id.startsWith('api-') && (!match?.detailed || !match?.lineups?.length)) {
        match = await source.fixture(id) ?? match;
      } else if (!match && !key && id.startsWith('espn-')) {
        match = await source.fixture(id,date);
      } else if (!match && !key && id.startsWith('open-')) {
        const agenda = await source.calendar(date,date);
        match = agenda.matches.find(m=>m.id===id);
      }
    } catch (failure) { error = failure.message; }
    if (!match) res.statusCode = error ? 503 : 404;
    res.end(JSON.stringify({match,error}));
    return;
  }
  if (url.pathname==='/api/calendar') {
    const league = Number(url.searchParams.get('league'));
    const season = Number(url.searchParams.get('season'));
    if ((league && !priority.includes(league)) || (league && (!Number.isInteger(season) || season<2000 || season>2099))) {
      res.writeHead(400).end();
      return;
    }
    const from = url.searchParams.get('from') ?? shiftDay(date,-7);
    const to = url.searchParams.get('to') ?? shiftDay(date,21);
    if (!validDay(from) || !validDay(to) || to<from || to>shiftDay(from,29)) {
      res.writeHead(400).end();
      return;
    }
    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.setHeader('Cache-Control','no-store');
    try {
      const result = await source.calendar(from,to,league,season);
      const matches = new Map(result.matches.map(match=>[match.id,match]));
      for (const entry of days.values()) if (entry.updated) {
        for (const match of matches.values()) if (match.date===entry.date && !match.id.startsWith('espn-')) matches.delete(match.id);
        for (const match of entry.matches) matches.set(match.id,match);
      }
      const visible = [...matches.values()].filter(m=>league ? m.league.id===league&&m.league.season===season : m.date>=from&&m.date<=to);
      res.end(JSON.stringify({...result, matches:visible, from,to}));
    } catch (error) {
      res.writeHead(503).end(JSON.stringify({error:error.message}));
    }
    return;
  }
  const entry = getDay(date);
  if (!entry) { res.writeHead(503).end(); return; }
  const snapshot = {matches:entry.matches,date,...status(entry),cached:!entry.updated && entry.matches.length ? seededAt : null};
  if (url.pathname==='/api/status') { res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify(snapshot)); return; }
  if (entry.clients.size>=100) { res.writeHead(503).end(); return; }
  res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no'});
  res.write('retry: 2500\n\n');
  send(res,'snapshot',snapshot);
  entry.clients.add(res);
  res.on('close',()=>entry.clients.delete(res));
}).listen(Number(process.env.PORT)||3600,'127.0.0.1',function(){console.log('Placar360 em http://127.0.0.1:'+this.address().port);});


