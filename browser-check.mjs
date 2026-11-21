import assert from 'node:assert/strict';
import { writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dateOf } from './source.js';

const endpoint = process.env.BROWSER_DEBUG_URL || 'http://127.0.0.1:9338';
const base = process.env.APP_URL || 'http://127.0.0.1:3600';
const tab = await (await fetch(endpoint+'/json/new?about:blank',{method:'PUT'})).json();
const socket = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.onopen=resolve; socket.onerror=reject;});
const requests = new Map(), errors = [];
let sequence=0;
socket.onmessage=({data})=>{
  const reply=JSON.parse(data);
  if (reply.method==='Runtime.exceptionThrown') errors.push(reply.params.exceptionDetails.exception?.description ?? reply.params.exceptionDetails.text);
  if (!reply.id) return;
  const callback=requests.get(reply.id);
  requests.delete(reply.id);
  clearTimeout(callback.timeout);
  if(reply.error) callback.reject(Error(reply.error.message)); else callback.resolve(reply.result);
};
function send(method,params={}) {
  return new Promise((resolve,reject)=>{
    const id=++sequence;
    const timeout = setTimeout(()=>{
      requests.delete(id);
      reject(Error('Tempo esgotado no Chrome: '+method+' '+(params.expression ?? params.url ?? '')));
    },15000);
    requests.set(id,{resolve,reject,timeout});
    socket.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression) {
  const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});
  if(result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
}
async function until(expression, attempts=50) {
  for(let i=0;i<attempts;i++) {
    if(await evaluate(expression)) return;
    await new Promise(resolve=>setTimeout(resolve,150));
  }
  throw Error('Condição não atingida: '+expression+' '+errors.join(' '));
}
async function dateChange(date) {
  await evaluate("document.querySelector('#date').value="+JSON.stringify(date)+";document.querySelector('#date').dispatchEvent(new Event('change'))");
  await until("document.querySelector('article.match')");
}
async function navigate(url) {
  await evaluate('setTimeout(()=>location.assign('+JSON.stringify(url)+'),0); true');
  await until('location.href==='+JSON.stringify(new URL(url).href)+' && document.readyState!=="loading"');
}
async function capture(name) {
  const {data}=await send('Page.captureScreenshot',{format:'png'});
  const target=join(tmpdir(),'placar360-'+name+'.png');
  await writeFile(target,Buffer.from(data,'base64'));
  console.log(target);
}
try {
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Storage.clearDataForOrigin',{origin:base,storageTypes:'local_storage'});
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await navigate(base);
  await until("document.querySelector('#connection')?.textContent.includes('Conectado')");
  const rows=JSON.parse(await readFile(new URL('./bundesliga-cache.json',import.meta.url),'utf8'));
  const final=rows.filter(row=>row.matchIsFinished&&row.goals.length).at(-1);
  await dateChange(dateOf(final.matchDateTimeUTC));
  const count=await evaluate("document.querySelectorAll('article.match').length");
  assert(count>0);
  const historicRow = 'document.querySelector(\'[data-match="open-'+final.matchID+'"]\')';
  await until(historicRow);
  await evaluate(historicRow+".querySelector('[data-action=details]').click()");
  await until(historicRow+".querySelector('.timeline')?.textContent.includes('Gol')");
  await evaluate("if(document.querySelector('[data-action=favorite]').getAttribute('aria-pressed')==='false')document.querySelector('[data-action=favorite]').click();document.querySelector('.tabs [data-mode=favorites]').click()");
  assert.equal(await evaluate("document.querySelectorAll('article.match').length"),1);
  await evaluate("document.querySelector('.tabs [data-mode=all]').click();const input=document.querySelector('#search');input.value='equipe inexistente';input.dispatchEvent(new Event('input'))");
  assert(await evaluate("document.querySelector('#empty')"));
  await evaluate("document.querySelector('#search').value='';document.querySelector('#search').dispatchEvent(new Event('input'));document.querySelector('.tabs [data-mode=live]').click()");
  assert.equal(await evaluate("document.querySelectorAll('article.match').length"),0);
  await evaluate("document.querySelector('.tabs [data-mode=all]').click();document.querySelector('#sound').click()");
  await until("document.querySelector('#sound').getAttribute('aria-pressed')==='true'");
  await evaluate("document.querySelector('#sound').click()");
  await capture('desktop');
  const selected = dateOf(final.matchDateTimeUTC);
  const calendarResponse = await fetch(base+'/api/calendar?league=78&season='+final.leagueSeason+'&date='+selected);
  assert.equal(calendarResponse.status,200);
  const calendar = await calendarResponse.json();
  assert(calendar.matches.some(match=>match.status==='final'));
  assert(calendar.matches.some(match=>match.status==='scheduled'));
  assert(calendar.matches.every(match=>match.league.id===78));
  const matchUrl = base+'/?match=open-'+final.matchID+'&date='+selected;
  const detailResponse = await fetch(base+'/api/match?id=open-'+final.matchID+'&date='+selected);
  assert.equal(detailResponse.status,200);
  const detail = (await detailResponse.json()).match;
  assert(detail.events.some(event=>event.kind==='Gol'));
  await evaluate("document.querySelector('.league-heading a[href*=\"competition=78&\"]').click()");
  await until("location.search.includes('competition=78') && document.querySelector('#round-filter option:nth-child(2)')");
  assert.equal(await evaluate("document.querySelector('#heading').textContent"),'Bundesliga');
  await evaluate("const round=document.querySelector('#round-filter');round.selectedIndex=1;round.dispatchEvent(new Event('change'));");
  assert(await evaluate("document.querySelector('article.match')"));
  await evaluate("document.querySelector('[data-competition-tab=table]').click()");
  assert(await evaluate("document.querySelector('.data-table tbody tr')"));
  await evaluate("document.querySelector('.tools [data-agenda]').click()");
  await until("document.querySelector('#calendar-note').textContent !== 'Consultando a agenda…'");
  assert.equal(await evaluate("document.querySelector('#heading').textContent"),'Agenda');
  await evaluate("document.querySelector('.sidebar [data-settings]').click();const theme=document.querySelector('#theme');theme.value='light';theme.dispatchEvent(new Event('change'));const density=document.querySelector('#density');density.value='compact';density.dispatchEvent(new Event('change'));document.querySelector('#settings button').click()");
  assert.equal(await evaluate("document.documentElement.dataset.theme"),'light');
  assert.equal(await evaluate("localStorage.getItem('placar360-density')"),'compact');
  await evaluate("document.querySelector('.tools [data-agenda]').click();");
  await dateChange(selected);
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  assert(await evaluate('document.documentElement.scrollWidth <= 390'));
  await capture('mobile');
  await send('Emulation.setDeviceMetricsOverride',{width:320,height:720,deviceScaleFactor:1,mobile:true});
  assert(await evaluate('document.documentElement.scrollWidth <= 320'),JSON.stringify(await evaluate("[innerWidth,document.documentElement.scrollWidth,[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>320).slice(0,10).map(e=>[e.nodeName,e.className,e.getBoundingClientRect().right])]")));
  await navigate(matchUrl);
  await until("document.querySelector('.match-hero') && document.querySelector('#match-page .event')");
  await evaluate("document.querySelector('[data-match-tab=numbers]').click()");
  assert(await evaluate("document.querySelector('#match-page').textContent.includes('Estatísticas indisponíveis')"));
  await evaluate("document.querySelector('.match-hero a').click()");
  await until("location.search.includes('team=') && !document.querySelector('#profile-crest').hidden");
  await evaluate("document.querySelector('[data-save-profile]').click()");
  await navigate(base+'/?view=favorites');
  await until("document.querySelector('.saved-row a[href*=\"team=\"]')");
  await navigate(base+'/?view=upcoming&date='+selected);
  const monthButton = 'document.querySelector(\'[data-range="30"]\')';
  await until(monthButton+" && !document.querySelector('#range').hidden");
  await evaluate(monthButton+".click()");
  await until(monthButton+".ariaPressed === 'true' && document.querySelector('#calendar-note').textContent !== 'Consultando a agenda…'",120);
  await until("document.querySelector('#team-filter option:nth-child(2)')");
  await evaluate("const teams=document.querySelector('#team-filter');teams.selectedIndex=1;teams.dispatchEvent(new Event('change'))");
  assert(await evaluate("const team=document.querySelector('#team-filter').selectedOptions[0].textContent;[...document.querySelectorAll('article.match')].every(row=>row.textContent.includes(team))"));
  const from = dateOf(Date.now()+86400000);
  const to = dateOf(Date.now()+30*86400000);
  const upcoming = await (await fetch(base+'/api/calendar?from='+from+'&to='+to)).json();
  assert(upcoming.matches.some(match=>match.status==='scheduled'));
  assert(upcoming.matches.every(match=>match.date>=from&&match.date<=to));
  assert.equal((await fetch(base+'/api/calendar?from=2026-11-01&to=2026-12-01')).status,400);
  assert.equal((await fetch(base+'/api/calendar?league=9999&season=2026')).status,400);
  const nav=await evaluate("performance.getEntriesByType('navigation').map(({domContentLoadedEventEnd,transferSize})=>({domContentLoadedEventEnd,transferSize}))[0]");
  assert.deepEqual(errors,[]);
  await send('Network.enable');
  await send('Network.setBlockedURLs',{urls:['*/api/stream*']});
  await evaluate("document.querySelector('#next').click()");
  await until("document.querySelector('#connection').textContent.includes('Reconectando')");
  await send('Network.setBlockedURLs',{urls:[]});
  await until("document.querySelector('#connection').textContent.includes('Conectado')");
  assert.equal((await fetch(base+'/api/status?date=2026-02-30')).status,400);
  const started=performance.now();
  const results=await Promise.all(Array.from({length:100},async()=>{const response=await fetch(base+'/api/status');return (await response.json()).source;}));
  assert(results.every(source=>source==='OpenLigaDB'));
  console.log({count,nav,oneHundredRequestsMs:Math.round(performance.now()-started)});
} finally {
  socket.close();
  await fetch(endpoint+'/json/close/'+tab.id).catch(()=>{});
}


