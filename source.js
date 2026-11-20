import { readFile, writeFile, rename } from 'node:fs/promises';

export const priority = [71,72,73,75,475,476,477,478,479,13,11,2,39,140,78,135,61,1,4,9,960];
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
const marker = (detail, minute) => ({kind:'Fase',detail,minute,extra:null,team:null,player:'',assist:''});
function markers(status) {
  const list = [];
  if (liveCodes.has(status) || endedCodes.has(status)) list.push(marker('Início',0));
  if (['HT','2H','ET','BT','P',...endedCodes].includes(status)) list.push(marker('Intervalo',45));
  if (endedCodes.has(status)) list.push(marker(labels[status],null));
  return list;
}
export function normalizeApi(raw) {
  const {fixture,league,teams,goals,score,events} = raw ?? {};
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
  }, [...markers(status),...(Array.isArray(events) ? events : []).filter(e=>['Goal','Card','subst','Var'].includes(e?.type)).map(e=>({
    kind:({Goal:'Gol',Card:'Cartão',subst:'Substituição',Var:'VAR'})[e.type],detail:asText(e.detail),
    minute:asNumber(e.time?.elapsed),extra:asNumber(e.time?.extra),team:e.team?.id ?? null,
    player:asText(e.player?.name),assist:asText(e.assist?.name)
  }))]);
}
export function normalizeOpen(raw) {
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
  let previous = [0,0];
  const events = goals.map(goal => {
    const next = [goal.scoreTeam1,goal.scoreTeam2];
    const side = next[0]>previous[0] ? raw.team1.teamId : next[1]>previous[1] ? raw.team2.teamId : null;
    previous = next;
    return {kind:'Gol',detail:goal.isPenalty ? 'Penalty' : goal.isOwnGoal ? 'Own Goal' : '',minute:asNumber(goal.matchMinute),extra:null,team:goal.scoringTeamId || side,player:asText(goal.goalGetterName),assist:''};
  });
  return addEvents({
    id:'open-'+raw.matchID,date:dateOf(raw.matchDateTimeUTC),kickoff:raw.matchDateTimeUTC,round:raw.group?.groupOrderID,
    league:{id:78,name:'Bundesliga',country:'Alemanha',logo:'',season:Number(raw.leagueSeason)||null},home:team(raw.team1),away:team(raw.team2),score,
    penalties:[null,null],status:final ? 'final' : active ? 'live' : 'scheduled',clock:'',statusLabel:'',
    sourceUpdated:validDate(raw.lastUpdateDateTime) && /(?:Z|[+-]\d\d:\d\d)$/.test(raw.lastUpdateDateTime) ? raw.lastUpdateDateTime : null,detailed:false,
  }, [...markers(final ? 'FT' : active ? 'LIVE' : ''),...events]);
}

export function createSource(key, limit) {
  const file = new URL('./bundesliga-cache.json',import.meta.url);
  let openData = [], currentSeason, previousPoll = 0, seasonFetched = 0;
  let used = 0, quotaDay, remaining = limit, latestApiCall = 0;
  const seasons = new Map();
  async function request(url, headers) {
    const response = await fetch(url,{headers,signal:AbortSignal.timeout(8500)});
    if (!response.ok) throw Error('Fonte respondeu HTTP '+response.status);
    return response;
  }
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
  return {
    name:key ? 'API-Football' : 'OpenLigaDB',
    async initialize() {
      if (key) return [];
      try {
        const rows = JSON.parse(await readFile(file,'utf8'));
        openData = rows.map(normalizeOpen).filter(Boolean);
        currentSeason = rows[0]?.leagueSeason;
        return openData;
      } catch { return []; }
    },
    async calendar(day, end, league, season) {
      if (!key) {
        const rows = seasons.get(season) ?? openData;
        if (!rows.length) throw Error('Aguardando a agenda da fonte');
        return {matches:rows, cached:!seasonFetched || rows!==openData};
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
        const active = day === dateOf(Date.now()) && known.some(m=>m.status==='live');
        const details = known.filter(m=>m.status==='final' && !m.detailed).slice(0,20);
        const dateQuery = 'date='+day;
        const liveQuery = 'live='+priority.join('-');
        const detailQuery = details.length ? 'ids='+details.map(m=>m.id.slice(4)).join('-') : '';
        const query = active && used%5 !== 0 ? liveQuery : detailQuery || dateQuery;
        const old = new Map(known.map(m=>[m.id,m]));
        const updated = (await apiFixtures(query)).filter(m=>m.date===day).map(m=>{
          const previous = old.get(m.id);
          return m.detailed || !previous?.detailed ? m : addEvents({...m,detailed:true},[...previous.events.filter(e=>e.kind!=='Fase'),...m.events]);
        });
        if (query === liveQuery || query === detailQuery) return [...new Map([...known,...updated].map(m=>[m.id,m])).values()];
        return updated;
      }
      const [year,month] = day.split('-').map(Number);
      const season = month >= 7 ? year : year-1;
      if (Date.now()-previousPoll < 30000) { if (season===currentSeason) return openData; if (seasons.has(season)) return seasons.get(season); throw Error('Aguardando intervalo de consulta'); }
      const base = 'https://api.openligadb.de/';
      const isCurrent = day === dateOf(Date.now());
      if (!isCurrent && seasons.has(season)) return seasons.get(season);
      if (!isCurrent && currentSeason===season && openData.length) return openData;
      const round = known.find(m=>m.status==='live' || Math.abs(Date.now()-Date.parse(m.kickoff))<3*3600000)?.round;
      if (isCurrent && season===currentSeason && !round && Date.now()-seasonFetched<6*3600000) return openData;
      previousPoll = Date.now();
      const partial = isCurrent && season===currentSeason && round && Date.now()-seasonFetched<6*3600000;
      const rows = await (await request(base+'getmatchdata/bl1/'+season+(partial ? '/'+round : ''))).json();
      if (!Array.isArray(rows)) throw Error('Agenda da fonte inválida');
      const normalized = rows.map(normalizeOpen).filter(Boolean);
      if (partial) {
        openData = [...new Map([...openData,...normalized].map(m=>[m.id,m])).values()];
        return openData;
      }
      if (!isCurrent && season!==currentSeason) {
        if (seasons.size>=4) seasons.delete(seasons.keys().next().value);
        seasons.set(season,normalized);
        return normalized;
      }
      openData = normalized;
      currentSeason = season;
      seasonFetched = Date.now();
      if (rows.length) {
        try { await writeFile(new URL('./bundesliga-cache.tmp',import.meta.url),JSON.stringify(rows)); await rename(new URL('./bundesliga-cache.tmp',import.meta.url),file); } catch {}
      }
      return openData;
    }
  };
}


