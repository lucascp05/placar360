import { readFile, writeFile, rename } from 'node:fs/promises';

import { createEspn, southAmericanLeagues } from './espn.js';

export const priority = [71,72,73,75,475,476,477,478,479,13,11,2,3,39,140,78,79,135,61,1,4,9,960];
export const openLeagues = [
  {id:78,shortcut:'bl1',name:'Bundesliga',country:'Alemanha'},
  {id:79,shortcut:'bl2',name:'2. Bundesliga',country:'Alemanha'},
  {id:39,shortcut:'pl',name:'Premier League',country:'Inglaterra'},
  {id:2,shortcut:'ucl',name:'Champions League',country:'Europa'},
  {id:3,shortcut:'uel2026',name:'Europa League',country:'Europa',season:2026}
];
const liveCodes = new Set(['1H','HT','2H','ET','BT','P','LIVE','INT']);
const endedCodes = new Set(['FT','AET','PEN']);
const labels = { HT:'Intervalo', BT:'Intervalo da prorrogação', FT:'Encerramento', AET:'Encerramento', PEN:'Encerramento após pênaltis' };
const dayFormat = new Intl.DateTimeFormat('sv-SE', {timeZone:'America/Sao_Paulo'});
export const dateOf = value => dayFormat.format(new Date(value));
const minuteOf = (elapsed, extra) => Number.isFinite(elapsed) ? elapsed + (extra ? '+'+extra : '') + '′' : '';
const validDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const asText = value => typeof value === 'string' ? value : '';
const asNumber = value => Number.isFinite(value) ? value : null;
function logo(value) {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; }
}
function addEvents(match, list) {
  const unique = new Map();
  for (const item of list) {
    const id = JSON.stringify([item.kind,item.detail,item.minute,item.extra,item.team,item.player,item.assist]);
    unique.set(id,{...item,id});
  }
  match.events = [...unique.values()].sort((a,b) => (a.minute ?? 999)-(b.minute ?? 999) || (a.extra ?? 0)-(b.extra ?? 0));
  return match;
}
const marker = (detail, minute = null, extra = null) => ({kind:'Fase',detail,minute,extra,team:null,player:'',assist:''});
function markers(status, clock) {
  if (status==='1H') return [marker('Início',0)];
  if (status==='HT' || status==='BT') return [marker(labels[status],asNumber(clock.elapsed),asNumber(clock.extra))];
  return endedCodes.has(status) ? [marker(labels[status])] : [];
}
export function normalizeApi(raw) {
  const {fixture,league,teams,goals,score,events,statistics,lineups} = raw ?? {};
  if (!Number.isInteger(fixture?.id) || !validDate(fixture.date) || !league?.id || !teams?.home?.name || !teams?.away?.name) return null;
  const status = fixture.status?.short;
  const team = entry => ({id:entry.id,name:asText(entry.name),logo:logo(entry.logo)});
  return addEvents({
    id:'api-'+fixture.id, date:dateOf(fixture.date), kickoff:fixture.date, round:asText(league.round),
    league:{id:league.id,name:asText(league.name),country:asText(league.country),logo:logo(league.logo),season:asNumber(league.season)},
    home:team(teams.home),away:team(teams.away),score:[asNumber(goals?.home),asNumber(goals?.away)],
    penalties:[asNumber(score?.penalty?.home),asNumber(score?.penalty?.away)],
    status:liveCodes.has(status) ? 'live' : endedCodes.has(status) ? 'final' : ['TBD','NS'].includes(status) ? 'scheduled' : 'other',
    clock:labels[status] ?? (liveCodes.has(status) ? minuteOf(fixture.status.elapsed,fixture.status.extra) : ''),
    statusLabel:({PST:'Adiado',CANC:'Cancelado',SUSP:'Suspenso',ABD:'Abandonado',AWD:'Resultado atribuído',WO:'W.O.',INT:'Interrompido',TBD:'Horário a definir',P:'Pênaltis'})[status] ?? '',
    detailed:Array.isArray(events),
    venue:asText(fixture.venue?.name), referee:asText(fixture.referee),
    statistics:Array.isArray(statistics) ? statistics.filter(s=>s?.team?.id).map(s=>({
      team:s.team.id, values:(s.statistics ?? []).filter(v=>v?.type && v.value != null).map(v=>({label:v.type,value:v.value}))
    })) : [],
    lineups:Array.isArray(lineups) ? lineups.filter(l=>l?.team?.id).map(l=>({
      team:l.team.id, formation:asText(l.formation),
      starters:(l.startXI ?? []).flatMap(({player})=>player?.name ? [{name:player.name,number:player.number,grid:player.grid}] : []),
      substitutes:(l.substitutes ?? []).flatMap(({player})=>player?.name ? [{name:player.name,number:player.number}] : [])
    })) : [],
  }, [...markers(status,fixture.status),...(Array.isArray(events) ? events : []).filter(e=>['Goal','Card','subst','Var'].includes(e?.type)).map(e=>({
    kind:({Goal:'Gol',Card:'Cartão',subst:'Substituição',Var:'VAR'})[e.type],detail:asText(e.detail),
    minute:asNumber(e.time?.elapsed),extra:asNumber(e.time?.extra),team:e.team?.id ?? null,
    player:asText(e.player?.name),assist:asText(e.assist?.name)
  }))]);
}
export function normalizeOpen(raw, league = openLeagues[0]) {
  if (!Number.isInteger(raw?.matchID) || !validDate(raw.matchDateTimeUTC) || !raw.team1?.teamName || !raw.team2?.teamName) return null;
  const team = entry => ({id:entry.teamId,name:entry.teamName,logo:logo(entry.teamIconUrl)});
  const final = raw.matchIsFinished === true;
  const results = Array.isArray(raw.matchResults) ? raw.matchResults.filter(Boolean) : [];
  const result = results.find(r=>r.resultTypeID===2) ?? results.at(-1);
  const goals = Array.isArray(raw.goals) ? raw.goals.filter(Boolean).sort((a,b)=>(a.matchMinute??0)-(b.matchMinute??0) || a.goalID-b.goalID) : [];
  const last = goals.at(-1);
  const active = !final && Boolean(result || last);
  const score = [asNumber(result?.pointsTeam1),asNumber(result?.pointsTeam2)];
  if (!final && last) { score[0] = asNumber(last.scoreTeam1); score[1] = asNumber(last.scoreTeam2); }
  const groupName = asText(raw.group?.groupName);
  const round = groupName && !/^\d+\.\s*Spieltag$/i.test(groupName) ? groupName : raw.group?.groupOrderID;
  let previous = [0,0];
  const events = goals.map(goal => {
    const next = [goal.scoreTeam1,goal.scoreTeam2];
    const side = next[0]>previous[0] ? raw.team1.teamId : next[1]>previous[1] ? raw.team2.teamId : null;
    previous = next;
    return {kind:'Gol',detail:goal.isPenalty ? 'Penalty' : goal.isOwnGoal ? 'Own Goal' : '',minute:asNumber(goal.matchMinute),extra:null,team:goal.scoringTeamId || side,player:asText(goal.goalGetterName),assist:''};
  });
  return addEvents({
    id:'open-'+raw.matchID,date:dateOf(raw.matchDateTimeUTC),kickoff:raw.matchDateTimeUTC,round,roundOrder:raw.group?.groupOrderID,
    league:{id:league.id,name:league.name,country:league.country,logo:'',season:Number(raw.leagueSeason)||null},home:team(raw.team1),away:team(raw.team2),score,
    penalties:[null,null],status:final ? 'final' : active ? 'live' : 'scheduled',clock:'',statusLabel:'',
    venue:asText(raw.location?.locationStadium),
    sourceUpdated:validDate(raw.lastUpdateDateTime) && /(?:Z|[+-]\d\d:\d\d)$/.test(raw.lastUpdateDateTime) ? raw.lastUpdateDateTime : null,detailed:false,
  }, final ? [...events,marker('Encerramento')] : events);
}

