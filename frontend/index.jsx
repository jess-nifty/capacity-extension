import {initializeBlock, useBase, useRecords, loadCSSFromString} from '@airtable/blocks/interface/ui';
import React, {useState, useMemo} from 'react';

/*
  Capacity Overview — Interface Extension
  Replicates the HTML capacity dashboard, reading live from the base.
  Tables + fields must be added as data sources on the interface page.
*/

// ---- Field IDs (stable) ----
const COE = {table:'tblM62hRfWTmZWM6y', name:'fldW71asl0CYBmoTo', wk100:'fldKOGdC0wZqfDuiy', wk70:'fldvuSkFOY4yp6dUs'};
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
const EXCLUDED_COES = new Set(['Vendor / Agency','Other']);
const isExcludedCoE = n => !n || EXCLUDED_COES.has(String(n).trim());

const ACCEPTED_STATUSES = new Set(['Approved to Submit Brief','Accepted - Capacity Planning']);
const REJECTED_STATUS = 'Rejected';
const MAX_BARS = 250;

loadCSSFromString(`
  .cap * { box-sizing:border-box; }
  .cap { --purple:#5b3df5; --purple-soft:#efeaff; --ink:#1e1b30; --muted:#6b6880; --line:#e7e3f5; --bg:#f6f5fb; --card:#fff;
    --green:#1f9d55; --green-bg:#e5f6ec; --amber:#c98a00; --amber-bg:#fdf3dd; --red:#d13c3c; --red-bg:#fbe7e7;
    position:absolute; inset:0; overflow:auto; background:var(--bg); color:var(--ink);
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; padding:24px; }
  .cap h1 { font-size:24px; margin:0 0 14px; letter-spacing:-.5px; }
  .cap .controls { display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin:0 0 20px; }
  .cap select, .cap button { font:inherit; border:1px solid var(--line); background:#fff; border-radius:9px; padding:7px 11px; color:var(--ink); cursor:pointer; }
  .cap .dd { position:relative; }
  .cap .panel { position:absolute; z-index:20; top:calc(100% + 4px); left:0; background:#fff; border:1px solid var(--line);
    border-radius:10px; box-shadow:0 8px 24px rgba(40,30,90,.14); padding:8px; min-width:230px; max-height:300px; overflow:auto; }
  .cap .panel label { display:flex; align-items:center; gap:8px; padding:6px 8px; border-radius:6px; font-size:13px; cursor:pointer; }
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
  .cap table { width:100%; border-collapse:separate; border-spacing:0; background:#fff; border:1px solid var(--line); border-radius:14px; overflow:hidden; font-size:13.5px; }
  .cap th, .cap td { padding:11px 14px; text-align:left; border-bottom:1px solid var(--line); }
  .cap th { background:var(--purple-soft); color:#3a2f74; font-weight:600; font-size:12px; text-transform:uppercase; letter-spacing:.4px; }
  .cap td.num, .cap th.num { text-align:right; font-variant-numeric:tabular-nums; }
  .cap tr:last-child td { border-bottom:none; }
  .cap tr.total td { background:#faf9ff; font-weight:700; }
  .cap .grid { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; }
  .cap .team { background:var(--card); border:1px solid var(--line); border-radius:16px; overflow:hidden; }
  .cap .team .top { padding:14px 16px 12px; }
  .cap .tname { font-size:15px; font-weight:700; margin:0 0 12px; min-height:20px; }
  .cap .urow { display:flex; align-items:baseline; justify-content:space-between; gap:10px; }
  .cap .ubig { font-size:32px; font-weight:800; letter-spacing:-1.5px; line-height:1; }
  .cap .ucap { font-size:12px; color:var(--muted); margin-top:2px; }
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
  .cap .ctx { font-size:12px; color:var(--muted); margin:-6px 0 14px; }
  .cap .ctx b { color:var(--ink); }
  .cap .ctx .warn { color:var(--amber); }
  .cap .tl { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:15px 17px 18px; --lane:190px; }
  .cap .tl-head { display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin:0 0 14px; }
  .cap .seg { display:inline-flex; border:1px solid var(--line); border-radius:9px; overflow:hidden; }
  .cap .seg button { border:none; border-radius:0; padding:6px 13px; font-size:12.5px; background:transparent; }
  .cap .seg button + button { border-left:1px solid var(--line); }
  .cap .seg button[data-on="1"] { background:var(--purple); color:#fff; }
  .cap .tl-note { font-size:12px; color:var(--muted); }
  .cap .tl-scroll { overflow-x:auto; }
  .cap .tl-grid { min-width:660px; }
  .cap .tl-axis { position:relative; height:18px; margin-left:var(--lane); border-bottom:1px solid var(--line); }
  .cap .tl-axis span { position:absolute; top:0; font-size:10.5px; color:var(--muted); transform:translateX(-50%); white-space:nowrap; }
  .cap .tl-coe { display:flex; align-items:baseline; gap:8px; font-size:11px; font-weight:700; text-transform:uppercase;
    letter-spacing:.5px; color:var(--purple); margin:16px 0 5px; }
  .cap .tl-coe i { font-style:normal; font-weight:600; color:var(--muted); letter-spacing:0; text-transform:none; font-size:11px; }
  .cap .tl-row { display:grid; grid-template-columns:var(--lane) 1fr; align-items:center; min-height:24px; }
  .cap .tl-lbl { font-size:12px; padding-right:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .cap .tl-track { position:relative; height:18px; }
  .cap .tl-track::before { content:''; position:absolute; left:0; right:0; top:8px; height:1px; background:var(--line); }
  .cap .tl-bar { position:absolute; top:2px; height:14px; min-width:6px; border-radius:7px; background:var(--purple);
    display:flex; align-items:center; padding:0 7px; overflow:hidden; }
  .cap .tl-bar b { font-size:10px; color:#fff; font-weight:600; white-space:nowrap; }
  .cap .tl-bar.crit { background:var(--red); }
  .cap .tl-now { position:absolute; top:-2px; bottom:-2px; width:2px; background:var(--red); opacity:.45; }
  .cap .tl-empty { font-size:13px; color:var(--muted); padding:18px 2px; }
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
function qSortValue(k){
  if(k===UNASSIGNED) return Infinity;
  const m = /^Q([1-4])(?: (\d{4}))?$/.exec(k);
  if(!m) return Infinity;
  return (m[2] ? parseInt(m[2],10) : 0)*10 + parseInt(m[1],10);
}
function currentQKey(){
  const d = new Date();
  return qKey('Q'+Math.ceil((d.getMonth()+1)/3), String(d.getFullYear()));
}

// Date-only cells ("2026-05-11") are pinned to UTC so a bar doesn't shift a day
// depending on the viewer's timezone. Positions are relative, so UTC throughout.
function parseDate(v){
  if(!v) return null;
  const s = String(v);
  const t = Date.parse(s.length<=10 ? s+'T00:00:00Z' : s);
  return isFinite(t) ? t : null;
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
// First of each month inside the domain, for the axis.
function monthTicks(min,max){
  const out=[]; const d=new Date(min);
  let y=d.getUTCFullYear(), m=d.getUTCMonth();
  let t=Date.UTC(y,m,1);
  while(t<min){ m++; if(m>11){m=0;y++;} t=Date.UTC(y,m,1); }
  while(t<=max && out.length<48){
    out.push({t, label:new Date(t).toLocaleDateString(undefined,{month:'short',year:'2-digit',timeZone:'UTC'})});
    m++; if(m>11){m=0;y++;} t=Date.UTC(y,m,1);
  }
  return out;
}

function Dropdown({label, options, selected, onToggle, onSetAll}){
  const [open,setOpen]=useState(false);
  const lbl = selected.size===options.length ? 'All' : (selected.size===0 ? 'none' : selected.size+' selected');
  return (
    <div className="dd" style={{position:'relative'}}>
      <button onClick={()=>setOpen(o=>!o)}>{label}: <b>{lbl}</b></button>
      {open && <>
        <div style={{position:'fixed',inset:0,zIndex:10}} onClick={()=>setOpen(false)}/>
        <div className="panel">
          <div className="panel-actions">
            <button type="button" disabled={selected.size===options.length}
              onClick={()=>onSetAll(new Set(options))}>Select all</button>
            <button type="button" disabled={selected.size===0}
              onClick={()=>onSetAll(new Set())}>Clear</button>
          </div>
          {options.map(o=>(
            <label key={o}><input type="checkbox" checked={selected.has(o)} onChange={()=>onToggle(o)}/> {o}</label>
          ))}
        </div>
      </>}
    </div>
  );
}

// Rebuilds the Submitted view of the "Accepted & Submitted Capacity Planning"
// page: allocations laid out across Est. Work Start -> End Date, grouped by CoE.
// Submitted is that page's own bucket — every status except Rejected. The Accepted
// view is deliberately not reproduced here.
function Timeline({rows, hasStatus, hasDates}){
  const inMode = useMemo(()=>
    hasStatus ? rows.filter(r=>!r.isRejected) : rows
  ,[rows, hasStatus]);

  // A bar needs both ends; anything half-dated is counted in the note instead of
  // being drawn at a guessed position.
  const dated = useMemo(()=>
    inMode.filter(r=>r.s!=null && r.e!=null && r.e>=r.s).sort((a,b)=>a.s-b.s)
  ,[inMode]);

  const domain = useMemo(()=>{
    if(!dated.length) return null;
    let min=Infinity, max=-Infinity;
    dated.forEach(r=>{ if(r.s<min) min=r.s; if(r.e>max) max=r.e; });
    if(max<=min) max = min + 30*86400000;
    const pad = (max-min)*0.02;
    return {min:min-pad, max:max+pad};
  },[dated]);

  const groups = useMemo(()=>{
    const m = new Map();
    dated.slice(0, MAX_BARS).forEach(r=>{
      if(!m.has(r.coe)) m.set(r.coe, []);
      m.get(r.coe).push(r);
    });
    return [...m.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
  },[dated]);

  if(!hasDates){
    return <div className="tl"><div className="tl-empty">
      Turn on <b>Est. Work Start Date</b> and <b>Est. Work End Date</b> on Program CoE
      Allocation in this element's Fields setting to draw the timeline.
    </div></div>;
  }

  const span = domain ? (domain.max - domain.min) : 1;
  const pos = t => ((t - domain.min) / span) * 100;
  const ticks = domain ? monthTicks(domain.min, domain.max) : [];
  const now = Date.now();
  const showNow = !!domain && now >= domain.min && now <= domain.max;
  const undated = inMode.length - dated.length;
  const capped = Math.max(0, dated.length - MAX_BARS);

  return (
    <div className="tl">
      <div className="tl-head">
        <span className="tl-note">
          {dated.length} allocation{dated.length===1?'':'s'}
          {undated>0 ? ' · '+undated+' hidden (missing a start or end date)' : ''}
          {capped>0 ? ' · '+capped+' beyond the first '+MAX_BARS : ''}
          {!hasStatus ? " · Program Status isn't exposed, showing everything" : ''}
        </span>
      </div>

      {!dated.length ? (
        <div className="tl-empty">Nothing to plot for this selection.</div>
      ) : (
        <div className="tl-scroll"><div className="tl-grid">
          <div className="tl-axis">
            {ticks.map(t=><span key={t.t} style={{left:pos(t.t)+'%'}}>{t.label}</span>)}
          </div>
          {groups.map(([coe, items])=>(
            <div key={coe}>
              <div className="tl-coe">{coe} <i>{items.length}</i></div>
              {items.map(r=>{
                const left = pos(r.s), w = Math.max(0.6, pos(r.e) - left);
                const hrs = r.sub;
                return (
                  <div className="tl-row" key={r.id}>
                    <div className="tl-lbl" title={r.pname}>{r.pname}</div>
                    <div className="tl-track">
                      {showNow && <span className="tl-now" style={{left:pos(now)+'%'}}/>}
                      <div className={'tl-bar'+(r.crit?' crit':'')}
                           style={{left:left+'%', width:w+'%'}}
                           title={r.pname+' — '+fmt(r.sub)+' submitted hrs'+(r.acc?', '+fmt(r.acc)+' accepted':'')+(r.st?' · '+r.st:'')}>
                        <b>{fmt(hrs)}h</b>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div></div>
      )}
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

  const teams = useMemo(()=>{
    if(!coeRecords) return [];
    return coeRecords.map(r=>({
      n: r.getCellValueAsString(COE.name).trim(),
      wk100: Number(r.getCellValue(COE.wk100))||0,
      wk70: Number(r.getCellValue(COE.wk70))||0,
    })).filter(t=>t.n && !isExcludedCoE(t.n));
  },[coeRecords]);

  const [selT, setSelT] = useState(null);
  const teamNames = useMemo(()=>teams.map(t=>t.n).sort(),[teams]);
  const selTeams = selT ?? new Set(teamNames);

  // Programs carries the quarter people actually set (a single-select), and it is
  // populated far more reliably than In Market Start Date — most programs have no
  // date at all, so deriving the quarter from the date dropped them from every
  // bucket. Use the select when it's exposed; fall back to the date otherwise.
  const hasQuarterField = !!progTable.getFieldByIdIfExists(PROG.quarter);
  const hasYearField = !!progTable.getFieldByIdIfExists(PROG.year);
  // Timeline + status inputs are optional: the dashboard still works without them,
  // so they are feature-detected rather than added to the hard preflight.
  // Status can come from either end. Programs holds the real single-select; the
  // allocation carries a lookup of it. Either will do, so only warn when neither
  // is exposed — at that point rejected programs genuinely cannot be identified.
  const hasProgStatus = !!progTable.getFieldByIdIfExists(PROG.status);
  const hasAllocStatus = !!allocTable.getFieldByIdIfExists(ALLOC.status);
  const hasStatusField = hasProgStatus || hasAllocStatus;
  const hasTimelineFields = !!allocTable.getFieldByIdIfExists(ALLOC.start)
                         && !!allocTable.getFieldByIdIfExists(ALLOC.end);

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
        s: hasTimelineFields ? parseDate(r.getCellValue(ALLOC.start)) : null,
        e: hasTimelineFields ? parseDate(r.getCellValue(ALLOC.end)) : null,
      };
    }).filter(x=>x.coe && !x.test && !isExcludedCoE(x.coe));
  },[allocRecords, progMap, hasAllocStatus, hasTimelineFields]);

  // Options come from the data rather than a fixed Q1–Q4 list, so the dropdown
  // only offers quarters that work is actually scheduled in, and shows the year.
  const quarterOptions = useMemo(()=>{
    const s = new Set(rows.map(x=>x.qk));
    return [...s].sort((a,b)=>(qSortValue(a)-qSortValue(b)) || a.localeCompare(b));
  },[rows]);

  const [selQRaw, setSelQ] = useState(null);
  const defaultQ = useMemo(()=>{
    const now = currentQKey();
    return new Set(quarterOptions.includes(now) ? [now] : quarterOptions);
  },[quarterOptions]);
  const selQ = selQRaw ?? defaultQ;

  // Capacity scales with how many real quarters are selected — "No quarter set"
  // is not a quarter and must not multiply anyone's capacity.
  const nQ = Math.max([...selQ].filter(k=>k!==UNASSIGNED).length,1);
  const inQ = k => selQ.has(k);
  const demandOf = name => rows.reduce((s,x)=>s+((x.coe===name && inQ(x.qk) && !x.isRejected)?x.sub:0),0);

  // BU table (respects team + quarter filters)
  const buAgg = {}; BU_ORDER.forEach(b=>buAgg[b]={sub:0,acc:0,crit:0});
  rows.forEach(x=>{
    if(!selTeams.has(x.coe) || !inQ(x.qk)) return;
    if(!buAgg[x.bu]) return; // Unassigned & others not shown
    if(x.isRejected) return;                       // Submitted = everything but Rejected
    buAgg[x.bu].sub += x.sub;
    if(!hasStatusField || x.isAccepted) buAgg[x.bu].acc += x.acc;
    if(x.crit) buAgg[x.bu].crit += x.sub;
  });
  const tot = {sub:0,acc:0,crit:0}; BU_ORDER.forEach(b=>{tot.sub+=buAgg[b].sub;tot.acc+=buAgg[b].acc;tot.crit+=buAgg[b].crit;});

  const shown = teams.filter(t=>selTeams.has(t.n));
  const visibleRows = rows.filter(x=>selTeams.has(x.coe) && inQ(x.qk));
  // Submitted programs, using the same bucket as the hours: everything the
  // "Accepted & Submitted Capacity Planning" page treats as submitted, i.e. every
  // status except Rejected. The denominator is the submitted programs across all
  // quarters and teams, so "x of y" compares like with like as the filters move.
  const submittedRows = rows.filter(x=>x.pid && !x.isRejected);
  const progTotal = new Set(submittedRows.map(x=>x.pid)).size;
  const progInView = new Set(
    submittedRows.filter(x=>selTeams.has(x.coe) && inQ(x.qk)).map(x=>x.pid)
  ).size;
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
          onToggle={q=>setSelQ(s=>{const n=new Set(s); n.has(q)?n.delete(q):n.add(q); return n;})}
          onSetAll={next=>setSelQ(next)}/>
        <Dropdown label="Teams" options={teamNames} selected={selTeams}
          onToggle={t=>setSelT(()=>{const n=new Set(selTeams); n.has(t)?n.delete(t):n.add(t); return n;})}
          onSetAll={next=>setSelT(next)}/>
        <button onClick={()=>setSortMode(m=>m==='az'?'za':(m==='za'?'busy':'az'))}>
          Sort: {sortMode==='az'?'A→Z':(sortMode==='za'?'Z→A':'busiest')}</button>
      </div>

      <div className="ctx">
        Showing <b>{selQ.size===0 ? 'no quarters' : [...selQ].sort((a,b)=>qSortValue(a)-qSortValue(b)).join(', ')}</b>
        {' · '}<b>{shown.length}</b> of {teams.length} teams
        {!hasQuarterField && <span className="warn">{' · '}Quarter isn't exposed on Programs — falling back to In Market Start Date</span>}
        {!hasStatusField && <span className="warn">{' · '}Turn on Program Status to exclude rejected programs</span>}
      </div>

      <div className="kpis">
        <div className="kpi"><div className="n">{progInView}</div><div className="l">Submitted programs <small>(of {progTotal} submitted)</small></div></div>
        <div className="kpi"><div className="n">{shown.length}</div><div className="l">Teams shown</div></div>
        <div className="kpi"><div className="n">{fmt(totCap)} <small>hrs</small></div><div className="l">Usable capacity, selected quarter(s)</div></div>
        <div className="kpi"><div className="n">{fmt(totSub)} <small>hrs</small></div><div className="l">Submitted hours (selected)</div></div>
      </div>

      <div className="st">Business Units</div>
      <table>
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
      </table>

      <div className="st">Team Capacity (per CoE)</div>
      <div className="grid">
        {cards.map(t=>{
          const noCap=t.wk100===0, full=t.wk100*WEEKS*nQ, cap=t.wk70*WEEKS*nQ, d=demandOf(t.n);
          // Percentage and colour run off full capacity; "remaining" and the
          // reduction still measure against the 70% allowance, which is the
          // number a lead actually plans to.
          const u = noCap? null : d/full, bnd = noCap?'grey':band(u);
          const rem = cap-d, red = d>cap? d-cap : 0;
          const tagCls = noCap?'t-grey':(bnd==='red'?'t-red':bnd==='amber'?'t-amber':'t-green');
          const tagTxt = noCap?'No capacity set':(bnd==='red'?'Over threshold':bnd==='amber'?'Approaching':'Healthy');
          return (
            <div className="team" key={t.n}>
              <div className="top">
                <div className="tname">{t.n}</div>
                <div className="urow">
                  <div className="ubig" style={{color:noCap?'#aaa':BC[bnd]}}>{u==null?'—':pct(u)+'%'}</div>
                  <span className={'tag '+tagCls}>{tagTxt}</span>
                </div>
                <div className="ucap">Submitted hrs ÷ full capacity — the marker is the 70% allowance</div>
                <div className="bar"><i style={{width:Math.min(100,(u||0)*100)+'%',background:noCap?'#ccc':BC[bnd]}}/>{!noCap&&<span className="tgt"/>}</div>
              </div>
              <div className="metrics">
                <div><div className="k">Working hrs / quarter (100%)</div><div className="v">{fmt(t.wk100*WEEKS*nQ)}</div></div>
                <div><div className="k">Usable / quarter (70%)</div><div className="v">{fmt(cap)} <small>hrs</small></div></div>
                <div><div className="k">Submitted hrs</div><div className="v">{fmt(d)}</div></div>
                <div><div className="k">Hrs remaining</div><div className="v" style={{color:rem<0?'var(--red)':'inherit'}}>{fmt(rem)}</div></div>
                <div><div className="k">Reduction to hit 70%</div><div className="v" style={{color:red>0?'var(--red)':'var(--green)'}}>{red>0?fmt(red)+' hrs':'None'}</div></div>
                <div><div className="k">Working hrs / week</div><div className="v">{fmt(t.wk100)} <small>/ 70%: {fmt(t.wk70)}</small></div></div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="st">Submitted Capacity Planning</div>
      <Timeline rows={visibleRows} hasStatus={hasStatusField} hasDates={hasTimelineFields}/>
    </div>
  );
}

initializeBlock({interface: () => <App />});
