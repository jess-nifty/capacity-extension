import {initializeBlock, useBase, useRecords, loadCSSFromString} from '@airtable/blocks/interface/ui';
import React, {useState, useMemo} from 'react';

/*
  Capacity Overview — Interface Extension
  Replicates the HTML capacity dashboard, reading live from the base.
  Tables + fields must be added as data sources on the interface page.
*/

// ---- Field IDs (stable) ----
const COE = {table:'tblM62hRfWTmZWM6y', name:'fldW71asl0CYBmoTo', wk100:'fldKOGdC0wZqfDuiy', wk70:'fldvuSkFOY4yp6dUs',
             people:'fldUFFAf7b0AtmeJl'};
const ALLOC = {table:'tblqCfUqS0Uv9cAHY', coe:'fldQfjuOcQN3OEsqI', sub:'fldI3EvQkmFAnj6WN', acc:'fldokig5iBzBNFjyO', prog:'fld86ciaUU28ftWCS', imd:'fldeEJQsoSruTVgDD',
              status:'fld02CmuABiOFdxn9', start:'fldHTdQ6cubzChPtX', end:'fldfWCXetTTTqnr7h'};
const PROG = {table:'tblxbXHBPVWUeT0Ea', bu:'fldJmSYJeMYm9q4kb', test:'fldgr5Knddb8qNG0V', crit:'fldfW60SpnS5OCaD2',
              quarter:'fldqLH3o8sKQBpmAG', year:'fld5YsbzzS8KgeiEd', status:'fldQC3pDyuD69dvTN'};

const BU_ORDER = ['Mail','Finance','Search','Newsgroup','Sports','Brand','DSP','YAds','Fantasy'];
const WEEKS = 13;

// Status buckets, taken from the "Accepted & Submitted Capacity Planning" dashboard so
// the numbers here agree with it. Submitted = everything except Rejected; Accepted is
// the two approved statuses. Choice names are compared trimmed: "Rejected " carries a
// trailing space in the base.
// CoEs that are never real delivery capacity, so they are dropped from the team
// cards, the totals and the timeline alike. Names are compared trimmed: "Other "
// carries a trailing space in the base.
const EXCLUDED_COES = new Set(['Vendor / Agency','Other','O&O']);
const norm = n => String(n||'').trim().toLowerCase().replace(/\s+/g,' ');
const isExcludedCoE = n => !n || [...EXCLUDED_COES].some(x=>norm(x)===norm(n));

// Teams that exist and can be switched on, but are off when the page opens.
// Matched on a normalised name because several carry trailing spaces in the base.
const DEFAULT_OFF_COES = ['ASO','APAC Marketing','Brand & Marketing Research',
                          'Global Business & Experience (Operations)','Marketing Partnerships',
                          'Integrated B2B Marketing'];
const isOffByDefault = n => DEFAULT_OFF_COES.some(x=>norm(x)===norm(n));

// Planning always opens on Q4 of the current year; other quarters are one click away.
const PLANNING_QUARTER = 'Q4';

// Admin > People. The base's own formula fields link as /{base}/{pageId}/{recordId},
// so a person's row opens directly rather than landing on an unfiltered list.
const PEOPLE_PAGE = 'https://airtable.com/appE8STdMZa2kq9eb/paggbWfwyVaiQu6LH';
const personUrl = id => PEOPLE_PAGE + '/' + id;

// Programme record page, same link shape the base's own formula fields use.
const PROGRAM_PAGE = 'https://airtable.com/appE8STdMZa2kq9eb/pagjsGM6hsHBlNbuk';
const programUrl = id => PROGRAM_PAGE + '/' + id;

const ACCEPTED_STATUSES = new Set(['Approved to Submit Brief','Accepted - Capacity Planning']);
const REJECTED_STATUS = 'Rejected';

// "Accepted & Submitted Capacity Planning" in the Marketing Operations interface.
// The query string carries that page's own status filters, so the link lands on the
// same view rather than an unfiltered one. /edit is deliberately left off so the
// link opens the page normally instead of in the editor.
const CAPACITY_PAGE_URL = 'https://airtable.com/appE8STdMZa2kq9eb/pagTD4p2yXFwccD9T'
  + '?csiYu=b%3AWzAsWyJGZHhuOSIsNixbInNlbHM2TlNPRXRPY3VkRzVSIiwic2VsRzVFc1FnTkM4SzUzMkIiXSwiV2ZzSkUiXV0'
  + '&9EabC=b%3AWzAsWyJGZHhuOSIsNixbInNlbHk4MHJmYUxDUmdEbTZWIiwic2VsdVNnY3d3Z2NNSXN3NTIiLCJzZWw1NkVjbFdxWktJcUlTWiIsInNlbFhNMk1lZDZaMElyU2t3Iiwic2VsRzVFc1FnTkM4SzUzMkIiLCJzZWxzNk5TT0V0T2N1ZEc1UiJdLCJLUkpWViJdXQ';

