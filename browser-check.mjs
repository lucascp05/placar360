import assert from 'node:assert/strict';
import { writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dateOf } from './source.js';

const endpoint = process.env.BROWSER_DEBUG_URL || 'http://127.0.0.1:9338';
const base = process.env.APP_URL || 'http://127.0.0.1:3600';
const tabs = await (await fetch(endpoint+'/json/list')).json();
const socket = new WebSocket(tabs.find(tab=>tab.type==='page').webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.onopen=resolve; socket.onerror=reject;});
const requests = new Map(), errors = [];
let sequence=0;
socket.onmessage=({data})=>{
  const reply=JSON.parse(data);
  if (reply.method==='Runtime.exceptionThrown') errors.push(reply.params.exceptionDetails.text);
  if (!reply.id) return;
  const callback=requests.get(reply.id);
  requests.delete(reply.id);
  if(reply.error) callback.reject(Error(reply.error.message)); else callback.resolve(reply.result);
};
function send(method,params={}) {
  return new Promise((resolve,reject)=>{
    const id=++sequence;
    requests.set(id,{resolve,reject});
    socket.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression) {
  const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});
  if(result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
}
async function until(expression) {
  for(let i=0;i<50;i++) {
    if(await evaluate(expression)) return;
    await new Promise(resolve=>setTimeout(resolve,150));
  }
  throw Error('Condição não atingida: '+expression);
}
async function dateChange(date) {
  await evaluate("document.querySelector('#date').value="+JSON.stringify(date)+";document.querySelector('#date').dispatchEvent(new Event('change'))");
  await until("document.querySelector('article.match')");
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
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:base});
  await until("document.querySelector('#connection')?.textContent.includes('Conectado')");
  const rows=JSON.parse(await readFile(new URL('./bundesliga-cache.json',import.meta.url),'utf8'));
  const final=rows.filter(row=>row.matchIsFinished&&row.goals.length).at(-1);
  await dateChange(dateOf(final.matchDateTimeUTC));
  const count=await evaluate("document.querySelectorAll('article.match').length");
  assert(count>0);
  await evaluate("document.querySelector('[data-action=details]').click()");
  assert(await evaluate("document.querySelector('.timeline').textContent.includes('Gol')"));
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
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  assert(await evaluate('document.documentElement.scrollWidth <= 390'));
  await capture('mobile');
  const nav=await evaluate("performance.getEntriesByType('navigation').map(({domContentLoadedEventEnd,transferSize})=>({domContentLoadedEventEnd,transferSize}))[0]");
  assert.deepEqual(errors,[]);
  assert.equal((await fetch(base+'/api/status?date=2026-02-30')).status,400);
  const started=performance.now();
  const results=await Promise.all(Array.from({length:100},async()=>{const response=await fetch(base+'/api/status');return (await response.json()).source;}));
  assert(results.every(source=>source==='OpenLigaDB'));
  console.log({count,nav,oneHundredRequestsMs:Math.round(performance.now()-started)});
} finally {
  socket.close();
}


