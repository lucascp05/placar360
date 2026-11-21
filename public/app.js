import { createNotifications } from './notifications.js';

const paths = {
  bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-2 7-2 9h16c0-2-2-2-2-9m-8 12a2 2 0 0 0 4 0"/>',
  grid:'<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
  settings:'<path d="M4 7h16M4 12h16M4 17h16"/><path d="M9 5v4m6 1v4m-5 1v4"/>',
  pulse:'<path d="M2 12h5l3-7 4 14 3-7h5"/>',
  star:'<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/>',
  left:'<path d="m14 6-6 6 6 6"/>',right:'<path d="m10 6 6 6-6 6"/>',down:'<path d="m6 9 6 6 6-6"/>',
  muted:'<path d="M3 9h4l5-4v14l-5-4H3zM16 9l5 6m0-6-5 6"/>',
  sound:'<path d="M3 9h4l5-4v14l-5-4H3zm13-1a6 6 0 0 1 0 8m2-11a10 10 0 0 1 0 14"/>',
  trophy:'<path d="M8 3h8v6a4 4 0 0 1-8 0zm0 2H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4m-4 2v5m-5 2h10"/>',
  ball:'<circle cx="12" cy="12" r="9"/><path d="m12 8 4 3-1.5 5h-5L8 11zm0 0V3m4 8 4.5-1.5m-6 6.5 3 3.5m-8-3.5-3 3.5M8 11 3.5 9.5"/>',
  card:'<rect x="7" y="3" width="10" height="18" rx="1"/>',swap:'<path d="M3 7h16l-4-4m6 14H5l4 4"/>',
  var:'<rect x="3" y="5" width="18" height="13" rx="1"/><path d="M8 21h8"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
};
const icon = name => '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+paths[name]+'</svg>';
const $ = id => document.getElementById(id);
document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
const esc = value => String(value ?? '').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]);
const dayFormat = new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'});
const timeFormat = new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'});
const weekFormat = new Intl.DateTimeFormat('pt-BR',{weekday:'short',timeZone:'UTC'});
const titleFormat = new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'});
const monthFormat = new Intl.DateTimeFormat('pt-BR',{month:'short',timeZone:'UTC'});
const dateValue = date=>new Date(date+'T12:00:00Z');
const shift = (date,n)=>new Date(dateValue(date).getTime()+n*86400000).toISOString().slice(0,10);
let today = dayFormat.format(new Date()), date = today, mode = 'all', league = '', query = '', stream;
let matches = new Map(), highlights = new Map(), arrivals = new Map(), sound = false, audio;
let connected = false, initialized = false, status = {}, delivery = null;
let agenda = false, competition = null, calendar = [], calendarRequest, calendarQuery, calendarLoaded = false, round = '';
let competitionTab = 'overview', competitionCatalog = [], restoredTeam = '';
let publishedStandings, standingsPending;
let matchPageId, matchSnapshot, matchPageError, matchTab = 'summary', teamId, matchContext, contextPending;
const viewTitles = {home:'Central de futebol',today:'Jogos de hoje',live:'Ao vivo',upcoming:'Próximos jogos',results:'Resultados anteriores',competitions:'Campeonatos',teams:'Times',favorites:'Favoritos'};
let view = 'home', range = 7;
const preferences = {theme:'dark',density:'normal'};
for (const [id,fallback] of Object.entries(preferences)) {
  const select = $(id);
  try { select.value = localStorage.getItem('placar360-'+id) ?? fallback; } catch { select.value = fallback; }
  const apply = () => {
    document.documentElement.dataset[id] = select.value || fallback;
    try { localStorage.setItem('placar360-'+id,select.value || fallback); } catch {}
  };
  select.onchange = apply;
  apply();
}
let favorites;
try { favorites = new Set(JSON.parse(localStorage.getItem('placar360-favorites') ?? '[]')); } catch { favorites = new Set(); }
const savedEntries = new Map();
try {
  for (const item of JSON.parse(localStorage.getItem('placar360-saved-links') ?? '[]')) savedEntries.set(item.key,item);
} catch {}
function saveEntry(key, entry) {
  if (entry) savedEntries.set(key,{key,...entry});
  else savedEntries.delete(key);
  try { localStorage.setItem('placar360-saved-links',JSON.stringify([...savedEntries.values()])); } catch {}
}
const leagueNames = {71:'Brasileirão Série A',72:'Brasileirão Série B',73:'Copa do Brasil',75:'Série C',475:'Copa do Nordeste',13:'Copa Libertadores da América',11:'Sul-Americana',2:'Champions League',3:'Europa League',39:'Premier League',78:'Bundesliga',79:'2. Bundesliga',140:'La Liga',1:'Copa do Mundo'};
const teamLogo = team => team.logo ? '<img class="crest" loading="lazy" decoding="async" width="23" height="23" alt="" src="'+esc(team.logo)+'">' : '<span class="crest crest-fallback">'+esc(team.name.slice(0,2).toUpperCase())+'</span>';
const leagueName = item=> leagueNames[item.id] ?? item.name;
const roundName = value => typeof value==='number' ? 'Rodada '+value : (value ?? '').replace(/^Regular Season - /i,'Rodada ');
const shortDate = new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',timeZone:'UTC'});
const scoreTotal = score => score.reduce((sum,goals)=>sum+(goals ?? 0),0);
const statValue = value=>typeof value==='number' ? value : /^\d+(?:\.\d+)?%$/.test(value ?? '') ? Number(value.slice(0,-1)) : null;
function statCell(value,other) {
  const number=statValue(value), opposite=statValue(other);
  return esc(value ?? '—')+(number!==null && opposite!==null && number+opposite>0
    ? '<meter aria-hidden="true" min="0" max="'+(number+opposite)+'" value="'+number+'"></meter>' : '');
}
const matchLink = m => '/partidas/'+encodeURIComponent(m.id)+'?date='+m.date;
const teamLink = (team,m) => competitionLink(m.league,m.date)+'&team='+encodeURIComponent(team.id);
const legacyDetails = {'Normal Goal':'Gol','Own Goal':'Gol contra',Penalty:'Pênalti convertido','Missed Penalty':'Pênalti perdido','Yellow Card':'Cartão amarelo','Red Card':'Cartão vermelho','Second Yellow card':'Segundo amarelo','Goal cancelled':'Gol anulado','Goal confirmed':'Gol confirmado','Penalty confirmed':'Pênalti confirmado','Penalty cancelled':'Pênalti cancelado'};
function eventHTML(event, match, compact=false) {
  const symbol = ({Gol:'ball',Cartão:'card',Substituição:'swap',VAR:'var',Fase:'clock'})[event.kind];
  const type = legacyDetails[event.detail] ?? (event.kind==='Fase' ? event.detail : event.kind);
  const side = [match.home,match.away].find(t=>t.id===event.team);
  const note = event.assist ? (event.kind==='Gol' ? 'Assistência: ' : event.kind==='Substituição' ? 'Outro jogador: ' : '')+event.assist : '';
  const eventClass = event.kind==='Cartão' ? (/red/i.test(event.detail) ? 'red' : 'yellow') : event.kind==='Gol' ? 'green' : '';
  return '<div class="event"><span class="event-icon '+eventClass+'">'+icon(symbol)+'</span><div><strong>'+esc(type)+(event.player ? ' · '+esc(event.player) : '')+'</strong><small>'+esc([compact ? match.home.name+' × '+match.away.name : side?.name,note].filter(Boolean).join(' · '))+'</small></div><time>'+esc(event.minute===null ? '' : event.minute+(event.extra ? '+'+event.extra : '')+'′')+'</time></div>';
}
function rowHTML(m) {
  const saved = favorites.has(m.id), live = m.status==='live';
  const clock = live ? m.statusLabel || m.clock || 'Em jogo' : m.status==='final' ? 'Encerrado' : m.statusLabel || timeFormat.format(new Date(m.kickoff));
  const fresh = highlights.get(m.id);
  const teams = [m.home,m.away];
  const dateText = agenda ? '<small>'+esc([shortDate.format(dateValue(m.date)),m.leg].filter(Boolean).join(' · '))+'</small>' : '';
  return '<div class="match-main"><span class="match-time '+(live?'live':'')+'">'+(live?'<i></i> ':'')+esc(clock)+dateText+'</span><a class="match-details" href="'+matchLink(m)+'" data-open-match><span class="teams">'+teams.map(t=>'<span>'+teamLogo(t)+esc(t.name)+'</span>').join('')+'</span><span class="scores">'+m.score.map((s,i)=>'<b>'+esc(s ?? '–')+(m.penalties[i]!==null ? '<small> ('+esc(m.penalties[i])+')</small>' : '')+'</b>').join('')+'</span>'+icon('right')+'</a><button class="favorite '+(saved?'saved':'')+'" data-action="favorite" aria-pressed="'+saved+'" aria-label="'+(saved?'Remover dos favoritos':'Favoritar')+'">'+icon('star')+'</button></div>'+(fresh ? '<span class="fresh-label">'+esc(['Gol',fresh.player,fresh.minute===null ? '' : fresh.minute+(fresh.extra?'+'+fresh.extra:'')+'′'].filter(Boolean).join(' · '))+'</span>' : '');
}
const matchNodes = new Map(), groupNodes = new Map();
const tidy = value => value.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();
const competitionLink = (l,date) => '/?competition='+encodeURIComponent(l.id)+'&season='+encodeURIComponent(l.season ?? date.slice(0,4))+'&date='+date;
function renderMatchPage() {
  const panel = $('match-page');
  if (!matchPageId) return;
  panel.hidden = false;
  const live = matches.get(matchPageId);
  const match = live && matchSnapshot ? {...matchSnapshot,...live,
    statistics:live.statistics?.length ? live.statistics : matchSnapshot.statistics,
    lineups:live.lineups?.length ? live.lineups : matchSnapshot.lineups,
    events:live.detailed || !matchSnapshot.detailed ? live.events : matchSnapshot.events,
    detailed:live.detailed || matchSnapshot.detailed} : live ?? matchSnapshot;
  if (!match) {
    panel.innerHTML='<h1 id="match-title">Partida</h1><p role="status">'+esc(matchPageError ?? 'Consultando a partida…')+'</p>';
    return;
  }
  const teams = [match.home,match.away];
  const tabs = [['summary','Resumo'],['events','Linha do tempo'],['numbers','Estatísticas'],['lineups','Escalações'],['context','Confrontos']];
  let content;
  if (matchTab==='events' || matchTab==='summary') {
    const events = matchTab==='summary' ? match.events.filter(event=>['Gol','Cart?o','VAR'].includes(event.kind)).slice(-4) : match.events;
    content = events.map(event=>eventHTML(event,match)).join('')+
      (!match.detailed ? '<p>Eventos limitados à cobertura da fonte.</p>' : !match.events.length ? '<p>Nenhum evento registrado.</p>' : '');
  }
  if (matchTab==='numbers') {
    const values = teams.map(t=>new Map(match.statistics?.find(s=>s.team===t.id)?.values.map(v=>[v.label,v.value])));
    const labels = new Set(values.flatMap(v=>[...v.keys()]));
    content = labels.size ? '<table class="data-table match-statistics"><thead><tr><th>'+esc(teams[0].name)+'</th><th scope="col">Estatística</th><th>'+esc(teams[1].name)+'</th></tr></thead><tbody>'+[...labels].map(label=>'<tr><td>'+statCell(values[0].get(label),values[1].get(label))+'</td><th scope="row">'+esc(label)+'</th><td>'+statCell(values[1].get(label),values[0].get(label))+'</td></tr>').join('')+'</tbody></table>' : '<p>Estatísticas indisponíveis para esta partida.</p>';
  }
  if (matchTab==='lineups') {
    const players = list => list.map(p=>'<li>'+esc([p.number,p.name].filter(v=>v!=null).join(' · '))+'</li>').join('');
    content = match.lineups?.length ? '<div class="lineup-grid">'+match.lineups.map(l=>{
      const rows = Map.groupBy(l.starters.filter(p=>/^\d+:\d+$/.test(p.grid)),p=>Number(p.grid.split(':')[0]));
      const pitch = rows.size && [...rows.values()].flat().length===l.starters.length ? '<div class="pitch" aria-label="Formação no campo">'+[...rows].sort(([a],[b])=>a-b).map(([,line])=>'<div>'+line.sort((a,b)=>Number(a.grid.split(':')[1])-Number(b.grid.split(':')[1])).map(p=>'<span>'+esc(p.name)+'</span>').join('')+'</div>').join('')+'</div>' : '';
      return '<section><h2>'+esc(teams.find(t=>t.id===l.team)?.name)+' '+esc(l.formation)+'</h2>'+pitch+'<h3>Titulares</h3><ul>'+players(l.starters)+'</ul><h3>Reservas</h3><ul>'+players(l.substitutes)+'</ul></section>';
    }).join('')+'</div>' : '<p>Escalações indisponíveis para esta partida.</p>';
  }
  if (matchTab==='context') {
    const opponents = matchContext?.filter(m=>m.id!==match.id && m.status==='final' && teams.every(t=>[m.home.id,m.away.id].includes(t.id))).slice(-5).reverse();
    content = opponents?.length ? '<h2>Encontros nesta temporada</h2><ul>'+opponents.map(m=>'<li><a href="'+matchLink(m)+'">'+esc([shortDate.format(dateValue(m.date)),m.home.name,m.score.map(n=>n ?? '–').join(' : '),m.away.name].join(' · '))+'</a></li>').join('')+'</ul>' : '<p role="status">'+(contextPending?'Consultando a temporada…':'Nenhum confronto anterior disponível nesta temporada.')+'</p>';
  }
  const state = match.statusLabel || (match.status==='live' ? match.clock || 'Em jogo' : match.status==='final' ? 'Encerrado' : 'Agendado');
  const markup = '<div class="detail-actions"><a href="/?date='+match.date+'" data-return-match>Voltar aos jogos</a><a href="'+competitionLink(match.league,match.date)+'">'+esc(leagueName(match.league))+'</a></div><h1 id="match-title">'+esc(teams.map(t=>t.name).join(' × '))+'</h1><div class="match-hero '+(highlights.has(match.id)?'fresh':'')+'">'+teams.map((t,i)=>'<a href="'+teamLink(t,match)+'">'+teamLogo(t)+esc(t.name)+'</a>'+(i===0?'<strong>'+esc(match.score.map(n=>n ?? '–').join(' : '))+'</strong>':'')).join('')+'</div><p>'+esc([state,roundName(match.round),titleFormat.format(dateValue(match.date)),timeFormat.format(new Date(match.kickoff)),match.venue,match.referee].filter(Boolean).join(' · '))+'</p><div class="match-actions"><button class="utility" data-favorite-match aria-pressed="'+favorites.has(match.id)+'">'+(favorites.has(match.id)?'Remover dos favoritos':'Favoritar')+'</button><button class="utility" data-follow-match aria-pressed="'+notifications.following(match.id)+'">'+(notifications.following(match.id)?'Editar alertas':'Ativar alertas')+'</button><button class="utility" data-copy-match>Copiar link</button></div><div class="tabs" aria-label="Detalhes da partida">'+tabs.map(([id,label])=>'<button data-match-tab="'+id+'" class="'+(id===matchTab?'selected':'')+'" aria-pressed="'+(id===matchTab)+'">'+label+'</button>').join('')+'</div>'+(matchPageError ? '<p role="status">'+esc(matchPageError)+'</p>' : '')+content;
  if (panel.dataset.html!==markup) { panel.innerHTML=markup; panel.dataset.html=markup; }
}
let matchRequest;
async function loadMatchContext() {
  const match = matches.get(matchPageId) ?? matchSnapshot;
  if (!match || contextPending || matchContext) return;
  contextPending=true;
  renderMatchPage();
  try {
    const response = await fetch('/api/calendar?'+new URLSearchParams({date:match.date,league:match.league.id,season:match.league.season}));
    if (!response.ok) throw Error('Calendário indisponível');
    matchContext = (await response.json()).matches.sort((a,b)=>Date.parse(a.kickoff)-Date.parse(b.kickoff));
  } catch { matchContext=null; }
  finally { contextPending=false; renderMatchPage(); }
}
async function loadMatch() {
  if (!matchPageId || matchRequest) return;
  matchRequest = true;
  try {
    const response = await fetch('/api/match?'+new URLSearchParams({id:matchPageId,date}));
    const result = await response.json();
    if (!response.ok) throw Error(result.error ?? 'Partida indisponível na fonte selecionada.');
    matchSnapshot = result.match;
    matchPageError = result.error;
  } catch (error) { matchPageError = error.message; }
  finally { matchRequest = false; renderMatchPage(); }
}
async function loadStandings() {
  if (![71,13].includes(competition?.id) || standingsPending || publishedStandings?.groups?.length) return;
  standingsPending=true;
  publishedStandings=null;
  render();
  try {
    const response = await fetch('/api/standings?'+new URLSearchParams({league:competition.id,season:competition.season}));
    const data = await response.json();
    if (!response.ok) throw Error(data.error);
    publishedStandings=data;
  } catch {
    publishedStandings={error:'Classificação temporariamente indisponível.'};
  } finally { standingsPending=false; render(); }
}
function renderCompetition(list) {
  const panel = $('competition-panel');
  panel.hidden = !competition;
  if (!competition) return;
  const leagueInfo = list[0]?.league ?? competition;
  const tabs = [['overview','Visão geral'],['games','Jogos'],['table','Classificação'],['stats','Estatísticas']];
  let content = '';
  if (competitionTab==='overview' && list.length) {
    const final = list.filter(m=>m.status==='final');
    const live = list.filter(m=>m.status==='live');
    const upcoming = list.filter(m=>m.status==='scheduled' && m.kickoff && Date.parse(m.kickoff)>=Date.now());
    content = '<div class="competition-summary">'+[[final.at(-1),'Último resultado'],[live[0] ?? upcoming[0],live.length?'Em andamento':'Próxima partida']].map(([match,label])=>match ? '<div><small>'+label+'</small><strong>'+esc(match.home.name)+' × '+esc(match.away.name)+'</strong><span>'+esc(roundName(match.round))+'</span></div>' : '').join('')+'</div>';
  }
  if (competitionTab==='table' && [71,13].includes(competition.id)) {
    const groups = publishedStandings?.groups ?? [];
    content = groups.length ? '<p class="calendar-note">'+esc(publishedStandings.error ?? 'Classificação publicada pela ESPN')+'</p>'+groups.map(group=>'<table class="data-table"><caption>'+esc(competition.id===71 ? 'Tabela geral' : group.name)+'</caption><thead><tr><th scope="col">Clube</th><th scope="col">J</th><th scope="col">SG</th><th scope="col">Pts</th></tr></thead><tbody>'+group.rows.map(row=>'<tr><th scope="row">'+row.rank+' · '+esc(row.name)+'</th><td>'+row.played+'</td><td>'+row.difference+'</td><td>'+row.points+'</td></tr>').join('')+'</tbody></table>').join('')
      : '<p class="calendar-note" role="status">'+esc(standingsPending?'Consultando a classificação…':publishedStandings?.error ?? 'Classificação indisponível para esta temporada.')+'</p>';
  } else if (competitionTab==='table' && competition.id===73) {
    content = '<p class="calendar-note">A Copa do Brasil é eliminatória. Consulte os confrontos por fase na aba Jogos.</p>';
  } else if (competitionTab==='table') {
    const regular = [39,61,71,72,78,79,135,140].includes(competition.id);
    const standings = new Map();
    if (regular) for (const match of list) {
      const teams = [match.home,match.away];
      teams.forEach((team,i)=>{
        const row = standings.get(team.id) ?? {name:team.name,played:0,points:0,for:0,against:0};
        standings.set(team.id,row);
        if (match.status!=='final' || !match.score.every(Number.isFinite)) return;
        const goals = match.score[i], against = match.score[1-i];
        row.played++;
        row.for += goals;
        row.against += against;
        row.points += goals>against ? 3 : goals===against ? 1 : 0;
      });
    }
    const rows = [...standings.values()].sort((a,b)=>b.points-a.points || (b.for-b.against)-(a.for-a.against) || b.for-a.for || a.name.localeCompare(b.name));
    content = rows.some(row=>row.played) ? '<p class="calendar-note">Calculada pelos resultados disponíveis. Pode divergir da classificação oficial.</p><table class="data-table"><thead><tr><th scope="col">Clube</th><th scope="col">J</th><th scope="col">SG</th><th scope="col">Pts</th></tr></thead><tbody>'+rows.map((row,i)=>'<tr><th scope="row">'+(i+1)+' · '+esc(row.name)+'</th><td>'+row.played+'</td><td>'+(row.for-row.against)+'</td><td>'+row.points+'</td></tr>').join('')+'</tbody></table>' : '<p class="calendar-note">Classificação indisponível para esta competição e temporada.</p>';
  }
  if (competitionTab==='stats') {
    const scorers = new Map();
    for (const match of list.filter(m=>m.status==='final')) for (const event of match.events) {
      if (event.kind!=='Gol' || !event.player || ['Missed Penalty','Own Goal'].includes(event.detail)) continue;
      const key = JSON.stringify([event.team,event.player]);
      const row = scorers.get(key) ?? {name:event.player,team:[match.home,match.away].find(t=>t.id===event.team)?.name,goals:0};
      row.goals++;
      scorers.set(key,row);
    }
    content = scorers.size ? '<p class="calendar-note">Artilharia dos jogos encerrados com autores de gols informados na agenda.</p><table class="data-table"><thead><tr><th scope="col">Jogador</th><th scope="col">Clube</th><th scope="col">Gols</th></tr></thead><tbody>'+[...scorers.values()].sort((a,b)=>b.goals-a.goals).slice(0,30).map(row=>'<tr><th scope="row">'+esc(row.name)+'</th><td>'+esc(row.team ?? '—')+'</td><td>'+row.goals+'</td></tr>').join('')+'</tbody></table>' : '<p class="calendar-note">A agenda desta temporada não informou artilharia.</p>';
  }
  const selectedTeam = teamId && list.flatMap(m=>[m.home,m.away]).find(t=>String(t.id)===teamId);
  if (selectedTeam && competitionTab==='games') {
    const fixtures = list.filter(m=>[m.home.id,m.away.id].includes(selectedTeam.id));
    const latest = fixtures.filter(m=>m.status==='final' && m.score.every(Number.isFinite)).slice(-5).reverse();
    const next = fixtures.find(m=>m.status==='live') ?? fixtures.find(m=>m.status==='scheduled' && Date.parse(m.kickoff)>=Date.now());
    content = '<div class="competition-summary">'+(latest.length?'<div><small>Últimos resultados</small><div class="form-guide">'+latest.map(m=>{
      const index = m.home.id===selectedTeam.id ? 0 : 1;
      const diff = m.score[index]-m.score[1-index];
      return '<a href="'+matchLink(m)+'" aria-label="'+esc(m.home.name+' '+m.score.join(' : ')+' '+m.away.name)+'">'+(diff>0?'V':diff===0?'E':'D')+'</a>';
    }).join('')+'</div></div>':'')+(next?'<div><small>'+(next.status==='live'?'Em jogo':'Próxima partida')+'</small><a href="'+matchLink(next)+'">'+esc(next.home.name+' × '+next.away.name)+'</a></div>':'')+'</div>';
  }
  const key = teamId ? 'team-'+competition.id+'-'+teamId : 'competition-'+competition.id;
  const saved = savedEntries.has(key);
  const favorite = !teamId || selectedTeam ? '<button class="utility" data-save-profile="'+key+'" aria-pressed="'+saved+'">'+(saved?'Salvo':'Favoritar')+'</button>' : '';
  const markup = '<div class="competition-controls"><span>'+esc(leagueName(leagueInfo))+' · '+esc(leagueInfo.country)+'</span><form id="season-form"><label for="season">Temporada</label> <input id="season" type="number" min="2000" max="2099" required value="'+competition.season+'"><button class="utility">Consultar</button></form>'+favorite+'</div><div class="tabs" aria-label="Seções do campeonato">'+tabs.map(([id,label])=>'<button data-competition-tab="'+id+'" class="'+(id===competitionTab?'selected':'')+'" aria-pressed="'+(id===competitionTab)+'">'+label+'</button>').join('')+'</div>'+content;
  if (panel.dataset.html!==markup) { panel.innerHTML=markup; panel.dataset.html=markup; }
}
function renderExplore(leagues,list) {
  const panel = $('explore-content');
  const needle = tidy(query.trim());
  const directories = ['competitions','teams'].includes(view);
  const found = text=>tidy(text).includes(needle);
  const link = (href,label,info='')=>'<a href="'+esc(href)+'"><strong>'+esc(label)+'</strong>'+(info?'<small>'+esc(info)+'</small>':'')+'</a>';
  const leagueLinks = [...leagues.values()].filter(l=>found(leagueName(l))).map(l=>link(competitionLink(l,date),leagueName(l),l.country));
  const clubs = new Map();
  for (const m of list) for (const t of [m.home,m.away]) clubs.set(m.league.id+':'+t.id,{t,m});
  const clubLinks = [...clubs.values()].filter(({t})=>found(t.name)).sort((a,b)=>a.t.name.localeCompare(b.t.name)).map(({t,m})=>link(teamLink(t,m),t.name,leagueName(m.league)));
  let markup = '';
  if (view==='competitions') {
    const region = l => l.country==='Brazil' || l.country==='Brasil' ? 'Brasil'
      : [1,4,9,960].includes(l.id) ? 'Seleções' : [11,13].includes(l.id) ? 'América do Sul' : 'Europa';
    const groups = Map.groupBy([...leagues.values()].filter(l=>found(leagueName(l))),region);
    markup = ['Brasil','América do Sul','Europa','Seleções'].filter(name=>groups.has(name))
      .map(name=>'<section class="catalog-group"><h2>'+name+'</h2>'+groups.get(name).map(l=>link(competitionLink(l,date),leagueName(l),l.country)).join('')+'</section>').join('');
  }
  if (view==='teams') markup = clubLinks.join('');
  if (view==='favorites') markup = [...savedEntries.values()].filter(item=>found(item.label)).map(item=>'<div class="saved-row">'+link(item.href,item.label,item.info)+'<button class="favorite" data-remove-saved="'+esc(item.key)+'" aria-label="Remover '+esc(item.label)+' dos favoritos">'+icon('star')+'</button></div>').join('');
  if (needle && !directories && view!=='favorites') markup = [...leagueLinks,...clubLinks].slice(0,12).join('');
  if (view==='home' && date===today && !needle && mode==='all' && !competition) {
    const sections = [['Ao vivo','live',list.filter(m=>m.status==='live')],['Próximos jogos','upcoming',list.filter(m=>m.date>today&&m.status==='scheduled')],['Resultados recentes','results',list.filter(m=>m.status==='final').reverse()]];
    markup = '<div class="home-strip">'+sections.map(([title,path,fixtures])=>'<section><h2><a href="/?view='+path+'">'+title+'</a></h2>'+(fixtures.length ? fixtures.slice(0,3).map(m=>link(matchLink(m),m.home.name+' × '+m.away.name,m.status==='final' ? m.score.map(n=>n ?? '–').join(' : ') : (m.clock || shortDate.format(dateValue(m.date))+' · '+timeFormat.format(new Date(m.kickoff))))).join('') : '<p>'+(!calendarLoaded&&path!=='live'?'Consultando a agenda…':'Sem partidas disponíveis na consulta.')+'</p>')+'</section>').join('')+'</div>';
  }
  if (directories && !markup) markup = '<p class="calendar-note">'+(!calendarLoaded?'Consultando a agenda…':'Nenhum resultado na agenda disponível.')+'</p>';
  if (view==='favorites' && !markup) markup = '<p class="calendar-note">Nenhum favorito correspondente.</p>';
  panel.hidden = !markup;
  if (panel.dataset.html!==markup) { panel.innerHTML=markup; panel.dataset.html=markup; }
}
async function loadCompetitionCatalog() {
  try {
    const response = await fetch('/api/competitions',{signal:AbortSignal.timeout(5000)});
    if (!response.ok) return;
    const data = await response.json();
    if (!Array.isArray(data.leagues)) return;
    competitionCatalog = data.leagues;
    render();
  } catch {
    // The scoreboard snapshot also carries the catalog.
  }
}

