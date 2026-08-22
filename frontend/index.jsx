import {initializeBlock, useBase, useRecords, loadCSSFromString} from '@airtable/blocks/interface/ui';
import React, {useState, useMemo} from 'react';

/*
  Capacity Overview — Interface Extension
  Replicates the HTML capacity dashboard, reading live from the base.
  Tables + fields must be added as data sources on the interface page.
*/

// ---- Field IDs (stable) ----
const COE = {table:'tblM62hRfWTmZWM6y', name:'fldW71asl0CYBmoTo', wk100:'fldKOGdC0wZqfDuiy', wk70:'fldvuSkFOY4yp6dUs'};
const ALLOC = {table:'tblqCfUqS0Uv9cAHY', coe:'fldQfjuOcQN3OEsqI', sub:'fldI3EvQkmFAnj6WN', acc:'fldokig5iBzBNFjyO', prog:'fld86ciaUU28ftWCS', imd:'fldeEJQsoSruTVgDD'};
const PROG = {table:'tblxbXHBPVWUeT0Ea', bu:'fldJmSYJeMYm9q4kb', test:'fldgr5Knddb8qNG0V', crit:'fldfW60SpnS5OCaD2'};

const BU_ORDER = ['Mail','Finance','Search','Newsgroup','Sports','Brand','DSP','YAds','Fantasy'];
const QUARTERS = ['Q1','Q2','Q3','Q4'];
const WEEKS = 13;

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
  @media (prefers-color-scheme: dark){ .cap{ --ink:#e6e3f5; --muted:#a29fbd; --line:#33304a; --bg:#15131f; --card:#1e1b2e; --purple-soft:#241f3d; } }
  @media(max-width:980px){ .cap .grid{grid-template-columns:repeat(2,1fr);} .cap .kpis{grid-template-columns:repeat(2,1fr);} }
  @media(max-width:640px){ .cap .grid{grid-template-columns:1fr;} }
`);

const fmt = n => (Math.round((n||0)*10)/10).toLocaleString(undefined,{maximumFractionDigits:1});
const pct = n => (isFinite(n)?Math.round(n*100):0);
const band = v => v>0.70?'red':(v>=0.50?'amber':'green');
const BC = {green:'var(--green)',amber:'var(--amber)',red:'var(--red)'};

function firstLink(cell){ return (cell && cell[0]) ? cell[0] : null; }
function quarterOf(dateStr){
  if(!dateStr) return null;
  const m = parseInt(String(dateStr).slice(5,7),10);
  if(!m) return null;
  return 'Q'+Math.ceil(m/3);
}
function lookupDate(cell){
  // multipleLookupValues → [{value}] or ["2026-05-11"]
  if(!cell || !cell.length) return null;
  const v = cell[0];
  return (v && typeof v==='object') ? (v.value ?? null) : v;
}

function Dropdown({label, options, selected, onToggle}){
  const [open,setOpen]=useState(false);
  const lbl = selected.size===options.length ? 'All' : (selected.size===0 ? 'none' : selected.size+' selected');
  return (
    <div className="dd" style={{position:'relative'}}>
      <button onClick={()=>setOpen(o=>!o)}>{label}: <b>{lbl}</b></button>
      {open && <>
        <div style={{position:'fixed',inset:0,zIndex:10}} onClick={()=>setOpen(false)}/>
        <div className="panel">
          {options.map(o=>(
            <label key={o}><input type="checkbox" checked={selected.has(o)} onChange={()=>onToggle(o)}/> {o}</label>
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

  const [selQ, setSelQ] = useState(new Set(['Q2']));
  const [sortMode, setSortMode] = useState('az');

  const teams = useMemo(()=>{
    if(!coeRecords) return [];
    return coeRecords.map(r=>({
      n: r.getCellValueAsString(COE.name),
      wk100: Number(r.getCellValue(COE.wk100))||0,
      wk70: Number(r.getCellValue(COE.wk70))||0,
    })).filter(t=>t.n && t.n!=='Vendor / Agency');
  },[coeRecords]);

  const [selT, setSelT] = useState(null);
  const teamNames = useMemo(()=>teams.map(t=>t.n).sort(),[teams]);
  const selTeams = selT ?? new Set(teamNames);

  // program → {bu, test, crit}
  const progMap = useMemo(()=>{
    const m = new Map();
    (progRecords||[]).forEach(r=>{
      const buLink = firstLink(r.getCellValue(PROG.bu));
      const crit = r.getCellValue(PROG.crit);
      m.set(r.id, {
        bu: buLink ? buLink.name : 'Unassigned',
        test: r.getCellValue(PROG.test)===true,
        crit: !!(crit && crit.name && crit.name.toUpperCase()==='YES'),
      });
    });
    return m;
  },[progRecords]);

  // allocations → normalized rows
  const rows = useMemo(()=>{
    return (allocRecords||[]).map(r=>{
      const coe = firstLink(r.getCellValue(ALLOC.coe));
      const prog = firstLink(r.getCellValue(ALLOC.prog));
      const pm = prog ? progMap.get(prog.id) : null;
      return {
        coe: coe ? coe.name : null,
        sub: Number(r.getCellValue(ALLOC.sub))||0,
        acc: Number(r.getCellValue(ALLOC.acc))||0,
        q: quarterOf(lookupDate(r.getCellValue(ALLOC.imd))),
        bu: pm ? pm.bu : 'Unassigned',
        crit: pm ? pm.crit : false,
        test: pm ? pm.test : false,
      };
    }).filter(x=>x.coe && !x.test && x.coe!=='Vendor / Agency');
  },[allocRecords, progMap]);

  const nQ = Math.max(selQ.size,1);
  const inQ = q => selQ.has(q);
  const demandOf = name => rows.reduce((s,x)=>s+((x.coe===name && inQ(x.q))?x.sub:0),0);

  // BU table (respects team + quarter filters)
  const buAgg = {}; BU_ORDER.forEach(b=>buAgg[b]={sub:0,acc:0,crit:0});
  rows.forEach(x=>{
    if(!selTeams.has(x.coe) || !inQ(x.q)) return;
    if(!buAgg[x.bu]) return; // Unassigned & others not shown
    buAgg[x.bu].sub += x.sub; buAgg[x.bu].acc += x.acc; if(x.crit) buAgg[x.bu].crit += x.sub;
  });
  const tot = {sub:0,acc:0,crit:0}; BU_ORDER.forEach(b=>{tot.sub+=buAgg[b].sub;tot.acc+=buAgg[b].acc;tot.crit+=buAgg[b].crit;});

  const shown = teams.filter(t=>selTeams.has(t.n));
  const totCap = shown.reduce((s,t)=>s+t.wk70*WEEKS*nQ,0);
  const totSub = shown.reduce((s,t)=>s+demandOf(t.n),0);

  let cards = teams.filter(t=>selTeams.has(t.n));
  const util = t => (t.wk70>0) ? demandOf(t.n)/(t.wk70*WEEKS*nQ) : (demandOf(t.n)>0?9:0);
  if(sortMode==='az') cards.sort((a,b)=>a.n.localeCompare(b.n));
  else if(sortMode==='za') cards.sort((a,b)=>b.n.localeCompare(a.n));
  else cards.sort((a,b)=>util(b)-util(a));

  return (
    <div className="cap">
      <h1>Capacity Overview</h1>
      <div className="controls">
        <Dropdown label="Quarters" options={QUARTERS} selected={selQ}
          onToggle={q=>setSelQ(s=>{const n=new Set(s); n.has(q)?n.delete(q):n.add(q); return n;})}/>
        <Dropdown label="Teams" options={teamNames} selected={selTeams}
          onToggle={t=>setSelT(()=>{const n=new Set(selTeams); n.has(t)?n.delete(t):n.add(t); return n;})}/>
        <button onClick={()=>setSortMode(m=>m==='az'?'za':(m==='za'?'busy':'az'))}>
          Sort: {sortMode==='az'?'A→Z':(sortMode==='za'?'Z→A':'busiest')}</button>
      </div>

      <div className="kpis">
        <div className="kpi"><div className="n">{progRecords?progRecords.length:'—'}</div><div className="l">Programs in system</div></div>
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
          const noCap=t.wk70===0, cap=t.wk70*WEEKS*nQ, d=demandOf(t.n);
          const u = noCap? null : d/cap, bnd = noCap?'grey':band(u);
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
                <div className="ucap">Submitted hrs ÷ usable capacity (selected quarter{selQ.size>1?'s':''})</div>
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
    </div>
  );
}

initializeBlock({interface: () => <App />});