loadCSSFromString(`
  .cap * { box-sizing:border-box; }
  .cap { --purple:#5b3df5; --purple-soft:#efeaff; --ink:#1e1b30; --muted:#6b6880; --line:#e7e3f5; --bg:#f6f5fb; --card:#fff;
    --green:#1f9d55; --green-bg:#e5f6ec; --amber:#c98a00; --amber-bg:#fdf3dd; --red:#d13c3c; --red-bg:#fbe7e7;
    position:absolute; inset:0; overflow:auto; background:var(--bg); color:var(--ink);
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; padding:24px; }
  .cap h1 { font-size:24px; margin:0 0 14px; letter-spacing:-.5px; }
  .cap .controls { display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin:0 0 20px; }
  .cap select, .cap button { font:inherit; border:1px solid var(--line); background:#fff; border-radius:9px; padding:7px 11px; color:var(--ink); cursor:pointer; }
  .cap .btn-pair { display:inline-flex; }
  .cap .btn-pair button { border-radius:0; }
  .cap .btn-pair button:first-child { border-radius:9px 0 0 9px; }
  .cap .btn-pair button:last-child { border-radius:0 9px 9px 0; margin-left:-1px; }
  .cap .btn-pair button:disabled { opacity:.45; cursor:default; }
  .cap .dd { position:relative; }
  .cap .dd-toggle { display:inline-flex; align-items:center; gap:8px; max-width:440px; font-size:14px;
    padding:10px 14px; border-radius:10px; }
  .cap .dd-toggle b { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .cap .dd-lab { color:var(--muted); font-size:12.5px; }
  .cap .dd-caret { color:var(--muted); font-size:11px; margin-left:auto; }
  .cap .panel-search { width:100%; font:inherit; font-size:13.5px; padding:8px 10px; margin:0 0 8px;
    border:1px solid var(--line); border-radius:8px; background:#fff; color:var(--ink); }
  .cap .panel-empty { padding:10px 8px; font-size:12.5px; color:var(--muted); }
  .cap .panel { position:absolute; z-index:20; top:calc(100% + 4px); left:0; background:#fff; border:1px solid var(--line);
    border-radius:12px; box-shadow:0 10px 30px rgba(40,30,90,.16); padding:10px; min-width:310px; max-height:420px; overflow:auto; }
  .cap .panel label { display:flex; align-items:center; gap:9px; padding:8px 9px; border-radius:7px; font-size:13.5px; cursor:pointer; }
  .cap .panel label:hover { background:var(--purple-soft); }
  .cap .panel-actions { display:flex; gap:6px; padding:2px 2px 8px; margin-bottom:6px; border-bottom:1px solid var(--line); }
  .cap .panel-actions button { flex:1; padding:5px 8px; font-size:12px; border-radius:7px; }
  .cap .panel-actions button:disabled { opacity:.4; cursor:default; }
  .cap .kpis { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin:0 0 24px; }
  .cap .kpi { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:15px 17px; }
  .cap .kpi .n { font-size:26px; font-weight:700; letter-spacing:-1px; }
  .cap .kpi .n small { font-size:13px; font-weight:600; color:var(--muted); }
  .cap .kpi .l { font-size:12px; color:var(--muted); margin-top:2px; }
  .cap .st { font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:.8px; color:var(--purple); margin:26px 0 12px; }
  .cap .st-toggle { display:flex; align-items:center; gap:10px; background:transparent; border:none;
    padding:0; border-radius:0; cursor:pointer; text-align:left; }
  .cap .st-toggle:hover { color:var(--purple); }
  .cap table { width:100%; border-collapse:separate; border-spacing:0; background:#fff; border:1px solid var(--line); border-radius:14px; overflow:hidden; font-size:13.5px; }
  .cap th, .cap td { padding:11px 14px; text-align:left; border-bottom:1px solid var(--line); }
  .cap th { background:var(--purple-soft); color:#3a2f74; font-weight:600; font-size:12px; text-transform:uppercase; letter-spacing:.4px; }
  .cap td.num, .cap th.num { text-align:right; font-variant-numeric:tabular-nums; }
  .cap tr:last-child td { border-bottom:none; }
  .cap tr.total td { background:#faf9ff; font-weight:700; }
  .cap .grid { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; align-items:start; }
  .cap .team { background:var(--card); border:1px solid var(--line); border-radius:16px; overflow:hidden; }
  .cap .team .top { padding:14px 16px 12px; }
  .cap .tname { font-size:15px; font-weight:700; margin:0 0 6px; min-height:20px; }
  .cap .thead { width:100%; display:flex; align-items:center; gap:10px; background:transparent; border:none;
    padding:0; margin:0 0 6px; text-align:left; cursor:pointer; border-radius:0; }
  .cap .thead .tname { margin:0; min-height:0; }
  .cap .thead:hover .tname { color:var(--purple); }
  .cap .thead-r { margin-left:auto; display:inline-flex; align-items:center; gap:9px; }
  .cap .thead-pct { font-size:14px; font-weight:800; font-variant-numeric:tabular-nums; letter-spacing:-.3px; }
  .cap .tcaret { display:inline-flex; align-items:center; justify-content:center; width:26px; height:26px;
    border-radius:50%; background:var(--purple-soft); color:var(--purple); font-size:15px; font-weight:700;
    line-height:1; flex:none; }
  .cap .thead:hover .tcaret { background:var(--purple); color:#fff; }
  .cap .team.collapsed .top { padding-bottom:14px; }
  .cap .prow { display:flex; align-items:center; gap:10px; margin:0 0 12px; }
  .cap .pcount { border:1px solid var(--line); background:transparent; border-radius:20px; padding:3px 10px;
    font-size:11.5px; font-weight:600; color:var(--muted); display:inline-flex; align-items:center; gap:5px; }
  .cap .pcount:hover { background:var(--purple-soft); color:var(--purple); }
  .cap .pgo { font-size:11.5px; color:var(--purple); text-decoration:none; font-weight:600; }
  .cap .pgo:hover { text-decoration:underline; }
  .cap .plist { list-style:none; margin:0 0 12px; padding:8px 10px; background:var(--bg); border:1px solid var(--line);
    border-radius:10px; display:grid; gap:2px; max-height:190px; overflow:auto; }
  .cap .plist li { font-size:12.5px; }
  .cap .plist a { color:var(--ink); text-decoration:none; display:block; padding:3px 5px; border-radius:5px; }
  .cap .plist a:hover { background:var(--purple-soft); color:var(--purple); }
  .cap .pnone { font-size:12px; color:var(--muted); margin:0 0 12px; }
  .cap .urow { display:flex; align-items:baseline; justify-content:space-between; gap:10px; }
  .cap .ubig { font-size:32px; font-weight:800; letter-spacing:-1.5px; line-height:1; }
  .cap .ucap { font-size:12px; color:var(--muted); margin-top:2px; }
  .cap .wk { margin:12px 0 2px; }
  .cap .wk-bars { position:relative; display:flex; align-items:flex-end; gap:3px; height:56px;
    border-bottom:1px solid var(--line); }
  .cap .wk-bars::after { content:''; position:absolute; left:0; right:0; top:var(--thr);
    border-top:1px dashed var(--ink); opacity:.4; pointer-events:none; }
  .cap .wk-b { flex:1; display:flex; align-items:flex-end; height:100%; cursor:default; }
  .cap .wk-b > i { display:block; width:100%; border-radius:3px 3px 0 0; background:var(--muted); }
  .cap .wk-b > i.green { background:var(--green); } .cap .wk-b > i.amber { background:var(--amber); }
  .cap .wk-b > i.red { background:var(--red); } .cap .wk-b > i.grey { background:#ccc; }
  .cap .wk-b.pk > i { outline:2px solid var(--ink); outline-offset:1px; }
  .cap .wk-ax { display:flex; gap:3px; margin-top:5px; }
  .cap .wk-ax span { flex:1; font-size:9.5px; color:var(--muted); white-space:nowrap; }
  .cap .wk-read { font-size:11.5px; color:var(--ink); margin:0 0 6px; min-height:16px; }
  .cap .wk-read b { font-variant-numeric:tabular-nums; }
  .cap .wk-wk { display:inline-block; background:var(--purple-soft); color:var(--purple); font-weight:700;
    border-radius:5px; padding:1px 7px; margin-right:7px; font-size:11px; }
  .cap .wk-h { color:var(--muted); }
  .cap .wk-pin { color:var(--purple); font-weight:600; }
  .cap .wk-b:hover > i { filter:brightness(1.12); }
  .cap .wk-b.pinned > i { outline:2px solid var(--purple); outline-offset:1px; }
  .cap .bar { height:8px; border-radius:6px; background:#eee; margin:12px 0 4px; overflow:hidden; position:relative; }
  .cap .bar > i { display:block; height:100%; border-radius:6px; }
  .cap .bar .tgt { position:absolute; top:-3px; bottom:-3px; width:2px; background:#3a2f74; opacity:.55; left:70%; }
  .cap .metrics { display:grid; grid-template-columns:1fr 1fr; gap:1px; background:var(--line); border-top:1px solid var(--line); }
  .cap .metrics div { background:#fff; padding:10px 14px; }
  .cap .metrics .k { font-size:11px; color:var(--muted); }
  .cap .metrics .v { font-size:16px; font-weight:700; font-variant-numeric:tabular-nums; margin-top:1px; }
  .cap .metrics .v small { font-size:11px; font-weight:500; color:var(--muted); }
  .cap .tag { display:inline-block; font-size:10.5px; font-weight:700; padding:2px 8px; border-radius:20px; text-transform:uppercase; letter-spacing:.4px; }
  .cap .t-green{background:var(--green-bg);color:var(--green);} .cap .t-amber{background:var(--amber-bg);color:var(--amber);}
  .cap .t-red{background:var(--red-bg);color:var(--red);} .cap .t-grey{background:#eee;color:#777;}
  .cap .ext { margin-left:auto; font-size:13px; text-decoration:none; display:inline-flex; align-items:center; gap:6px;
    border:1px solid var(--line); background:#fff; border-radius:9px; padding:7px 12px; color:var(--purple); font-weight:600; }
  .cap .ext:hover { background:var(--purple-soft); }
  .cap .ctx { font-size:12px; color:var(--muted); margin:-6px 0 14px; }
  .cap .ctx b { color:var(--ink); }
  .cap .ctx .warn { color:var(--amber); }
  .cap .chips { display:flex; flex-wrap:wrap; gap:8px; margin:0 0 14px; }
  .cap .chip { font-size:12px; color:var(--muted); background:var(--card); border:1px solid var(--line);
    border-radius:20px; padding:5px 11px; }
  .cap .chip b { color:var(--ink); font-variant-numeric:tabular-nums; }
  .cap a.plain { color:var(--purple); text-decoration:none; font-weight:600; }
  .cap a.plain:hover { text-decoration:underline; }
  @media (prefers-color-scheme: dark){ .cap{ --ink:#e6e3f5; --muted:#a29fbd; --line:#33304a; --bg:#15131f; --card:#1e1b2e; --purple-soft:#241f3d; } }
  @media(max-width:980px){ .cap .grid{grid-template-columns:repeat(2,1fr);} .cap .kpis{grid-template-columns:repeat(2,1fr);} }
  @media(max-width:640px){ .cap .grid{grid-template-columns:1fr;} }
`);

