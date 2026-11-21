export const defaultAlerts = ['goal','red','final'];
export const alertLabels = {
  goal:'Gols', red:'Cartões vermelhos', yellow:'Cartões amarelos', start:'Início',
  interval:'Intervalo', penalty:'Pênaltis', final:'Encerramento', all:'Todos os acontecimentos relevantes'
};

export function matchAlerts(previous, match) {
  if (!previous) return [];
  const alerts = [];
  const score = match.score.map(value=>value ?? '–').join(' × ');
  const label = match.home.name+' '+score+' '+match.away.name;
  const add = (key,types,title,detail=label)=>alerts.push({id:match.id+':'+key,types,title,detail,
    matchId:match.id,date:match.date});
  if (previous.status==='scheduled' && match.status==='live') add('start',['start'],'A partida começou');
  if (previous.status!=='final' && match.status==='final') add('final',['final'],'Fim de jogo');
  const eventKey = event=>JSON.stringify([event.kind,event.detail,event.minute,event.extra,event.team,event.player]);
  const known = new Set(previous.events.map(eventKey));
  const total = item=>item.score.reduce((sum,value)=>sum+(value ?? 0),0);
  for (const event of match.events) {
    const key = eventKey(event);
    if (known.has(key)) continue;
    known.add(key);
    const minute = event.minute==null?'':event.minute+(event.extra?'+'+event.extra:'')+'′';
    const actor = [event.player,minute].filter(Boolean).join(', ');
    const detail = [label,actor].filter(Boolean).join(' — ');
    if (event.kind==='Gol') {
      if (event.detail==='Missed Penalty') add(key,['penalty'],'Pênalti perdido',detail);
      else if (total(match)>=total(previous)) add(key,event.detail==='Penalty'?['goal','penalty']:['goal'],'Gol',detail);
    }
    if (event.kind==='Cartão') {
      const red = /red|second yellow|vermelh|segundo amarelo/i.test(event.detail);
      add(key,[red?'red':'yellow'],red?'Cartão vermelho':'Cartão amarelo',detail);
    }
    if (event.kind==='VAR') add(key,/goal cancel/i.test(event.detail)?['all']:['all',...(/penalty/i.test(event.detail)?['penalty']:[])],
      /goal cancel/i.test(event.detail)?'Gol anulado':'Revisão do VAR',detail);
    if (event.kind==='Substituição') add(key,['all'],'Substituição',detail);
  }
  const interval = item=>item.statusLabel==='Intervalo' || item.clock?.startsWith('Intervalo');
  if (!interval(previous) && interval(match)) {
    const extra = match.clock?.includes('prorrogação');
    add(extra?'extra-interval':'interval',['interval'],extra?'Intervalo da prorrogação':'Intervalo');
  }
  return alerts;
}

export const wantsAlert = (types,alert)=>types.includes('all') || alert.types.some(type=>types.includes(type));
const storageKey = 'placar360-notifications';
const href = item=>'/partidas/'+encodeURIComponent(item.matchId)+'?date='+encodeURIComponent(item.date);