const openSeason = day => {
  const [year,month] = day.split('-').map(Number);
  return month >= 7 ? year : year-1;
};

function createOpenFeed(league, request) {
  const cacheName = league.id===78 ? 'bundesliga-cache' : 'openliga-'+league.shortcut;
  const file = new URL('./'+cacheName+'.json',import.meta.url);
  const temporary = new URL('./'+cacheName+'.tmp',import.meta.url);
  const normalize = rows => rows.map(row=>normalizeOpen(row,league)).filter(Boolean);
  const seasons = new Map();
  const pending = new Map();
  const previousPoll = new Map();
  return {
    seasons,
    schedule(season) {
      return this.collect(season+'-08-01',[],true);
    },
    async initialize() {
      try {
        const rows = JSON.parse(await readFile(file,'utf8'));
        const season = Number(rows[0]?.leagueSeason);
        if (!season || (league.season && season!==league.season)) return [];
        const matches = normalize(rows);
        seasons.set(season,{matches,updated:0});
        return matches;
      } catch { return []; }
    },
    async collect(day, known, schedule = false) {
      const now = Date.now();
      const season = openSeason(day);
      if (league.season && league.season!==season) return [];
      const cached = seasons.get(season);
      const current = day === dateOf(now);
      const round = current && known.find(m=>m.league.id===league.id && m.status!=='final'
        && (m.status==='live'||Math.abs(now-Date.parse(m.kickoff))<3*3600000))?.roundOrder;
      if (pending.has(season)) return pending.get(season);
      if (now-(previousPoll.get(season) ?? 0)<30000) {
        if (cached) return cached.matches;
        throw Error('Aguardando intervalo de consulta');
      }
      const recent = cached && now-cached.updated<6*3600000;
      if (cached && ((!current && !schedule) || (recent && !round))) return cached.matches;
      previousPoll.set(season,now);
      const partial = recent && round;
      const url = 'https://api.openligadb.de/getmatchdata/'+league.shortcut+'/'+season+(partial ? '/'+round : '');
      const result = (async()=>{
      const rows = await (await request(url)).json();
      if (!Array.isArray(rows)) throw Error('Agenda da fonte inválida');
      const matches = normalize(rows);
      if (rows.length && !matches.length || !matches.length && cached?.matches.length) throw Error('Agenda da fonte vazia ou inválida');
      if (partial) {
        cached.matches = [...new Map([...cached.matches,...matches].map(m=>[m.id,m])).values()];
        return cached.matches;
      }
      if (seasons.size>=5 && !seasons.has(season)) seasons.delete(seasons.keys().next().value);
      seasons.set(season,{matches,updated:now});
      if (season===openSeason(dateOf(now)) && rows.length) {
        try { await writeFile(temporary,JSON.stringify(rows)); await rename(temporary,file); } catch {}
      }
      return matches;
      })().finally(()=>pending.delete(season));
      pending.set(season,result);
      return result;
    }
  };
}