const fmt = n => (Math.round((n||0)*10)/10).toLocaleString(undefined,{maximumFractionDigits:1});
const pct = n => (isFinite(n)?Math.round(n*100):0);
// Utilisation is measured against FULL capacity, so the 30% unplanned reserve is
// applied once — here, by the 0.70 threshold — and not a second time in the
// denominator. Red therefore fires exactly when a team has consumed its usable
// (70%) allowance and starts eating the buffer.
const band = v => v>0.70?'red':(v>=0.50?'amber':'green');
const BC = {green:'var(--green)',amber:'var(--amber)',red:'var(--red)'};

function firstLink(cell){ return (cell && cell[0]) ? cell[0] : null; }
const UNASSIGNED = 'No quarter set';

// "2026-05-11" → {q:'Q2', y:'2026'}
function quarterOf(dateStr){
  if(!dateStr) return null;
  const s = String(dateStr);
  const m = parseInt(s.slice(5,7),10);
  if(!m) return null;
  return {q:'Q'+Math.ceil(m/3), y:s.slice(0,4)};
}
function lookupDate(cell){
  // multipleLookupValues → [{value}] or ["2026-05-11"]; value can itself be an array
  if(!cell || !cell.length) return null;
  let v = cell[0];
  if(v && typeof v==='object' && !Array.isArray(v)) v = v.value;
  if(Array.isArray(v)) v = v[0];
  return v ?? null;
}
// The key the filter matches on: 'Q4 2026' when the year is known, 'Q4' when it
// isn't. Bucketing on a bare 'Q4' merged Q4 2026 with any other year's Q4.
function qKey(q, y){ return q ? (y ? q+' '+y : q) : UNASSIGNED; }
// Demand is placed by when the work is actually scheduled, not by the quarter its
// programme is tagged to. The two disagree badly: programmes tagged Q4 routinely
// have work running in Q3, or in Q1 of the following year. Hours are spread evenly
// across the Mondays between Est. Work Start and End — the same method the native
// capacity page uses — and only the weeks landing inside the selection are counted.
const MONDAY_MS = 7*86400000;
function parseDate(v){
  if(!v) return null;
  const t = String(v);
  const ms = Date.parse(t.length<=10 ? t+'T00:00:00Z' : t);
  return isFinite(ms) ? ms : null;
}
function mondayOf(ms){
  const d = new Date(ms);
  const back = (d.getUTCDay()+6)%7;           // Monday = 0
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()-back);
}
function weeksBetween(s, e){
  const out = [];
  for(let w = mondayOf(s); w <= e && out.length < 520; w += MONDAY_MS) out.push(w);
  return out;
}
// "Q4 2026" -> the first and last instant of that quarter.
function qBounds(k){
  const m = /^Q([1-4]) (\d{4})$/.exec(k);
  if(!m) return null;
  const q = +m[1], y = +m[2];
  return [Date.UTC(y,(q-1)*3,1), Date.UTC(y,q*3,0)];
}

