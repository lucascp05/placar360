import { brasileiraoRound } from './brasileirao-rounds.js';

export const southAmericanLeagues = [
  {id:71, slug:'bra.1', name:'Brasileirão Série A', country:'Brasil'},
  {id:73, slug:'bra.copa_do_brazil', name:'Copa do Brasil', country:'Brasil'},
  {id:13, slug:'conmebol.libertadores', name:'Copa Libertadores da América', country:'América do Sul'}
];

const site = 'https://site.api.espn.com/apis/';
const phases = {
  'First Round':'1ª fase','Second Round':'2ª fase','Third Round':'3ª fase',
  'Fourth Round':'4ª fase','Fifth Round':'5ª fase',
  'First Stage':'1ª fase preliminar','Second Stage':'2ª fase preliminar','Third Stage':'3ª fase preliminar',
  'Group Stage':'Fase de grupos','Round of 16':'Oitavas de final','Quarterfinals':'Quartas de final',
  'Semifinals':'Semifinais',Final:'Final'
};
const scoreOf = value => /^\d+$/.test(String(value)) ? Number(value) : null;
const crest = value => typeof value==='string' && value.startsWith('https://') ? value : '';

function normalize(event, league, dateOf) {
  const c = event?.competitions?.[0];
  const type = (c?.status ?? event?.status)?.type;
  const sides = ['home','away'].map(side=>c?.competitors?.find(t=>t.homeAway===side));
  const season = event?.season?.year;
  if (!/^\d+$/.test(event?.id) || !Number.isInteger(season) || !Number.isFinite(Date.parse(event.date)) ||
      !type || sides.some(t=>!t?.team?.displayName || scoreOf(t.team.id)===null)) return null;
  const statusLabel = {STATUS_POSTPONED:'Adiado',STATUS_CANCELED:'Cancelado',STATUS_CANCELLED:'Cancelado',
    STATUS_SUSPENDED:'Suspenso',STATUS_ABANDONED:'Abandonado',STATUS_DELAYED:'Atrasado',STATUS_HALFTIME:'Intervalo'}[type.name] ?? '';
  const status = type.state==='in' ? 'live' : statusLabel ? 'other' : type.completed ? 'final' : type.state==='pre' ? 'scheduled' : 'other';
  const team = ({team:t})=>({id:Number(t.id),name:t.displayName,logo:crest(t.logo)});
  const phase = c.altGameNote?.split(', ').slice(1).join(', ') || c.series?.title;
  const note = c.notes?.find(n=>/^(1st|2nd) Leg/.test(n.text))?.text;
  const events = new Map();
  for (const item of c.details ?? []) {
    const kind = item.redCard || item.yellowCard ? 'Cartão' : item.scoringPlay && !item.shootout ? 'Gol'
      : /substitution/i.test(item.type?.text) ? 'Substituição' : null;
    if (!kind) continue;
    const time = /^(\d+)(?:\s*\+\s*(\d+))?/.exec(item.clock?.displayValue ?? '');
    const detail = item.redCard?'Red Card':item.yellowCard?'Yellow Card':item.ownGoal?'Own Goal':item.penaltyKick?'Penalty':'';
    const record = {kind,detail,minute:scoreOf(time?.[1]),extra:scoreOf(time?.[2]),team:scoreOf(item.team?.id),
      player:item.athletesInvolved?.[0]?.displayName ?? '',assist:''};
    const id = JSON.stringify(Object.values(record));
    events.set(id,{...record,id});
  }
  return {
    id:'espn-'+event.id, date:dateOf(event.date), kickoff:event.date,
    round:league.id===71 ? scoreOf(event.week?.number ?? c.week?.number) ?? brasileiraoRound(season,sides[0].team.id,sides[1].team.id)
      : phases[phase] ?? phase?.replace(/^Group /,'Grupo '),
    leg:note?.startsWith('1st')?'Ida':note?.startsWith('2nd')?'Volta':'',
    league:{id:league.id,name:league.name,country:league.country,season,logo:''},
    home:team(sides[0]),away:team(sides[1]),score:sides.map(t=>['live','final'].includes(status) ? scoreOf(t.score) : null),
    penalties:sides.map(t=>status==='final' ? scoreOf(t.shootoutScore) : null),status,statusLabel,
    clock:status==='live' && c.status?.clock>0 ? c.status.displayClock : '',
    venue:c.venue?.fullName ?? '',detailed:Array.isArray(c.details),events:[...events.values()]
      .sort((a,b)=>(a.minute ?? 999)-(b.minute ?? 999)||(a.extra ?? 0)-(b.extra ?? 0))
  };
}