export function createSource(key, limit) {
  let used = 0, quotaDay, remaining = limit, latestApiCall = 0;
  async function request(url, headers) {
    const response = await fetch(url,{headers,signal:AbortSignal.timeout(8500)});
    if (!response.ok) throw Error('Fonte respondeu HTTP '+response.status);
    return response;
  }
  const openFeeds = key ? [] : openLeagues.map(league=>createOpenFeed(league,request));
  const espn = createEspn(async url=>{
    const response = await request(url).catch(error=>{
      if (/HTTP 4\d\d/.test(error.message)) throw error;
      return request(url);
    }).catch(error=>{
      throw Error(error.cause?.code ? 'Conexão com a ESPN indisponível ('+error.cause.code+').' : 'ESPN: '+error.message);
    });
    if (!response.ok) throw Error('ESPN respondeu HTTP '+response.status);
    return response;
  },dateOf,new URL('./.espn-cache/',import.meta.url));
  async function apiFixtures(query) {
    const nowDay = new Date().toISOString().slice(0,10);
    if (quotaDay !== nowDay) { quotaDay = nowDay; used = 0; remaining = limit; }
    if (used >= limit || remaining <= 0) throw Error('Cota diária da fonte esgotada');
    if (Date.now()-latestApiCall < 6100) throw Error('Aguardando intervalo de consulta');
    used++;
    latestApiCall = Date.now();
    const response = await request('https://v3.football.api-sports.io/fixtures?'+query+'&timezone=America%2FSao_Paulo',{'x-apisports-key':key});
    const quota = response.headers.get('x-ratelimit-requests-remaining');
    if (quota !== null && Number.isFinite(Number(quota))) remaining = Number(quota);
    const data = await response.json();
    if (Object.values(data.errors ?? {}).length || !Array.isArray(data.response)) throw Error('Fonte recusou a consulta ou retornou dados inválidos');
    return data.response.map(normalizeApi).filter(m=>m && priority.includes(m.league.id));
  }
  const calendars = new Map();
  const details = new Map();
  return {
    name:key ? 'API-Football' : 'OpenLigaDB',
    leagues:key ? southAmericanLeagues : [...openLeagues,...southAmericanLeagues],
    supplemental:key ? null : 'ESPN',
    standings:(id,season)=>espn.standings(id,season),
    async initialize() {
      return (await Promise.all(openFeeds.map(feed=>feed.initialize()))).flat();
    },
    async fixture(id,date) {
      if (!key && id.startsWith('espn-')) {
        const calendar = await espn.calendar(date,date);
        const match = calendar.matches.find(m=>m.id===id);
        if (!match && calendar.error) throw Error(calendar.error);
        return match ?? null;
      }
      if (!key) return Promise.resolve(null);
      const cached = details.get(id);
      if (cached && Date.now()-cached.time<cached.ttl) return cached.result;
      const entry = {time:Date.now(),ttl:60000};
      entry.result = apiFixtures('id='+id.slice(4)).then(([match])=>{
        if (match?.status==='final') entry.ttl=86400000;
        return match ?? null;
      }).catch(error=>{
        details.delete(id);
        throw error;
      });
      details.set(id,entry);
      if (details.size>100) details.delete(details.keys().next().value);
      return entry.result;
    },
    async calendar(day, end, league, season) {
      if (!key) {
        if (southAmericanLeagues.some(l=>l.id===league)) return espn.calendar(day,end,league,season);
        const supplemental = league ? null : espn.calendar(day,end).catch(()=>({matches:[],error:'Agenda ESPN indisponível'}));
        const dates = new Set(league ? [season] : [openSeason(day),openSeason(end)]);
        const requests = openFeeds.flatMap((feed,index)=>league && league!==openLeagues[index].id
          ? [] : [...dates].map(year=>feed.schedule(year)));
        const results = await Promise.allSettled(requests);
        const extra = await supplemental;
        const schedules = openFeeds.flatMap((feed,index)=>[...feed.seasons].filter(([year])=>league
          ? openLeagues[index].id===league && year===season : dates.has(year)).map(([,data])=>data));
        if (!schedules.length && (!extra || extra.error && !extra.matches.length)) {
          throw results.find(r=>r.status==='rejected')?.reason ?? Error('Aguardando a agenda da fonte');
        }
        return {matches:[...schedules.flatMap(data=>data.matches),...(extra?.matches ?? [])],
          cached:Boolean(extra?.cached || schedules.length && schedules.every(data=>!data.updated)),
          error:results.some(r=>r.status==='rejected') || extra?.error ? 'Cobertura parcial da agenda nesta consulta' : undefined};
      }
      const scope = league ? 'league='+league+'&season='+season : 'from='+day+'&to='+end;
      const cached = calendars.get(scope);
      if (cached && (cached.pending || Date.now()-cached.time<300000)) return cached.result;
      const entry = {pending:true,time:Date.now()};
      entry.result = apiFixtures(scope).then(matches=>({matches,cached:false})).catch(error=>{
        if (cached) {
          calendars.set(scope,cached);
          return cached.result.then(result=>({...result,cached:true,error:error.message}));
        }
        calendars.delete(scope);
        throw error;
      }).finally(()=>{entry.pending=false;});
      calendars.set(scope,entry);
      if (calendars.size>12) calendars.delete(calendars.keys().next().value);
      return entry.result;
    },
    async collect(day, known) {
      if (key) {
        const now = Date.now();
        const active = known.filter(m=>m.status==='live');
        const nearKickoff = known.filter(m=>m.status==='scheduled' && Math.abs(now-Date.parse(m.kickoff))<15*60000);
        const details = known.filter(m=>m.status==='final' && !m.detailed).slice(0,20);
        const dateQuery = 'date='+day;
        const focused = [...active,...nearKickoff,...details];
        const canFocus = focused.length && focused.length<=20 && used%3!==0;
        const query = canFocus ? 'ids='+focused.map(m=>m.id.slice(4)).join('-') : dateQuery;
        const old = new Map(known.map(m=>[m.id,m]));
        const fetched = await apiFixtures(query);
        const updated = fetched.filter(m=>m.date===day).map(m=>{
          const previous = old.get(m.id);
          if (!previous) return m;
          const phases = previous.events.filter(e=>e.kind==='Fase' && !e.detail.startsWith('Encerramento'));
          const events = m.detailed ? [] : previous.events.filter(e=>e.kind!=='Fase');
          return addEvents({...m,detailed:m.detailed||previous.detailed,
            statistics:m.statistics.length ? m.statistics : previous.statistics,
            lineups:m.lineups.length ? m.lineups : previous.lineups},[...phases,...events,...m.events]);
        });
        if (canFocus) {
          const movedIds = new Set(fetched.filter(m=>m.date!==day).map(m=>m.id));
          return [...new Map([...known.filter(m=>!movedIds.has(m.id)),...updated].map(m=>[m.id,m])).values()];
        }
        return updated;
      }
      const season = openSeason(day);
      const activeFeeds = openFeeds.filter((_,index)=>!openLeagues[index].season || openLeagues[index].season===season);
      const results = await Promise.allSettled([...activeFeeds.map(feed=>feed.collect(day,known)),espn.collect(day,known)]);
      if (results.every(result=>result.status==='rejected')) throw results[0].reason;
      return results.flatMap((result,index)=>result.status==='fulfilled' ? result.value
        : index===activeFeeds.length ? known.filter(m=>m.id.startsWith('espn-')) : activeFeeds[index].seasons.get(season)?.matches ?? []);
    }
  };
}