const wkLabel = ms => new Date(ms).toLocaleDateString(undefined,{day:'numeric',month:'short',timeZone:'UTC'});
// "9 – 15 Nov", or "30 Nov – 6 Dec" when the week straddles a month.
const wkRange = ms => {
  const a = new Date(ms), b = new Date(ms + 6*86400000);
  const dayA = a.getUTCDate(), dayB = b.getUTCDate();
  const monA = a.toLocaleDateString(undefined,{month:'short',timeZone:'UTC'});
  const monB = b.toLocaleDateString(undefined,{month:'short',timeZone:'UTC'});
  return monA===monB ? dayA+'–'+dayB+' '+monB : dayA+' '+monA+' – '+dayB+' '+monB;
};

function qSortValue(k){
  if(k===UNASSIGNED) return Infinity;
  const m = /^Q([1-4])(?: (\d{4}))?$/.exec(k);
  if(!m) return Infinity;
  return (m[2] ? parseInt(m[2],10) : 0)*10 + parseInt(m[1],10);
}
function lookupText(cell){
  if(cell==null) return null;
  if(Array.isArray(cell)){
    if(!cell.length) return null;
    let v = cell[0];
    if(v && typeof v==='object') v = v.value ?? v.name ?? null;
    return v==null ? null : String(v).trim();
  }
  if(typeof cell==='object') return (cell.name ?? cell.value ?? null);
  return String(cell).trim();
}

// One card's weekly load. Hovering reads a week out; clicking pins it as the
// card's headline figure so it can be compared against other teams.
function WeekChart({weeks, series, capWk, noCap, activeIdx, pinned, onPick, scale}){
  const [hov, setHov] = useState(null);
  const show = hov!=null ? hov : activeIdx;
  const uu = i => (noCap || !capWk) ? 0 : series[i]/capWk;
  return (
    <div className="wk">
      <div className="wk-read">
        {show!=null && series.length
          ? <><span className="wk-wk">{wkRange(weeks[show])}</span>
              <b>{noCap?'—':pct(uu(show))+'%'}</b>
              <span className="wk-h"> · {fmt(series[show])} hrs</span>
              {pinned!=null && hov==null && <span className="wk-pin"> pinned</span>}</>
          : <span className="wk-h">Hover a week to read it · click to pin</span>}
      </div>
      <div className="wk-bars" style={{'--thr': (100-(0.70/scale)*100)+'%'}}>
        {series.map((h,i)=>(
          <span key={weeks[i]}
            className={'wk-b'+(i===activeIdx?' pk':'')+(i===pinned?' pinned':'')}
            onMouseEnter={()=>setHov(i)} onMouseLeave={()=>setHov(null)}
            onClick={()=>onPick(i)}
            title={wkRange(weeks[i])+' — '+(noCap?'no capacity set':pct(uu(i))+'% · '+fmt(series[i])+' hrs')}>
            <i className={noCap?'grey':band(uu(i))}
               style={{height: uu(i)>0 ? Math.max(3,(uu(i)/scale)*100)+'%' : '0'}}/>
          </span>
        ))}
      </div>
      <div className="wk-ax">
        {weeks.map((w,i)=>{
          const dt = new Date(w);
          const newMonth = i===0 || new Date(weeks[i-1]).getUTCMonth()!==dt.getUTCMonth();
          return <span key={w}>{newMonth ? dt.toLocaleDateString(undefined,{month:'short',timeZone:'UTC'}) : ''}</span>;
        })}
      </div>
    </div>
  );
}

function Dropdown({label, options, selected, onToggle, onSetAll, onReset}){
  const [open,setOpen]=useState(false);
  const [q,setQ]=useState('');
  // Name what's actually selected rather than counting it. Falls back to a count
  // only once the list would be too long to read at a glance.
  const picked = options.filter(o=>selected.has(o));
  const lbl = picked.length===0 ? 'none'
            : picked.length===options.length ? 'All'
            : picked.length<=2 ? picked.join(', ')
            : picked.length+' of '+options.length;
  const needle = q.trim().toLowerCase();
  const visible = needle ? options.filter(o=>o.toLowerCase().includes(needle)) : options;
  const close = ()=>{ setOpen(false); setQ(''); };
  return (
    <div className="dd">
      <button className="dd-toggle" onClick={()=>setOpen(o=>!o)}>
        <span className="dd-lab">{label}</span><b>{lbl}</b><span className="dd-caret">▾</span>
      </button>
      {open && <>
        <div style={{position:'fixed',inset:0,zIndex:10}} onClick={close}/>
        <div className="panel">
          <input className="panel-search" autoFocus value={q}
            placeholder={'Search '+label.toLowerCase()+'…'}
            onChange={e=>setQ(e.target.value)}/>
          {/* Never disabled: a greyed-out Clear reads as a broken button. */}
          <div className="panel-actions">
            <button type="button" onClick={()=>onSetAll(new Set(options))}>Select all</button>
            <button type="button" onClick={()=>onSetAll(new Set())}>Clear</button>
            {onReset && <button type="button" onClick={onReset}>Reset</button>}
          </div>
          {visible.length===0
            ? <div className="panel-empty">No matches for “{q.trim()}”</div>
            : visible.map(o=>(
                <label key={o}>
                  <input type="checkbox" checked={selected.has(o)} onChange={()=>onToggle(o)}/> {o}
                </label>
              ))}
        </div>
      </>}
    </div>
  );
}


function App(){
  const base = useBase();
  const coeTable = base.getTableByIdIfExists(COE.table);
  const allocTable = base.getTableByIdIfExists(ALLOC.table);
  const progTable = base.getTableByIdIfExists(PROG.table);

  // Must run before any useRecords call: useRecords() does not accept a null table,
  // so an unexposed table would crash rather than show the message below.
  const missing = [
    !coeTable && 'CoE',
    !allocTable && 'Program CoE Allocation',
    !progTable && 'Programs',
  ].filter(Boolean);

  if(missing.length){
    return <div className="cap"><h1>Capacity Overview</h1>
      <p style={{color:'var(--muted)'}}>Add {missing.join(', ')} as {missing.length>1?'data sources':'a data source'} on this interface page, with the fields referenced in the code visible.</p></div>;
  }

  // Fields must be preflighted too: getCellValue() resolves the field first and
  // throws if the interface hasn't exposed it, which would crash rather than report.
  const REQUIRED_FIELDS = [
    [coeTable, 'CoE', [[COE.name,'Name'],[COE.wk100,'Working hrs/wk'],[COE.wk70,'Usable hrs/wk (70%)']]],
    [allocTable, 'Program CoE Allocation', [[ALLOC.coe,'CoE link'],[ALLOC.sub,'Submitted hours'],[ALLOC.acc,'Accepted hours'],[ALLOC.prog,'Program link'],[ALLOC.imd,'In-market date']]],
    [progTable, 'Programs', [[PROG.bu,'Owning Business Unit'],[PROG.test,'Testing Programs'],[PROG.crit,'Is this Business Critical?']]],
  ];
  const missingFields = [];
  REQUIRED_FIELDS.forEach(([t, tableName, fields]) => {
    fields.forEach(([id, label]) => {
      if(!t.getFieldByIdIfExists(id)) missingFields.push(tableName + ' \u2192 ' + label);
    });
  });

  if(missingFields.length){
    return <div className="cap"><h1>Capacity Overview</h1>
      <p style={{color:'var(--muted)'}}>These fields aren't visible to the extension yet. Turn them on in the element's <b>Fields</b> setting for each table:</p>
      <ul style={{color:'var(--muted)',lineHeight:1.7}}>
        {missingFields.map(f => <li key={f}>{f}</li>)}
      </ul></div>;
  }

  return <Dashboard coeTable={coeTable} allocTable={allocTable} progTable={progTable}/>;
}