export function createEspn(request,dateOf) {
  const entries = new Map();
  function cached(key,ttl,load) {
    const previous = entries.get(key);
    if (previous && (previous.pending || Date.now()<previous.expires)) return previous.promise;
    const entry = {pending:true,value:previous?.value};
    entry.promise = Promise.resolve().then(load).then(value=>{
      entry.value=value;
      entry.expires=Date.now()+ttl;
      return {value,cached:false};
    }).catch(error=>{
      entry.expires=Date.now()+30000;
      if (entry.value===undefined) throw error;
      return {value:entry.value,cached:true,error:'Consulta ESPN temporariamente indisponível'};
    }).finally(()=>{entry.pending=false;});
    entries.set(key,entry);
    if (entries.size>80) {
      const oldest = [...entries].find(([id,item])=>id!==key && !item.pending);
      if (oldest) entries.delete(oldest[0]);
    }
    return entry.promise;
  }
  function fixtures(league,date,ttl) {
    return cached(league.slug+':'+date,ttl,async()=>{
      const url = site+'site/v2/sports/soccer/'+league.slug+'/scoreboard?dates='+date+'&limit=500';
      const data = await (await request(url)).json();
      if (!Array.isArray(data.events) || data.events.length>=500) throw Error('Calendário ESPN indisponível ou incompleto');
      return data.events.map(event=>normalize(event,league,dateOf)).filter(Boolean);
    });
  }
  const season = (league,year)=>fixtures(league,year,900000);
  return {
    async calendar(from,to,id,year) {
      const leagues = southAmericanLeagues.filter(l=>!id || l.id===id);
      const years = new Set(id ? [String(year)] : [from.slice(0,4),to.slice(0,4)]);
      const results = await Promise.allSettled(leagues.flatMap(l=>[...years].map(y=>season(l,y))));
      if (results.length && results.every(r=>r.status==='rejected')) throw results[0].reason;
      return {
        matches:results.flatMap(r=>r.status==='fulfilled' ? r.value.value : []).filter(m=>id ? m.league.season===year : m.date>=from&&m.date<=to),
        cached:results.some(r=>r.status==='fulfilled'&&r.value.cached),
        error:results.some(r=>r.status==='rejected'||r.value.error) ? 'Cobertura parcial da ESPN nesta consulta' : undefined
      };
    },
    async collect(day,known) {
      const today = day===dateOf(Date.now());
      const results = await Promise.allSettled(southAmericanLeagues.map(l=>today
        ? fixtures(l,day.replaceAll('-',''),30000) : season(l,day.slice(0,4))));
      if (results.every(r=>r.status==='rejected'||r.value.error)) throw Error('Consulta ESPN temporariamente indisponível');
      return results.flatMap((r,i)=>{
        const league = southAmericanLeagues[i];
        if (r.status==='fulfilled') return r.value.value.filter(m=>m.date===day);
        return known.filter(m=>m.league.id===league.id && m.id.startsWith('espn-'));
      });
    },
    async standings(id,year) {
      const league = southAmericanLeagues.find(l=>l.id===id && id!==73);
      if (!league) return null;
      return cached('standings:'+id+':'+year,300000,async()=>{
        const data = await (await request(site+'v2/sports/soccer/'+league.slug+'/standings?season='+year)).json();
        return (data.children ?? []).map(group=>{
          const rows = (group.standings?.entries ?? []).flatMap(entry=>{
            const stats = new Map((entry.stats ?? []).map(stat=>[stat.name,stat.value]));
            const [rank,played,difference,points] = ['rank','gamesPlayed','pointDifferential','points'].map(name=>stats.get(name));
            if (!entry.team?.displayName || ![rank,played,difference,points].every(Number.isFinite)) return [];
            return [{name:entry.team.displayName,rank,played,difference,points}];
          }).sort((a,b)=>a.rank-b.rank);
          return {name:group.name?.replace(/^Group /,'Grupo ') ?? '',rows};
        }).filter(group=>group.rows.length);
      });
    }
  };
}