function render() {
  if (matchPageId) { renderMatchPage(); return; }
  const merged = agenda ? new Map(calendar.filter(m=>m.date!==date || !status.updated).map(m=>[m.id,m])) : new Map();
  for (const m of matches.values()) if (!competition || (m.league.id===competition.id && m.league.season===competition.season)) merged.set(m.id,m);
  const list = [...merged.values()].sort((a,b)=>Date.parse(a.kickoff)-Date.parse(b.kickoff));
  renderCompetition(list);
  const showFixtures = !['teams','competitions'].includes(view) && (!competition || ['games','overview'].includes(competitionTab));
  $('matches').hidden = $('results-meta').hidden = !showFixtures;
  const live = [...matches.values()].filter(m=>m.status==='live').length;
  const team = teamId && list.flatMap(m=>[m.home,m.away]).find(t=>String(t.id)===teamId);
  const heading = view==='legacy' ? 'Agenda' : view==='today' && date!==today ? 'Jogos por data' : viewTitles[view];
  $('heading').textContent = teamId ? team?.name ?? 'Perfil da equipe' : competition ? leagueName(list.find(m=>m.league.id===competition.id)?.league ?? competition) : heading;
  const crest = $('profile-crest');
  crest.innerHTML = team ? teamLogo(team) : '';
  crest.hidden = !team;
  $('section-label').lastChild.textContent = competition ? ' CAMPEONATO' : agenda ? ' CALENDÁRIO' : ' PLACAR DO DIA';
  document.querySelectorAll('[data-agenda]').forEach(button=>button.setAttribute('aria-pressed',String(agenda&&!competition)));
  $('side-live').textContent=live;
  document.querySelectorAll('[data-mode]').forEach(button=>{
    button.classList.toggle('selected',button.dataset.mode===mode);
    button.setAttribute('aria-pressed',button.dataset.mode===mode);
  });
  const leagues = new Map(list.map(m=>[String(m.league.id),m.league]));
  const season = Number(date.slice(0,4))-(Number(date.slice(5,7))<7?1:0);
  for (const l of competitionCatalog.length ? competitionCatalog : status.leagues ?? []) {
    if ((!l.season || l.season===season) && !leagues.has(String(l.id))) leagues.set(String(l.id),{...l,season:l.slug ? Number(date.slice(0,4)) : season});
  }
  renderExplore(leagues,list);
  $('range').hidden = view!=='upcoming';
  document.querySelectorAll('[data-range]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.range)===range)));
  const leagueLinks = [...leagues].map(([id,l])=>'<a class="side-button '+(competition?.id===l.id?'selected':'')+'" href="'+competitionLink(l,date)+'"><span class="league-icon">'+icon('trophy')+'</span>'+esc(leagueName(l))+'</a>').join('');
  if ($('leagues').dataset.html!==leagueLinks) { $('leagues').innerHTML=leagueLinks || '<p>Nenhum campeonato nesta data</p>'; $('leagues').dataset.html=leagueLinks; }
  const options = '<option value="">Todos os campeonatos</option>'+[...leagues].map(([id,l])=>'<option value="'+esc(id)+'">'+esc(leagueName(l))+'</option>').join('');
  if ($('league-select').dataset.html!==options) { $('league-select').innerHTML=options; $('league-select').dataset.html=options; }
  $('league-select').value=league;
  const teamFilter = $('team-filter');
  teamFilter.hidden = view!=='upcoming';
  if (!teamFilter.hidden) {
    const previous = teamFilter.value;
    const teams = new Map(list.filter(m=>!league||String(m.league.id)===league).flatMap(m=>[m.home,m.away].map(t=>[String(t.id),t.name])));
    const teamOptions = '<option value="">Todas as equipes</option>'+[...teams].sort((a,b)=>a[1].localeCompare(b[1])).map(([id,name])=>'<option value="'+esc(id)+'">'+esc(name)+'</option>').join('');
    if (teamFilter.dataset.html!==teamOptions) {
      teamFilter.innerHTML=teamOptions;
      teamFilter.dataset.html=teamOptions;
      teamFilter.value=teams.has(previous) ? previous : '';
    }
    if (restoredTeam && teams.has(restoredTeam)) {
      teamFilter.value=restoredTeam;
      restoredTeam='';
    } else if (calendarLoaded) restoredTeam='';
  }
  const needle = tidy(query.trim());
  const rounds = [...new Set(list.map(m=>m.round).filter(Boolean))];
  if (competition?.id===71 && rounds.every(value=>typeof value==='number')) rounds.sort((a,b)=>a-b);
  const roundOptions = '<option value="">Todas as rodadas e fases</option>'+rounds.map(value=>{
    const fixtures = list.filter(m=>m.round===value);
    const state = fixtures.every(m=>m.status==='final') ? 'Encerrada' : fixtures.some(m=>m.status==='live') ? 'Em andamento' : fixtures.every(m=>m.status==='scheduled') ? 'Agendada' : '';
    return '<option value="'+esc(value)+'">'+esc([roundName(value),state].filter(Boolean).join(' · '))+'</option>';
  }).join('');
  if ($('round-filter').dataset.html!==roundOptions) { $('round-filter').innerHTML=roundOptions; $('round-filter').dataset.html=roundOptions; }
  $('round-filter').value=round;
  $('round-filter').hidden=!competition || !rounds.length;
  const statusFilter = $('status-filter').value;
  const shown = list.filter(m=>(mode!=='live'||m.status==='live')&&(mode!=='favorites'||favorites.has(m.id))&&(!league||String(m.league.id)===league)
    &&(view!=='home'||m.date===date)
    &&(view!=='upcoming'||(m.date>=date&&m.date<=shift(date,range-1)&&['scheduled','other'].includes(m.status)))
    &&(view!=='upcoming'||!teamFilter.value||[m.home,m.away].some(t=>String(t.id)===teamFilter.value))
    &&(view!=='results'||(m.status==='final'&&m.date<=date&&m.date>=shift(date,-6)))
    &&(!teamId||[m.home,m.away].some(t=>String(t.id)===teamId))
    &&(!competition||competitionTab==='games'||round||mode!=='all'||m.status==='live'||(m.date>=shift(date,-7)&&m.date<=shift(date,21)))
    &&(!statusFilter||m.status===statusFilter)&&(!round||String(m.round)===round)
    &&(!needle||needle.split(/\s+/).every(term=>tidy([m.home.name,m.away.name,leagueName(m.league),m.league.name].join(' ')).includes(term))));
  $('results-meta').innerHTML='<strong>'+shown.length+' '+(shown.length===1?'partida':'partidas')+'</strong><span></span><span>'+live+' ao vivo</span>';
  const container = $('matches'), usedGroups = new Set(), usedMatches = new Set(), lastRows = new Map();
  let previousGroup;
  const empty = agenda ? calendarLoaded ? ['Nenhuma partida encontrada','Experimente mudar os filtros ou a data.'] : ['Consultando a agenda','Aguardando a resposta da fonte.'] : !initialized ? ['Buscando partidas','Aguardando a conexão com a central.'] : status.error && !status.updated && !list.length ? ['Fonte indisponível','A central tentará se conectar novamente.'] : !status.updated && !list.length ? ['Consultando a agenda','Aguardando a primeira resposta da fonte.'] : ['Nenhuma partida encontrada',list.length ? 'Experimente mudar os filtros da lista.' : 'A fonte não informou partidas para esta data.'];
  let placeholder = $('empty');
  if (!shown.length) {
    if (!placeholder) { placeholder=document.createElement('div'); placeholder.id='empty'; placeholder.className='empty'; container.append(placeholder); }
    const markup = '<div>'+icon('ball')+'</div><h2>'+empty[0]+'</h2><p>'+empty[1]+'</p>'+(date===today?'<button data-nearby="'+(status.nearby ?? shift(date,1))+'">Ver próxima data</button>':'<button data-nearby="0">Voltar para hoje</button>');
    if (placeholder.innerHTML!==markup) placeholder.innerHTML=markup;
  } else placeholder?.remove();
  for (const m of shown) {
    const id = competition ? JSON.stringify([m.round,m.date]) : String(m.league.id);
    let group = groupNodes.get(id);
    if (!group) {
      group = document.createElement('section');
      group.className='league-group';
      const title = competition ? roundName(m.round) || leagueName(m.league) : '<a href="'+competitionLink(m.league,date)+'">'+esc(leagueName(m.league))+'</a>';
      group.innerHTML='<div class="league-heading"><span class="league-icon">'+(m.league.logo ? '<img alt="" width="22" height="22" src="'+esc(m.league.logo)+'">' : icon('trophy'))+'</span><div><h2>'+(competition?esc(title):title)+'</h2><small>'+esc(competition?titleFormat.format(dateValue(m.date)):m.league.country)+'</small></div></div>';
      groupNodes.set(id,group);
    }
    if (!usedGroups.has(id)) {
      const expected = previousGroup ? previousGroup.nextElementSibling : container.firstElementChild;
      if (group!==expected) container.insertBefore(group,expected);
      previousGroup = group;
    }
    usedGroups.add(id);
    let row = matchNodes.get(m.id);
    if (!row) {
      row = document.createElement('article'); row.dataset.match=m.id;
      matchNodes.set(m.id,row);
    }
    const html = rowHTML(m);
    if (row.dataset.rendered!==html) {
      const action = row.contains(document.activeElement) ? document.activeElement.dataset.action : null;
      row.innerHTML=html;
      row.dataset.rendered=html;
      if (action) row.querySelector('[data-action="'+action+'"]')?.focus({preventScroll:true});
    }
    row.className='match'+(highlights.has(m.id)?' fresh':'');
    const expectedRow = (lastRows.get(id) ?? group.firstElementChild).nextElementSibling;
    if (row!==expectedRow) group.insertBefore(row,expectedRow);
    lastRows.set(id,row);
    usedMatches.add(m.id);
  }
  for (const [id,row] of matchNodes) if (!usedMatches.has(id)) { row.remove(); matchNodes.delete(id); }
  for (const [id,group] of groupNodes) if (!usedGroups.has(id)) { group.remove(); groupNodes.delete(id); }
  const recent = [...matches.values()].flatMap(m=>m.events.map(e=>({e,m,arrival:arrivals.get(m.id+e.id) ?? 0})))
    .sort((a,b)=>b.arrival-a.arrival||(Date.parse(b.m.kickoff)+(b.e.minute??130)*60000)-(Date.parse(a.m.kickoff)+(a.e.minute??130)*60000)).slice(0,20);
  const feed = recent.length ? recent.map(({e,m})=>eventHTML(e,m,true)).join('') : '<div class="feed-empty"><div class="radar">'+icon('pulse')+'</div><strong>Nenhum evento registrado</strong><p>Os eventos disponíveis das partidas aparecem aqui.</p></div>';
  if ($('feed-content').dataset.html!==feed) { $('feed-content').innerHTML=feed; $('feed-content').dataset.html=feed; }
}
function paintStatus() {
  const label = connected ? status.error ? 'Conectado · fonte indisponível' : status.updated ? 'Conectado' : 'Conectado · aguardando fonte' : 'Reconectando';
  $('connection').classList.toggle('online',connected&&!status.error&&Boolean(status.updated));
  $('connection').innerHTML='<i></i> '+label;
  $('source-name').textContent=status.source ?? 'Fonte esportiva';
  $('source-hint').textContent=status.supplemental ? 'Cobertura complementar da '+status.supplemental : status.limited ? 'Cobertura comunitária' : status.source ? 'Cobertura conforme o plano da fonte' : 'Aguardando conexão';
  $('updated').textContent=status.updated ? 'Consulta às '+timeFormat.format(new Date(status.updated)) : status.cached ? 'Agenda em cache' : 'Aguardando dados';
  $('latency').textContent=(status.processing!=null ? 'Servidor: '+status.processing+' ms · Coleta/cache: '+status.upstream+' ms · ' : '')+(delivery!==null ? 'Entrega e renderização local: '+delivery+' ms · ' : '')+'Atraso do evento na fonte: desconhecido';
  $('attribution').innerHTML=status.limited ? 'Dados: <a href="https://www.openligadb.de/en/license" target="_blank" rel="noopener">OpenLigaDB (ODbL)</a>'+(status.supplemental ? ' · <a href="https://www.espn.com.br/futebol/" target="_blank" rel="noopener">ESPN</a>' : '') : status.source ? 'Dados: API-Football' : '';
}
function ping(force=false) {
  if ((!sound && !force) || !audio || audio.state!=='running') return;
  const now=audio.currentTime, gain=audio.createGain(), osc=audio.createOscillator();
  osc.frequency.setValueAtTime(530,now); osc.frequency.setValueAtTime(760,now+0.075);
  gain.gain.setValueAtTime(0.001,now); gain.gain.exponentialRampToValueAtTime(0.12,now+0.035); gain.gain.exponentialRampToValueAtTime(0.001,now+0.21);
  osc.connect(gain).connect(audio.destination); osc.start(); osc.stop(now+0.23);
}
function updateDates() {
  $('date-label').textContent=titleFormat.format(dateValue(date));
  $('date').value=date;
  $('days').innerHTML=Array.from({length:7},(_,i)=>{
    const day=shift(date,i-3), d=dateValue(day);
    return '<button class="day '+(day===date?'active':'')+'" data-date="'+day+'" aria-pressed="'+(day===date)+'"><span>'+esc(day===today?'Hoje':weekFormat.format(d).replace('.',''))+'</span><b>'+d.getUTCDate()+'</b><small>'+esc(monthFormat.format(d).replace('.',''))+'</small></button>';
  }).join('');
}
async function loadCalendar() {
  const params = new URLSearchParams({date});
  if (competition) { params.set('league',competition.id); params.set('season',competition.season); }
  if (view==='upcoming') { params.set('from',date); params.set('to',shift(date,range-1)); }
  if (view==='results') { params.set('from',shift(date,-6)); params.set('to',date); }
  const query = params.toString();
  if (calendarQuery===query && calendarRequest && !calendarRequest.signal.aborted) return;
  calendarRequest?.abort();
  const request = new AbortController();
  calendarRequest = request;
  calendarQuery = query;
  const note = $('calendar-note');
  note.hidden = false;
  note.textContent = 'Consultando a agenda…';
  try {
    const response = await fetch('/api/calendar?'+query,{signal:AbortSignal.any([request.signal,AbortSignal.timeout(15000)])});
    const data = await response.json();
    if (!response.ok) throw Error(data.error || 'Agenda indisponível');
    if (request.signal.aborted) return;
    calendar = data.matches;
    note.textContent = data.error ? 'Agenda em cache · '+data.error : data.cached ? 'Agenda em cache' : '';
  } catch (error) {
    if (request.signal.aborted) return;
    note.textContent = error.message;
  }
  if (calendarRequest===request) calendarRequest=undefined;
  note.hidden = !note.textContent;
  calendarLoaded = true;
  render();
}
function openDate(next, reconnect=false) {
  if (!/^20\d\d-\d\d-\d\d$/.test(next) || !Number.isFinite(Date.parse(next)) || shift(next,0)!==next) return;
  stream?.close();
  if (!reconnect) {
    calendarRequest?.abort();
    calendar = []; calendarLoaded = false;
    $('calendar-note').hidden = true;
    date=next; league=''; status={}; matches.clear(); arrivals.clear(); highlights.clear();
    initialized=false; delivery=null;
    updateDates(); render();
    if (agenda) void loadCalendar();
  }
  connected=false;
  paintStatus();
  const connection = new EventSource('/api/stream?date='+encodeURIComponent(date));
  stream=connection;
  notifications.sync();
  stream.addEventListener('open',()=>{connected=true;paintStatus();});
  stream.addEventListener('error',()=>{
    connected=false;paintStatus();
    if (connection.readyState===EventSource.CLOSED) {
      setTimeout(()=>{if (stream===connection) openDate(next,true);},2500);
    }
  });
  stream.addEventListener('snapshot',event=>{
    status=JSON.parse(event.data); matches=new Map(status.matches.map(m=>[m.id,m])); initialized=true; render(); paintStatus();
    if (agenda && !calendarLoaded && (status.limited && matches.size || status.updated)) void loadCalendar();
  });
  stream.addEventListener('status',event=>{
    const firstUpdate = !status.updated;
    status={...status,...JSON.parse(event.data)};render();paintStatus();
    if (matchPageId && date===today && (matches.get(matchPageId)?.status==='live' || !matchSnapshot)) void loadMatch();
    if (agenda && (firstUpdate || !calendarLoaded) && (status.limited || status.updated || status.error)) {
      if (status.limited) void loadCalendar();
      else setTimeout(()=>{if (date===next && agenda && !calendarLoaded) void loadCalendar();},6500);
    }
  });
  stream.addEventListener('patch',event=>{
    const {upsert,remove,first,publishedAt}=JSON.parse(event.data);
    let goal=false;
    for(const id of remove) matches.delete(id);
    for(const m of upsert) {
      const previous=matches.get(m.id), before=new Set(previous?.events.map(e=>e.id));
      if (!first) notifications.deliver(previous,m);
      if (date===today&&!first&&previous&&(m.status==='live'||previous.status==='live')) {
        const increased = scoreTotal(m.score)>scoreTotal(previous.score);
        for(const e of m.events.filter(e=>!before.has(e.id))) {
          arrivals.set(m.id+e.id,Date.now());
          if(e.kind==='Gol'&&e.detail!=='Missed Penalty'&&increased) {
            goal=true; highlights.set(m.id,e);
            setTimeout(()=>{if (highlights.get(m.id)===e) {highlights.delete(m.id);render();}},5250);
          }
        }
      }
      matches.set(m.id,m);
    }
    render();
    if (Number.isFinite(publishedAt)) delivery=Math.max(0,Date.now()-publishedAt);
    paintStatus();
    if(goal) ping();
  });
}
document.addEventListener('click',event=>{
  const anchor=event.target.closest('a');
  if (!matchPageId && anchor?.pathname.startsWith('/partidas/') && anchor.origin===location.origin) {
    history.replaceState({returnFromMatch:true,date,view,mode,league,query,round,range,competitionTab,agenda,
      status:$('status-filter').value,team:$('team-filter').value},'');
  }
  if (anchor?.hasAttribute('data-return-match') && document.referrer && new URL(document.referrer).origin===location.origin && !new URL(document.referrer).pathname.startsWith('/partidas/')) {
    event.preventDefault();
    history.back();
  }
  const button=event.target.closest('button');
  if (!button) return;
  const {mode:nextMode,date:nextDate,action,nearby}=button.dataset;
  if (button.dataset.range) {
    range=Number(button.dataset.range);
    if (date!==shift(today,1)) openDate(shift(today,1));
    else { render(); void loadCalendar(); }
  }
  if (button.dataset.calendarStep) openDate(shift(date,range*Number(button.dataset.calendarStep)));
  if (button.dataset.saveProfile) {
    const key = button.dataset.saveProfile;
    saveEntry(key,savedEntries.has(key) ? null : {href:location.pathname+location.search,label:$('heading').textContent,info:teamId?'Time':'Campeonato'});
    render();
  }
  if (button.dataset.removeSaved) {
    const key = button.dataset.removeSaved;
    saveEntry(key);
    if (favorites.delete(key)) {
      try { localStorage.setItem('placar360-favorites',JSON.stringify([...favorites])); } catch {}
    }
    render();
  }
  if (button.dataset.competitionTab) {
    competitionTab=button.dataset.competitionTab;
    render();
    if (competitionTab==='table') void loadStandings();
    $('competition-panel').querySelector('[aria-pressed="true"]')?.focus();
  }
  if (button.hasAttribute('data-favorite-match')) {
    const match=matches.get(matchPageId) ?? matchSnapshot;
    if (match && favorites.delete(match.id)) saveEntry(match.id);
    else if (match) {
      favorites.add(match.id);
      saveEntry(match.id,{href:matchLink(match),label:match.home.name+' × '+match.away.name});
    }
    try {localStorage.setItem('placar360-favorites',JSON.stringify([...favorites]));} catch {}
    renderMatchPage();
  }
  if (button.hasAttribute('data-follow-match')) {
    const match=matches.get(matchPageId) ?? matchSnapshot;
    if (match) notifications.edit(match);
  }
  if (button.hasAttribute('data-copy-match')) {
    if (navigator.clipboard) void navigator.clipboard.writeText(location.href).then(()=>{button.textContent='Link copiado';},()=>{button.textContent='Selecione o endereço na barra do navegador';});
    else button.textContent='Selecione o endereço na barra do navegador';
  }
  if (button.dataset.matchTab) {
    matchTab=button.dataset.matchTab;
    renderMatchPage();
    $('match-page').querySelector('[aria-pressed="true"]')?.focus();
    if (matchTab==='context') void loadMatchContext();
  }
  if (button.hasAttribute('data-settings')) $('settings').showModal();
  if (button.hasAttribute('data-settings-notifications')) {
    $('settings').close();
    $('notification-center-button').click();
  }
  if (button.hasAttribute('data-date-today')) {
    agenda=false; competition=null; teamId=null; view='today'; round=''; mode='all'; $('status-filter').value='';
    history.replaceState(null,'','/');
    openDate(today);
  }
  if (button.hasAttribute('data-agenda')) {
    const leaving = view==='legacy';
    agenda=!leaving; competition=null; teamId=null; view=leaving?'today':'legacy'; round=''; mode='all';
    $('status-filter').value=agenda?'scheduled':'';
    history.replaceState(null,'','/');
    if (leaving) {calendarRequest?.abort(); $('calendar-note').hidden=true; render();}
    else { render(); void loadCalendar(); }
  }
  if (nextMode) {mode=nextMode; if (nextMode!=='all') $('status-filter').value=''; render();}
  if (nextDate&&nextDate!==date) openDate(nextDate);
  if (nearby!==undefined) openDate(nearby==='0' ? today : nearby);
  if (action) {
    const id=button.closest('[data-match]').dataset.match;
    if(favorites.has(id)) favorites.delete(id); else favorites.add(id);
    if(action==='favorite') { try {localStorage.setItem('placar360-favorites',JSON.stringify([...favorites]));} catch {} }
    if(action==='favorite') {
      const match=matches.get(id) ?? calendar.find(m=>m.id===id);
      if (match) saveEntry(id,favorites.has(id) ? {href:matchLink(match),label:match.home.name+' × '+match.away.name,info:shortDate.format(dateValue(match.date))} : null);
    }
    render();
  }
});
document.addEventListener('submit',event=>{
  if (event.target.id!=='season-form') return;
  event.preventDefault();
  location.href=competitionLink({...competition,season:Number($('season').value)},date)+(teamId?'&team='+encodeURIComponent(teamId):'');
});
$('prev').onclick=()=>openDate(shift(date,-1));
$('next').onclick=()=>openDate(shift(date,1));
$('date').onchange=event=>{if(/^20\d\d-\d\d-\d\d$/.test(event.target.value)) openDate(event.target.value);};
$('league-select').onchange=event=>{league=event.target.value;render();};
$('team-filter').onchange=()=>{restoredTeam='';render();};
$('status-filter').onchange=()=>{mode='all';render();};
$('round-filter').onchange=event=>{round=event.target.value;if(round) competitionTab='games';render();};
$('search').oninput=event=>{query=event.target.value;render();};
$('sound').innerHTML=icon('muted');
$('sound').onclick=async()=>{
  if(!sound) {
    try {audio ??= new AudioContext(); await audio.resume();} catch {return;}
  }
  sound=!sound;
  $('sound').innerHTML=icon(sound?'sound':'muted');
  $('sound').setAttribute('aria-pressed',String(sound));
  $('sound').setAttribute('aria-label',sound?'Desativar som de gol':'Ativar som de gol');
};
setInterval(()=>{
  const next=dayFormat.format(new Date());
  if(next!==today){const follow=!matchPageId&&date===today;today=next;if(follow)openDate(today);else updateDates();notifications.sync();}
},30000);
window.addEventListener('pagehide',()=>stream?.close());
window.addEventListener('pageshow',event=>{
  if (event.persisted) openDate(date,true);
});
const notifications=createNotifications({escape:esc,icon,today:()=>today,activeDate:()=>date,onChange:renderMatchPage,
  onSound:async records=>{
    if (sound && records?.some(record=>record.types.includes('goal'))) return;
    try { audio ??= new AudioContext(); if (!records) await audio.resume(); ping(true); } catch {}
  }});
const params = new URLSearchParams(location.search);
if (Object.hasOwn(viewTitles,params.get('view'))) view=params.get('view');
agenda = ['home','upcoming','results','teams','competitions'].includes(view);
if (['live','favorites'].includes(view)) mode=view;
document.querySelectorAll('[data-view]').forEach(link=>{
  if (link.dataset.view===view && !params.has('competition') && !params.has('match')) link.setAttribute('aria-current','page');
});
const routeMatch = /^\/partidas\/((?:api|open|espn)-\d+)$/.exec(location.pathname)?.[1] ?? params.get('match');
if (/^(?:api|open|espn)-\d+$/.test(routeMatch ?? '')) {
  matchPageId=routeMatch;
  document.body.classList.add('show-match-page');
  $('match-page').parentElement.classList.add('match-page-active');
}
if (/^\d+$/.test(params.get('competition') ?? '') && /^20\d\d$/.test(params.get('season') ?? '')) {
  competition={id:Number(params.get('competition')),season:Number(params.get('season')),name:'Campeonato'};
  view='competition';
  agenda=true;
  if (/^\d+$/.test(params.get('team') ?? '')) {
    teamId=params.get('team');
    competitionTab='games';
  }
}
const restored = !matchPageId && history.state?.returnFromMatch ? history.state : null;
const initialDate = restored?.date ?? params.get('date');
openDate(initialDate && /^20\d\d-\d\d-\d\d$/.test(initialDate) && Number.isFinite(Date.parse(initialDate)) && shift(initialDate,0)===initialDate ? initialDate : view==='upcoming' ? shift(today,1) : view==='results' ? shift(today,-1) : today);
if (restored) {
  ({view,mode,league,query,round,range,competitionTab,agenda}=restored);
  $('status-filter').value=restored.status;
  $('search').value=query;
  restoredTeam=restored.team;
  render();
}
if (matchPageId) void loadMatch();
void loadCompetitionCatalog();