function Dashboard({coeTable, allocTable, progTable}){
  const coeRecords = useRecords(coeTable);
  const allocRecords = useRecords(allocTable);
  const progRecords = useRecords(progTable);

  const [sortMode, setSortMode] = useState('az');
  const [view, setView] = useState('quarter');   // 'quarter' = average across the quarter, 'weekly' = worst week

  // Capacity is a roll-up of the team's people, so the headcount behind a number is
  // part of reading it. Names come off the link field itself — People does not need
  // to be added as a separate data source.
  const hasPeople = !!coeTable.getFieldByIdIfExists(COE.people);

  const teams = useMemo(()=>{
    if(!coeRecords) return [];
    return coeRecords.map(r=>({
      n: r.getCellValueAsString(COE.name).trim(),
      wk100: Number(r.getCellValue(COE.wk100))||0,
      wk70: Number(r.getCellValue(COE.wk70))||0,
      people: hasPeople
        ? (r.getCellValue(COE.people)||[]).map(x=>({id:x.id, name:x.name}))
            .sort((a,b)=>String(a.name).localeCompare(String(b.name)))
        : null,
    })).filter(t=>t.n && !isExcludedCoE(t.n));
  },[coeRecords, hasPeople]);

  // Which team cards have their people list open, and which are collapsed to a
  // single header row so a long list of teams stays scannable.
  const [openTeams, setOpenTeams] = useState(()=>new Set());
  const [collapsed, setCollapsed] = useState(()=>new Set());
  // A week pinned on a card overrides whichever figure the view would otherwise show.
  const [pinnedWk, setPinnedWk] = useState(()=>new Map());
  const pickWeek = (team,i) => setPinnedWk(prev=>{
    const next = new Map(prev);
    next.get(team)===i ? next.delete(team) : next.set(team,i);
    return next;
  });
  // Section-level open/closed, so a long page can be folded down to the part in use.
  const [openSections, setOpenSections] = useState(()=>({bu:true, teams:true, nodate:true}));
  const toggleSection = k => setOpenSections(o=>({...o, [k]:!o[k]}));
  const toggleCollapse = n => setCollapsed(prev=>{
    const next = new Set(prev);
    next.has(n) ? next.delete(n) : next.add(n);
    return next;
  });
  const toggleTeam = n => setOpenTeams(prev=>{
    const next = new Set(prev);
    next.has(n) ? next.delete(n) : next.add(n);
    return next;
  });

  const [selT, setSelT] = useState(null);
  const teamNames = useMemo(()=>teams.map(t=>t.n).sort(),[teams]);
  // Everything except the teams that are off by default; null means "untouched",
  // so Reset drops back to this rather than to all-selected.
  const defaultTeams = useMemo(()=>new Set(teamNames.filter(n=>!isOffByDefault(n))),[teamNames]);
  const selTeams = selT ?? defaultTeams;

  // Programs carries the quarter people actually set (a single-select), and it is
  // populated far more reliably than In Market Start Date — most programs have no
  // date at all, so deriving the quarter from the date dropped them from every
  // bucket. Use the select when it's exposed; fall back to the date otherwise.
  const hasQuarterField = !!progTable.getFieldByIdIfExists(PROG.quarter);
  const hasYearField = !!progTable.getFieldByIdIfExists(PROG.year);
  // Status is optional: the dashboard still works without it,
  // so they are feature-detected rather than added to the hard preflight.
  // Status can come from either end. Programs holds the real single-select; the
  // allocation carries a lookup of it. Either will do, so only warn when neither
  // is exposed — at that point rejected programs genuinely cannot be identified.
  const hasDates = !!allocTable.getFieldByIdIfExists(ALLOC.start)
                && !!allocTable.getFieldByIdIfExists(ALLOC.end);
  const hasProgStatus = !!progTable.getFieldByIdIfExists(PROG.status);
  const hasAllocStatus = !!allocTable.getFieldByIdIfExists(ALLOC.status);
  const hasStatusField = hasProgStatus || hasAllocStatus;

  // program → {bu, test, crit, q, y}
  const progMap = useMemo(()=>{
    const m = new Map();
    (progRecords||[]).forEach(r=>{
      const buLink = firstLink(r.getCellValue(PROG.bu));
      const crit = r.getCellValue(PROG.crit);
      const qSel = hasQuarterField ? r.getCellValue(PROG.quarter) : null;
      const ySel = hasYearField ? r.getCellValue(PROG.year) : null;
      const stSel = hasProgStatus ? r.getCellValue(PROG.status) : null;
      m.set(r.id, {
        bu: buLink ? buLink.name : 'Unassigned',
        test: r.getCellValue(PROG.test)===true,
        crit: !!(crit && crit.name && crit.name.toUpperCase()==='YES'),
        q: (qSel && qSel.name) ? String(qSel.name).trim() : null,
        y: (ySel && ySel.name) ? String(ySel.name).trim() : null,
        st: (stSel && stSel.name) ? String(stSel.name).trim() : null,
      });
    });
    return m;
  },[progRecords, hasQuarterField, hasYearField, hasProgStatus]);

  // allocations → normalized rows
  const rows = useMemo(()=>{
    return (allocRecords||[]).map(r=>{
      const coe = firstLink(r.getCellValue(ALLOC.coe));
      const prog = firstLink(r.getCellValue(ALLOC.prog));
      const pm = prog ? progMap.get(prog.id) : null;
      const fromDate = quarterOf(lookupDate(r.getCellValue(ALLOC.imd)));
      // Never mix sources: if the program names a quarter, its year comes from the
      // program too, otherwise both come from the in-market date.
      let q = null, y = null;
      if(pm && pm.q){ q = pm.q; y = pm.y; }
      else if(fromDate){ q = fromDate.q; y = fromDate.y; }
      // Prefer the program's own status; fall back to the allocation's lookup of it.
      const st = (pm && pm.st) ? pm.st
               : (hasAllocStatus ? lookupText(r.getCellValue(ALLOC.status)) : null);
      return {
        id: r.id,
        pid: prog ? prog.id : null,
        pname: prog ? prog.name : '(no program)',
        coe: coe ? String(coe.name).trim() : null,
        sub: Number(r.getCellValue(ALLOC.sub))||0,
        acc: Number(r.getCellValue(ALLOC.acc))||0,
        qk: qKey(q, y),
        bu: pm ? pm.bu : 'Unassigned',
        crit: pm ? pm.crit : false,
        test: pm ? pm.test : false,
        st,
        // Both false when Program Status isn't exposed, so every total keeps its
        // previous unfiltered behaviour rather than silently dropping to zero.
        isAccepted: st ? ACCEPTED_STATUSES.has(st) : false,
        isRejected: st ? st === REJECTED_STATUS : false,
        s: hasDates ? parseDate(r.getCellValue(ALLOC.start)) : null,
        e: hasDates ? parseDate(r.getCellValue(ALLOC.end)) : null,
      };
    }).filter(x=>x.coe && !x.test && !isExcludedCoE(x.coe));
  },[allocRecords, progMap, hasAllocStatus, hasDates]);

  // Options come from the data rather than a fixed Q1–Q4 list, so the dropdown
  // only offers quarters that work is actually scheduled in, and shows the year.
  const quarterOptions = useMemo(()=>{
    const s = new Set(rows.map(x=>x.qk));
    // Programs are included as well: almost none of them have allocation rows yet,
    // so options built from allocations alone offered barely any quarters.
    progMap.forEach(pm=>{ if(!pm.test) s.add(qKey(pm.q, pm.y)); });
    return [...s].sort((a,b)=>(qSortValue(a)-qSortValue(b)) || a.localeCompare(b));
  },[rows, progMap]);

  const [selQRaw, setSelQ] = useState(null);
  // Open on the quarter being planned, with every other quarter one click away in
  // the dropdown. Falls back to showing everything when that quarter has no work
  // in it, so the page can never open on an empty selection.
  const defaultQ = useMemo(()=>{
    const q4 = qKey(PLANNING_QUARTER, String(new Date().getFullYear()));
    if(quarterOptions.includes(q4)) return new Set([q4]);
    // No Q4 for this year in the data — fall back to any Q4, else everything, so
    // the page never opens on an empty selection.
    const anyQ4 = quarterOptions.filter(k=>k.startsWith(PLANNING_QUARTER+' '));
    return new Set(anyQ4.length ? [anyQ4[anyQ4.length-1]] : quarterOptions);
  },[quarterOptions]);
  const selQ = selQRaw ?? defaultQ;

  // Capacity scales with how many real quarters are selected — "No quarter set"
  // is not a quarter and must not multiply anyone's capacity.
  const nQ = Math.max([...selQ].filter(k=>k!==UNASSIGNED).length,1);
  const inQ = k => selQ.has(k);
  // Bounds of every selected quarter, so a week can be tested against the selection.
  const selBounds = useMemo(()=>[...selQ].map(qBounds).filter(Boolean),[selQ]);

  // Hours from one allocation that land inside the selection. null = undateable.
  const hoursInSel = x => {
    if(!hasDates) return inQ(x.qk) ? x.sub : 0;     // no dates exposed: fall back to the tag
    if(x.s==null || x.e==null || x.e < x.s) return null;
    const weeks = weeksBetween(x.s, x.e);
    if(!weeks.length) return 0;
    const per = x.sub/weeks.length;
    let hit = 0;
    weeks.forEach(w=>{ if(selBounds.some(([a,b])=>w>=a && w<=b)) hit += per; });
    return hit;
  };

  // Every Monday inside the selected quarters, in order.
  const selWeeks = useMemo(()=>{
    const out = new Set();
    selBounds.forEach(([a,b])=>{
      for(let w = mondayOf(a); w <= b; w += MONDAY_MS) if(w >= a) out.add(w);
    });
    return [...out].sort((x,y)=>x-y);
  },[selBounds]);
  const selWeekSet = useMemo(()=>new Set(selWeeks),[selWeeks]);

  // team -> Monday -> hours. The same spreading as the quarter figure, kept per week
  // so a peak can be seen instead of averaged away.
  const weeklyByTeam = useMemo(()=>{
    const m = new Map();
    if(!hasDates) return m;
    rows.forEach(x=>{
      if(x.isRejected || x.s==null || x.e==null || x.e < x.s) return;
      const weeks = weeksBetween(x.s, x.e);
      if(!weeks.length) return;
      const per = x.sub/weeks.length;
      weeks.forEach(w=>{
        if(!selWeekSet.has(w)) return;
        const t = m.get(x.coe) || new Map();
        t.set(w, (t.get(w)||0) + per);
        m.set(x.coe, t);
      });
    });
    return m;
  },[rows, selWeekSet, hasDates]);

  // Work with no dates cannot be placed in any week, so it sits outside every figure
  // above. Listed rather than dropped, because it is real committed hours.
  const undated = useMemo(()=>{
    if(!hasDates) return null;
    const byProg = new Map(), byTeam = new Map();
    let total = 0;
    rows.forEach(x=>{
      if(x.isRejected || !selTeams.has(x.coe)) return;
      if(!(x.s==null || x.e==null || x.e < x.s)) return;
      total += x.sub;
      byTeam.set(x.coe, (byTeam.get(x.coe)||0) + x.sub);
      const k = x.pid || x.pname;
      const pr = byProg.get(k) || {id:x.pid, name:x.pname, hrs:0, teams:new Set()};
      pr.hrs += x.sub; pr.teams.add(x.coe); byProg.set(k, pr);
    });
    return {
      total,
      teams: [...byTeam.entries()].sort((a,b)=>b[1]-a[1]),
      progs: [...byProg.values()].sort((a,b)=>b.hrs-a.hrs),
    };
  },[rows, selTeams, hasDates]);

  const demandOf = name => rows.reduce((s,x)=>{
    if(x.coe!==name || x.isRejected) return s;
    return s + (hoursInSel(x) || 0);
  },0);


  // BU table (respects team + quarter filters)
  const buAgg = {}; BU_ORDER.forEach(b=>buAgg[b]={sub:0,acc:0,crit:0});
  rows.forEach(x=>{
    if(!selTeams.has(x.coe)) return;
    if(!buAgg[x.bu]) return; // Unassigned & others not shown
    if(x.isRejected) return;                       // Submitted = everything but Rejected
    const h = hoursInSel(x) || 0;                  // placed by date, like the cards
    buAgg[x.bu].sub += h;
    if(!hasStatusField || x.isAccepted) buAgg[x.bu].acc += x.acc;
    if(x.crit) buAgg[x.bu].crit += h;
  });
  const tot = {sub:0,acc:0,crit:0}; BU_ORDER.forEach(b=>{tot.sub+=buAgg[b].sub;tot.acc+=buAgg[b].acc;tot.crit+=buAgg[b].crit;});

  const shown = teams.filter(t=>selTeams.has(t.n));
  // Counted from Programs, not from allocations: the overwhelming majority of live
  // programs have no Program CoE Allocation rows yet, so an allocation-derived count
  // reported a handful instead of the real figure. Submitted means every status
  // except Rejected, matching the hours. The Teams filter deliberately does not
  // apply — a program spans several CoEs, so there is no one team it belongs to.
  const progInView = useMemo(()=>{
    let n = 0;
    progMap.forEach(pm=>{
      if(pm.test) return;
      if(pm.st === REJECTED_STATUS) return;
      if(inQ(qKey(pm.q, pm.y))) n++;
    });
    return n;
  },[progMap, selQ]);
  const totCap = shown.reduce((s,t)=>s+t.wk70*WEEKS*nQ,0);
  const totSub = shown.reduce((s,t)=>s+demandOf(t.n),0);

  let cards = teams.filter(t=>selTeams.has(t.n));
  const util = t => (t.wk100>0) ? demandOf(t.n)/(t.wk100*WEEKS*nQ) : (demandOf(t.n)>0?9:0);
  if(sortMode==='az') cards.sort((a,b)=>a.n.localeCompare(b.n));
  else if(sortMode==='za') cards.sort((a,b)=>b.n.localeCompare(a.n));
  else cards.sort((a,b)=>util(b)-util(a));

  return (
    <div className="cap">
      <h1>Capacity Overview</h1>
      <div className="controls">
        <Dropdown label="Quarters" options={quarterOptions} selected={selQ}
          onToggle={q=>setSelQ(()=>{const n=new Set(selQ); n.has(q)?n.delete(q):n.add(q); return n;})}
          onSetAll={next=>setSelQ(next)} onReset={()=>setSelQ(null)}/>
        <Dropdown label="Teams" options={teamNames} selected={selTeams}
          onToggle={t=>setSelT(()=>{const n=new Set(selTeams); n.has(t)?n.delete(t):n.add(t); return n;})}
          onSetAll={next=>setSelT(next)} onReset={()=>setSelT(null)}/>
        <button onClick={()=>setSortMode(m=>m==='az'?'za':(m==='za'?'busy':'az'))}>
          Sort: {sortMode==='az'?'A→Z':(sortMode==='za'?'Z→A':'busiest')}</button>
        {hasDates && <div className="seg" title="Quarter shows the average across the whole quarter; Weekly shows the busiest single week">
          <button data-on={view==='quarter'?'1':'0'} onClick={()=>setView('quarter')}>Quarter average</button>
          <button data-on={view==='weekly'?'1':'0'} onClick={()=>setView('weekly')}>Busiest week</button>
        </div>}
        <div className="btn-pair">
          <button onClick={()=>setCollapsed(new Set(cards.map(t=>t.n)))}
            disabled={cards.length>0 && cards.every(t=>collapsed.has(t.n))}>Collapse all</button>
          <button onClick={()=>setCollapsed(new Set())}
            disabled={collapsed.size===0}>Expand all</button>
        </div>
        <a className="ext" href={CAPACITY_PAGE_URL} target="_blank" rel="noopener noreferrer">
          Accepted &amp; Submitted Capacity Planning ↗</a>
      </div>

      <div className="ctx">
        Showing <b>{selQ.size===0 ? 'no quarters' : [...selQ].sort((a,b)=>qSortValue(a)-qSortValue(b)).join(', ')}</b>
        {' · '}<b>{shown.length}</b> of {teams.length} teams
        {!hasQuarterField && <span className="warn">{' · '}Quarter isn't exposed on Programs — falling back to In Market Start Date</span>}
        {!hasStatusField && <span className="warn">{' · '}Turn on Program Status to exclude rejected programs</span>}
        {!hasDates && <span className="warn">{' · '}Est. Work Start/End aren't exposed — falling back to the quarter tag, which overstates</span>}
      </div>

      <div className="kpis">
        <div className="kpi"><div className="n">{progInView}</div><div className="l">Submitted programs</div></div>
        <div className="kpi"><div className="n">{shown.length}</div><div className="l">Teams shown</div></div>
        <div className="kpi"><div className="n">{fmt(totCap)} <small>hrs</small></div><div className="l">Usable capacity, selected quarter(s)</div></div>
        <div className="kpi"><div className="n">{fmt(totSub)} <small>hrs</small></div><div className="l">Submitted hours (selected)</div></div>
      </div>

      <button className="st st-toggle" onClick={()=>toggleSection('bu')}
        title={openSections.bu?'Collapse Business Units':'Expand Business Units'}>
        Business Units <span className="tcaret">{openSections.bu?'▾':'▸'}</span>
      </button>
      {openSections.bu && <table>
        <thead><tr><th>Business Unit</th><th className="num">Submitted hrs</th><th className="num">Accepted hrs</th><th className="num">Business-critical hrs</th></tr></thead>
        <tbody>
          {BU_ORDER.map(b=>(
            <tr key={b}><td><b>{b}</b></td>
              <td className="num">{fmt(buAgg[b].sub)}</td>
              <td className="num">{fmt(buAgg[b].acc)}</td>
              <td className="num">{fmt(buAgg[b].crit)}</td></tr>
          ))}
          <tr className="total"><td>Total</td><td className="num">{fmt(tot.sub)}</td><td className="num">{fmt(tot.acc)}</td><td className="num">{fmt(tot.crit)}</td></tr>
        </tbody>
      </table>}

      <button className="st st-toggle" onClick={()=>toggleSection('teams')}
        title={openSections.teams?'Collapse Team Capacity':'Expand Team Capacity'}>
        Team Capacity (per CoE) <span className="tcaret">{openSections.teams?'▾':'▸'}</span>
      </button>
      {openSections.teams && <div className="grid">
        {cards.map(t=>{
          const noCap=t.wk100===0, full=t.wk100*WEEKS*nQ, cap=t.wk70*WEEKS*nQ, d=demandOf(t.n);
          // Percentage and colour run off full capacity; "remaining" and the
          // reduction still measure against the 70% allowance, which is the
          // number a lead actually plans to.
          const series = selWeeks.map(w=>(weeklyByTeam.get(t.n)||new Map()).get(w)||0);
          const peakIdx = series.reduce((bi,v,i,arr)=>v>arr[bi]?i:bi, 0);
          const peakU = (noCap||!series.length) ? null : series[peakIdx]/t.wk100;
          const uQ = noCap? null : d/full;
          const wkScale = Math.max(1, peakU||0);   // chart tops out at 100%, or at the peak if it exceeds
          const pinIdx = pinnedWk.get(t.n);
          const activeIdx = (pinIdx!=null && pinIdx<series.length) ? pinIdx
                          : ((view==='weekly' && hasDates && series.length) ? peakIdx : null);
          const u = (activeIdx!=null && !noCap) ? series[activeIdx]/t.wk100 : uQ;
          const bnd = (u==null)?'grey':band(u);
          const rem = cap-d, red = d>cap? d-cap : 0;
          const tagCls = noCap?'t-grey':(bnd==='red'?'t-red':bnd==='amber'?'t-amber':'t-green');
          const tagTxt = noCap?'No capacity set':(bnd==='red'?'Over threshold':bnd==='amber'?'Approaching':'Healthy');
          const isCol = collapsed.has(t.n);
          return (
            <div className={'team'+(isCol?' collapsed':'')} key={t.n}>
              <div className="top">
                <button className="thead" onClick={()=>toggleCollapse(t.n)}
                  title={isCol?'Expand this team':'Collapse this team'}>
                  <span className="tname">{t.n}</span>
                  <span className="thead-r">
                    <span className="thead-pct" style={{color:noCap?'#aaa':BC[bnd]}}>{u==null?'—':pct(u)+'%'}</span>
                    <span className="tcaret">{isCol?'▸':'▾'}</span>
                  </span>
                </button>
                {!isCol && <>
                {t.people && <div className="prow">
                  <button className="pcount" onClick={()=>toggleTeam(t.n)}
                    title={t.people.length ? 'Show the people in this team' : 'No one is linked to this team'}>
                    {t.people.length} {t.people.length===1?'person':'people'}
                    <span>{openTeams.has(t.n)?'▾':'▸'}</span>
                  </button>
                  <a className="pgo" href={PEOPLE_PAGE} target="_blank" rel="noopener noreferrer">People ↗</a>
                </div>}
                {t.people && openTeams.has(t.n) && (
                  t.people.length
                    ? <ul className="plist">
                        {t.people.map(pp=>(
                          <li key={pp.id}>
                            <a href={personUrl(pp.id)} target="_blank" rel="noopener noreferrer">{pp.name}</a>
                          </li>
                        ))}
                      </ul>
                    : <div className="pnone">No people linked — that is why capacity is 0.</div>
                )}
                <div className="urow">
                  <div className="ubig" style={{color:noCap?'#aaa':BC[bnd]}}>{u==null?'—':pct(u)+'%'}</div>
                  <span className={'tag '+tagCls}>{tagTxt}</span>
                </div>
                <div className="ucap">
                  {activeIdx!=null
                    ? (pinIdx!=null ? 'Week of ' : 'Busiest week — ')+'w/c '+wkLabel(selWeeks[activeIdx])
                      +' · quarter average '+(uQ==null?'—':pct(uQ)+'%')
                    : (hasDates && !series.length ? 'No dated work in this selection'
                       : 'Average across the quarter ÷ full capacity')}
                </div>
                {hasDates && series.length>0 && <WeekChart
                  weeks={selWeeks} series={series} capWk={t.wk100} noCap={noCap}
                  activeIdx={activeIdx} pinned={pinIdx} scale={wkScale}
                  onPick={i=>pickWeek(t.n,i)}/>}
                </>}
              </div>
              {!isCol && <div className="metrics">
                <div><div className="k">Working hrs / quarter (100%)</div><div className="v">{fmt(t.wk100*WEEKS*nQ)}</div></div>
                <div><div className="k">Usable / quarter (70%)</div><div className="v">{fmt(cap)} <small>hrs</small></div></div>
                <div><div className="k">Submitted hrs</div><div className="v">{fmt(d)}</div></div>
                <div><div className="k">Hrs remaining</div><div className="v" style={{color:rem<0?'var(--red)':'inherit'}}>{fmt(rem)}</div></div>
                <div><div className="k">Reduction to hit 70%</div><div className="v" style={{color:red>0?'var(--red)':'var(--green)'}}>{red>0?fmt(red)+' hrs':'None'}</div></div>
                <div><div className="k">Working hrs / week</div><div className="v">{fmt(t.wk100)} <small>/ 70%: {fmt(t.wk70)}</small></div></div>
              </div>}
            </div>
          );
        })}
      </div>}

      {undated && undated.progs.length>0 && <>
        <button className="st st-toggle" onClick={()=>toggleSection('nodate')}
          title={openSections.nodate?'Collapse':'Expand'}>
          Missing work dates <span className="tcaret">{openSections.nodate?'▾':'▸'}</span>
        </button>
        {openSections.nodate && <>
          <div className="ctx">
            <b>{fmt(undated.total)} hrs</b> across <b>{undated.progs.length}</b> programme{undated.progs.length===1?'':'s'}
            {' '}have no Est. Work Start or End date, so they cannot be placed in a week and are
            counted nowhere above. Add dates and they appear.
          </div>
          <div className="chips">
            {undated.teams.map(([coe,h])=>(
              <span className="chip" key={coe}>{coe} <b>{fmt(h)}</b> hrs</span>
            ))}
          </div>
          <table>
            <thead><tr><th>Programme</th><th className="num">Hours</th><th>Teams waiting</th></tr></thead>
            <tbody>
              {undated.progs.map(pr=>(
                <tr key={pr.id||pr.name}>
                  <td>{pr.id
                    ? <a className="plain" href={programUrl(pr.id)} target="_blank" rel="noopener noreferrer">{pr.name} ↗</a>
                    : pr.name}</td>
                  <td className="num">{fmt(pr.hrs)}</td>
                  <td>{[...pr.teams].sort().join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>}
      </>}
    </div>
  );
}

initializeBlock({interface: () => <App />});