export function createNotifications({escape,icon,today,activeDate,onChange,onSound}) {
  const byId = id=>document.getElementById(id);
  let memory = {follows:{},history:[],seen:[],enabled:true,sound:false};
  function read() {
    try { return JSON.parse(localStorage.getItem(storageKey)) ?? memory; }
    catch { return memory; }
  }
  function write(state) {
    memory=state;
    try { localStorage.setItem(storageKey,JSON.stringify(state)); } catch {}
    render();
  }
  let selected;
  const streams = new Map();
  function sync() {
    const state = read(), day = today();
    // Keep following games that began yesterday and extended past midnight.
    const yesterday = new Date(Date.parse(day)-86400000).toISOString().slice(0,10);
    const wanted = new Set(Object.values(state.follows).filter(item=>state.enabled && item.date>=yesterday && item.date<=day)
      .map(item=>item.date).filter(value=>value!==activeDate()));
    for (const [value,stream] of streams) if (!wanted.has(value)) { stream.close(); streams.delete(value); }
    for (const value of wanted) {
      if (streams.has(value)) continue;
      const stream = new EventSource('/api/stream?date='+encodeURIComponent(value));
      let baseline = new Map();
      stream.addEventListener('snapshot',event=>{baseline=new Map(JSON.parse(event.data).matches.map(match=>[match.id,match]));});
      stream.addEventListener('patch',event=>{
        const patch = JSON.parse(event.data);
        for (const id of patch.remove) baseline.delete(id);
        for (const match of patch.upsert) {
          if (!patch.first) deliver(baseline.get(match.id),match);
          baseline.set(match.id,match);
        }
      });
      streams.set(value,stream);
    }
  }
  function deliver(previous,match) {
    const alerts = matchAlerts(previous,match);
    if (!alerts.length || !read().follows[match.id]) return;
    const dispatch = ()=>{
      const state = read(), types = state.follows[match.id]?.types;
      if (!state.enabled || !types) return;
      const records = alerts.filter(alert=>wantsAlert(types,alert) && !state.seen.includes(alert.id));
      if (!records.length) return;
      const timestamp = Date.now();
      state.history = [...records.map(record=>({...record,timestamp,read:false})),...state.history].slice(0,100);
      state.seen = [...state.seen,...records.map(record=>record.id)].slice(-1000);
      write(state);
      const toast = byId('notification-toast');
      toast.innerHTML='<a href="'+escape(href(records.at(-1)))+'">'+escape(records.at(-1).title+' · '+records.at(-1).detail)+'</a>';
      toast.hidden=false;
      clearTimeout(toast.hideTimer);
      toast.hideTimer=setTimeout(()=>{toast.hidden=true;},6500);
      if (state.sound) onSound(records);
      if ('Notification' in window && Notification.permission==='granted') for (const alert of records) {
        try {
          const notice=new Notification(alert.title,{body:alert.detail,tag:alert.id,silent:true});
          notice.onclick=()=>{window.focus();location.assign(href(alert));};
        } catch {}
      }
    };
    if (navigator.locks) void navigator.locks.request(storageKey,dispatch);
    else dispatch();
  }
  function render() {
    const state = read(), unread=state.history.filter(item=>!item.read).length;
    const bell=byId('notification-center-button');
    bell.innerHTML=icon('bell')+(unread?'<b>'+unread+'</b>':'');
    bell.setAttribute('aria-label',unread?'Notificações, '+unread+' não lidas':'Notificações');
    byId('alerts-enabled').checked=state.enabled;
    byId('alerts-sound').checked=state.sound;
    const permission = window.Notification?.permission;
    byId('notification-permission').textContent=permission==='granted'?'Avisos do navegador autorizados.':permission==='denied'
      ? 'Permissão negada. Os alertas dentro do site continuam disponíveis.' : !permission?'Este navegador usa apenas alertas dentro do site.':'';
    byId('allow-browser-notifications').hidden=permission!=='default';
    byId('notification-history').innerHTML=state.history.length ? state.history.map(item=>'<li'+(!item.read?' class="unread"':'')+'><a href="'+escape(href(item))+'"><strong>'+escape(item.title)+'</strong><span>'+escape(item.detail)+'</span><time>'+escape(new Date(item.timestamp).toLocaleString('pt-BR'))+'</time></a></li>').join('') : '<li>Nenhum alerta recebido.</li>';
    byId('notification-follows').innerHTML=Object.values(state.follows).map(item=>'<li><a href="'+escape(href(item))+'">'+escape(item.name)+'</a><button type="button" class="utility" data-unfollow="'+escape(item.matchId)+'">Desativar</button></li>').join('') || '<li>Nenhuma partida acompanhada.</li>';
    onChange();
  }
  const center=byId('notifications-center'), preferences=byId('match-notification-settings');
  byId('cancel-match-alerts').onclick=()=>preferences.close();
  byId('notification-center-button').onclick=()=>{render();center.showModal();};
  byId('alerts-enabled').onchange=event=>{write({...read(),enabled:event.target.checked});sync();};
  byId('alerts-sound').onchange=event=>{
    write({...read(),sound:event.target.checked});
    if (event.target.checked) onSound();
  };
  byId('mark-alerts-read').onclick=()=>{const state=read();write({...state,history:state.history.map(item=>({...item,read:true}))});};
  byId('clear-alerts').onclick=()=>write({...read(),history:[]});
  byId('allow-browser-notifications').onclick=async()=>{
    try { await window.Notification?.requestPermission(); } catch {}
    render();
  };
  byId('notification-follows').onclick=event=>{
    const id=event.target.closest('[data-unfollow]')?.dataset.unfollow;
    if (!id) return;
    const state=read();
    delete state.follows[id];
    write(state);
    sync();
  };
  byId('follow-form').onsubmit=event=>{
    event.preventDefault();
    const state=read();
    const types=new FormData(event.target).getAll('alert');
    if (types.length && event.submitter?.value!=='off') state.follows[selected.matchId]={...selected,types};
    else delete state.follows[selected.matchId];
    write(state);
    sync();
    preferences.close();
  };
  window.addEventListener('storage',event=>{if(event.key===storageKey){render();sync();}});
  window.addEventListener('pagehide',()=>{for (const stream of streams.values()) stream.close();streams.clear();});
  window.addEventListener('pageshow',sync);
  document.addEventListener('click',()=>{if (read().sound) onSound();},{once:true});
  queueMicrotask(render);
  return {
    deliver,sync,
    following:id=>Boolean(read().follows[id]),
    edit(match) {
      selected={matchId:match.id,date:match.date,name:match.home.name+' × '+match.away.name};
      const followed=read().follows[match.id];
      const types=followed?.types ?? defaultAlerts;
      byId('notification-match-name').textContent=selected.name;
      byId('remove-match-alerts').hidden=!followed;
      byId('alert-types').innerHTML=Object.entries(alertLabels).map(([type,label])=>'<label><input type="checkbox" name="alert" value="'+type+'" '+(types.includes(type)?'checked':'')+'>'+label+'</label>').join('');
      preferences.showModal();
    }
  };
}
