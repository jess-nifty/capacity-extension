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
              status:'fld02CmuABiOFdxn9', start:'fldHTdQ6cubzChPtX', end:'fldfWCXetTTTqnr7h',
              size:'fld3XLGMXBIybT2E0'};
// Estimated Sizing rows are named "<Team> - <size>", so the size is the tail.
const sizeOf = n => { const m = /[-–]\s*(XS|S|M|L|XL)\s*$/i.exec(String(n||'')); return m ? m[1].toUpperCase() : null; };
// A team's programme list runs largest size first, then by hours within a size;
// anything without a size goes last.
const SIZE_RANK = {XL:0, L:1, M:2, S:3, XS:4};
const bySizeThenHours = (a,b) => (SIZE_RANK[a.size] ?? 5) - (SIZE_RANK[b.size] ?? 5) || b.hrs-a.hrs;
// People. Leaders are excluded from headcount and the names list: they carry no
// working hours, so they are already absent from capacity, and counting them made
// a team look larger than the number the capacity figure is built from.
const PEOPLE = {table:'tblME4GTsam6VijUr', name:'fldST9rwsPokp6Q8A', coe:'fldVuBec3nj3ga9wH',
                leader:'fldfnN3U47qdl840X', hrsDay:'fldnVIq5RoqK03SSc'};

// Team Assignment. A person's Team on People is their home team, and by default all
// their time counts there. A row here lends a share of it to a team for a date range
// — "50% to Paid Media, 1–31 Oct" — and whatever share is not assigned on a given day
// stays with the home team. So only people who split their time need rows, and a
// one-row loan is enough: the home team's share does not have to be entered too
// (entering it does no harm). No End Date means ongoing; no Time Split means 100%.
const ASSIGN = {table:'tbljJDapNeW2nR2vj', person:'fldfwIe0iGghiJPpX', coe:'fldsWvQzlCphTWRWm',
                start:'fldMJc0lJTHzjvF01', end:'fldbtmWlHhjZ0esIn', split:'fld7Wvl0mUe0EoDGo'};

// US Public Holidays. Each row carries a date and the CoEs that observe it, so a
// holiday can be team-specific even though today every row links to every team.
const HOL = {table:'tblR2HjOPhwqZwOD3', date:'fldohX95jG7q7XaET', coes:'fldvq3NifBONt5cnk'};

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

// Teams reported as one. The combined card replaces its members everywhere on the
// page — cards, Teams filter and totals. The base still holds them as separate CoEs,
// so people, allocations and holidays keep linking to each one as before.
const COMBINED = [
  {n:'Marketing Studio (Combined)',
   members:['Marketing Studio (Brand & Performance)','Marketing Studio (Events)']},
];

// Planning always opens on Q4 of the current year; other quarters are one click away.
const PLANNING_QUARTER = 'Q4';
// Nothing before the current planning cycle is offered. Plenty of live work runs
// from earlier in 2026, and the part of it landing in Q4 still counts — this only
// stops a past period being selected. Move the date when the cycle rolls on.
const PERIOD_FLOOR = Date.UTC(2026, 9, 1);

// Admin > People. The base's own formula fields link as /{base}/{pageId}/{recordId},
// so a person's row opens directly rather than landing on an unfiltered list.
const PEOPLE_PAGE = 'https://airtable.com/appE8STdMZa2kq9eb/paggbWfwyVaiQu6LH';
const personUrl = id => PEOPLE_PAGE + '/' + id;

// All Programs, in the Marketing Operations interface. The previous target was
// "Program Detail: Wider Yahoo Team View Only", which is a read-only page for a
// different audience. Links are /{base}/{page}/{record}, like People: with the
// interface ID in the path as well, Airtable answers "page not found".
const PROGRAM_PAGE = 'https://airtable.com/appE8STdMZa2kq9eb/pag6P2FCsWsQFIqdI';
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
  .cap h1 { font-size:30px; margin:0 0 16px; letter-spacing:-.7px; }
  .cap .controls { display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin:0 0 20px; }
  .cap select, .cap button { font:inherit; border:1px solid var(--line); background:#fff; border-radius:9px; padding:7px 11px; color:var(--ink); cursor:pointer; }
  .cap .seg { display:inline-flex; border:1px solid var(--line); border-radius:10px; overflow:hidden; }
  .cap .seg button { border:none; border-radius:0; padding:9px 14px; font-size:13px; background:transparent; }
  .cap .seg button + button { border-left:1px solid var(--line); }
  .cap .seg button[data-on="1"] { background:var(--purple); color:#fff; }
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
  .cap td.num, .cap th.num { text-align:right; font-variant-numeric:tabular-nums;
    width:1%; white-space:nowrap; padding-left:22px; }
  /* Numeric columns shrink to their content so the name column absorbs the slack,
     instead of four columns splitting the width evenly and drifting apart. */
  /* max-content, not auto: a table in a full-width block was still being stretched,
     which pushed the name column away from the first number. */
  .cap table.bu { width:max-content; max-width:100%; }
  .cap table.bu td:first-child, .cap table.bu th:first-child { min-width:150px; }
  .cap .acc { color:var(--green); }
  .cap td.acc { font-weight:700; }
  .cap th.acc { color:var(--green); }
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
  .cap .menu-ov { position:fixed; inset:0; z-index:40; }
  .cap .menu { position:fixed; z-index:41; background:var(--card); border:1px solid var(--line);
    border-radius:10px; box-shadow:0 10px 30px rgba(40,30,90,.18); padding:5px; min-width:180px; }
  .cap .menu button { display:block; width:100%; text-align:left; border:none; background:transparent;
    border-radius:7px; padding:8px 11px; font-size:13px; color:var(--ink); }
  .cap .menu button:hover { background:var(--purple-soft); color:var(--purple); }
  .cap .tcaret { display:inline-flex; align-items:center; justify-content:center; width:26px; height:26px;
    border-radius:50%; background:var(--purple-soft); color:var(--purple); font-size:15px; font-weight:700;
    line-height:1; flex:none; }
  .cap .thead:hover .tcaret { background:var(--purple); color:#fff; }
  .cap .team.collapsed .top { padding-bottom:14px; }
  .cap .pfoot { padding:11px 14px 13px; border-top:1px solid var(--line); background:#fbfaff; }
  .cap .prow { display:flex; align-items:center; gap:10px; font-size:11.5px; }
  .cap .prow .pgo { margin-left:auto; }
  .cap .pfoot .plist { margin:9px 0 0; }
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
  .cap .plist li.lead { display:flex; align-items:baseline; gap:8px; }
  .cap .plist li.lead a { color:var(--muted); }
  .cap .plist li.prog { display:flex; align-items:baseline; gap:8px; }
  .cap .plist li.prog a { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .cap .plist li.prog .wk-h { font-variant-numeric:tabular-nums; white-space:nowrap; }
  .cap table.sizes { width:100%; margin:12px 0 0; border:none; border-radius:0; background:transparent;
    font-size:12px; table-layout:fixed; }
  .cap table.sizes th { background:transparent; color:var(--muted); font-size:10.5px; font-weight:600;
    padding:4px 6px; border-bottom:1px solid var(--line); text-transform:none; letter-spacing:0; }
  .cap table.sizes td { padding:4px 6px; border-bottom:1px solid var(--line); font-variant-numeric:tabular-nums; }
  .cap table.sizes th:nth-child(1) { width:52px; }
  .cap table.sizes th:nth-child(2) { width:78px; }
  .cap table.sizes th:nth-child(3) { width:62px; }
  .cap table.sizes th:nth-child(4) { width:40px; }
  .cap table.sizes .n { text-align:right; }
  .cap table.sizes tr.tot td { font-weight:700; border-bottom:none; }
  .cap table.sizes .sbar { padding-left:10px; }
  .cap table.sizes .strack { display:block; height:6px; border-radius:3px; background:var(--bg); overflow:hidden; }
  .cap table.sizes .sbar i { display:block; height:6px; border-radius:3px; min-width:2px; }
  .cap .nosz { font-size:10px; color:var(--muted); white-space:nowrap; }
  .cap .szt { font-size:10px; font-weight:700; color:var(--purple); background:var(--purple-soft);
    border-radius:4px; padding:1px 5px; }
  .cap .combo-of { font-size:11.5px; color:var(--muted); margin:2px 0 8px; }
  .cap .leadtag { font-size:10.5px; color:var(--muted); font-style:italic; white-space:nowrap; }
  .cap .plist li.pp { display:flex; align-items:baseline; gap:8px; }
  .cap .plist li.pp a { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .cap .sharetag { font-size:10.5px; font-weight:600; color:var(--purple); white-space:nowrap;
    font-variant-numeric:tabular-nums; cursor:help; }
  .cap .pnone { font-size:12px; color:var(--muted); margin:0 0 12px; }
  .cap button.sharetag { background:none; border:0; padding:1px 4px; border-radius:4px; font:inherit; font-size:10.5px;
    font-weight:600; color:var(--purple); cursor:pointer; text-decoration:underline dotted; text-underline-offset:3px; }
  .cap button.sharetag:hover, .cap button.sharetag[aria-expanded="true"] { background:var(--purple-soft); text-decoration:none; }
  .cap .aedit { background:var(--card); border:1px solid var(--purple); border-radius:10px; padding:10px 12px; margin:0 0 12px;
    display:flex; flex-direction:column; gap:8px; }
  .cap .ahead { display:flex; align-items:flex-start; justify-content:space-between; gap:8px; font-size:12px; }
  .cap .ahead > div { display:flex; flex-direction:column; gap:1px; min-width:0; }
  .cap .ahead span { color:var(--muted); font-size:11.5px; }
  .cap .arow { display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; gap:4px 6px; font-size:12px;
    padding-bottom:8px; border-bottom:1px solid var(--line); }
  .cap .arow select { min-width:0; width:100%; }
  .cap .adates { grid-column:1 / -1; display:flex; align-items:center; gap:6px; }
  .cap .arow select, .cap .arow input { font:inherit; font-size:12px; color:var(--ink); background:var(--card);
    border:1px solid var(--line); border-radius:6px; padding:3px 5px; }
  .cap .arow input[type=date] { width:118px; min-width:0; }
  .cap .apct { display:inline-flex; align-items:center; gap:2px; color:var(--muted); }
  .cap .apct input { width:52px; text-align:right; }
  .cap .ato { color:var(--muted); }
  .cap .aact { display:inline-flex; gap:4px; margin-left:auto; }
  .cap .asec { font-size:11px; font-weight:700; color:var(--ink); text-transform:uppercase; letter-spacing:.5px;
    padding-top:6px; border-top:1px solid var(--line); }
  .cap .acols { display:grid; grid-template-columns:minmax(0,1fr) auto; font-size:10.5px; color:var(--muted);
    text-transform:uppercase; letter-spacing:.4px; margin-bottom:-4px; }
  .cap .acols span:last-child { padding-right:16px; }
  .cap .adraft { background:var(--purple-soft); border:1px dashed var(--purple); border-radius:8px; padding:6px; }
  .cap .abtn.xbtn { border-color:var(--line); color:var(--muted); padding:3px 7px; }
  .cap .abtn.xbtn:hover:not(:disabled) { border-color:var(--red); color:var(--red); background:var(--red-bg); }
  .cap .aaddbtn { align-self:flex-start; font:inherit; font-size:12px; font-weight:600; color:var(--purple); background:none;
    border:1px dashed var(--purple); border-radius:6px; padding:4px 10px; cursor:pointer; }
  .cap .aaddbtn:hover { background:var(--purple-soft); }
  .cap .aadds { display:flex; gap:6px; flex-wrap:wrap; }

  .cap .abtn { font:inherit; font-size:11.5px; font-weight:600; border:1px solid var(--line); background:var(--card);
    color:var(--ink); border-radius:6px; padding:3px 8px; cursor:pointer; }
  .cap .abtn.pri { background:var(--purple); border-color:var(--purple); color:#fff; }
  .cap .abtn.warn { background:var(--red); border-color:var(--red); color:#fff; }
  .cap .abtn.ghost { border-color:transparent; color:var(--muted); }
  .cap .abtn:disabled { opacity:.5; cursor:default; }
  .cap .anone { font-size:12px; color:var(--muted); }
  .cap .awarn { font-size:12px; color:var(--red); background:var(--red-bg); border-radius:6px; padding:5px 8px; }
  .cap .astat { font-size:11.5px; color:var(--green); }
  .cap .astat.err { color:var(--red); }
  .cap .urow { display:flex; align-items:baseline; justify-content:space-between; gap:10px; }
  .cap .ubig { font-size:32px; font-weight:800; letter-spacing:-1.5px; line-height:1; }
  .cap .ucap { font-size:12px; color:var(--muted); margin-top:2px; }
  /* The reasoning hangs off the status tag rather than occupying a line of its own.
     Anchored right and below so it stays inside the card, which clips overflow. */
  .cap .tagwrap { position:relative; display:inline-flex; }
  .cap .tag.has-tip { cursor:help; border-bottom:1px dotted currentColor; }
  .cap .tagwrap .tip { position:absolute; top:calc(100% + 7px); right:0; width:255px; z-index:30;
    background:#2a2440; color:#fff; font-size:11.5px; line-height:1.45; padding:9px 11px;
    border-radius:9px; box-shadow:0 10px 26px rgba(20,14,45,.28); text-align:left;
    opacity:0; visibility:hidden; transform:translateY(-3px); transition:opacity .12s, transform .12s; }
  .cap .tagwrap:hover .tip { opacity:1; visibility:visible; transform:translateY(0); }
  .cap .wk { margin:18px 0 2px; }
  .cap .wk-bars { position:relative; display:flex; align-items:flex-end; gap:3px; height:62px;
    border-bottom:1px solid var(--line); }
  .cap .wk-thr { position:absolute; right:0; top:var(--thr); transform:translateY(-50%); font-size:9px;
    font-weight:700; color:var(--muted); background:var(--card); padding:0 3px; border-radius:3px;
    pointer-events:none; z-index:2; }
  .cap .wk-bars::after { content:''; position:absolute; left:0; right:0; top:var(--thr);
    border-top:1px dashed var(--ink); opacity:.4; pointer-events:none; }
  .cap .wk-b { flex:1; display:flex; align-items:flex-end; height:100%; cursor:default; }
  .cap .wk-b > i { display:block; width:100%; border-radius:3px 3px 0 0; background:var(--muted); }
  .cap .wk-b > i.green { background:var(--green); } .cap .wk-b > i.amber { background:var(--amber); }
  .cap .wk-b > i.red { background:var(--red); } .cap .wk-b > i.grey { background:#ccc; }
  .cap .wk-b > i.zero { background:var(--line); }

  .cap .wk-ax { display:flex; gap:3px; margin-top:5px; }
  .cap .wk-ax span { flex:1; font-size:9.5px; color:var(--muted); white-space:nowrap; }
  .cap .wk-read { font-size:11.5px; color:var(--ink); margin:7px 0 0; min-height:17px; }
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
  .cap .miss { display:inline-block; background:var(--amber-bg); color:var(--amber); font-size:11px;
    font-weight:700; border-radius:5px; padding:2px 7px; margin-right:5px; white-space:nowrap; }
  .cap a.plain { color:var(--purple); text-decoration:none; font-weight:600; }
  .cap a.plain:hover { text-decoration:underline; }
  @media (prefers-color-scheme: dark){ .cap .pfoot { background:#211d33; } .cap{ --ink:#e6e3f5; --muted:#a29fbd; --line:#33304a; --bg:#15131f; --card:#1e1b2e; --purple-soft:#241f3d; } }
  @media(max-width:980px){ .cap .grid{grid-template-columns:repeat(2,1fr);} .cap .kpis{grid-template-columns:repeat(2,1fr);} }
  @media(max-width:640px){ .cap .grid{grid-template-columns:1fr;} }
`);

const fmt = n => (Math.round((n||0)*10)/10).toLocaleString(undefined,{maximumFractionDigits:1});
const pct = n => (isFinite(n)?Math.round(n*100):0);
// Headcount in FTE: whole numbers stay whole, part-time totals show one decimal.
const fmtHeads = n => { const r = Math.round((n||0)*10)/10; return Number.isInteger(r) ? String(r) : r.toFixed(1); };
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
const DAY_MS = 86400000;
const MONDAY_MS = 7*DAY_MS;
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
// "9 – 15 Nov", or "30 Nov – 6 Dec" when the range straddles a month. A single day
// is just "1 Oct".
const dayRange = (aMs, bMs) => {
  const a = new Date(aMs), b = new Date(bMs);
  const dayA = a.getUTCDate(), dayB = b.getUTCDate();
  const monA = a.toLocaleDateString(undefined,{month:'short',timeZone:'UTC'});
  const monB = b.toLocaleDateString(undefined,{month:'short',timeZone:'UTC'});
  if(aMs===bMs) return dayA+' '+monA;
  return monA===monB ? dayA+'–'+dayB+' '+monB : dayA+' '+monA+' – '+dayB+' '+monB;
};

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
// "Q4 2026" or "Oct 2026", whichever unit is being filtered by.
function periodKey(ms, mode){
  const d = new Date(ms), y = d.getUTCFullYear(), mo = d.getUTCMonth();
  return mode==='month' ? MONTHS[mo]+' '+y : 'Q'+(Math.floor(mo/3)+1)+' '+y;
}
function periodBounds(k){
  let m = /^Q([1-4]) (\d{4})$/.exec(k);
  if(m) return [Date.UTC(+m[2], (+m[1]-1)*3, 1), Date.UTC(+m[2], +m[1]*3, 0)];
  m = /^([A-Za-z]{3}) (\d{4})$/.exec(k);
  if(m){ const i = MONTHS.indexOf(m[1]); if(i>=0) return [Date.UTC(+m[2], i, 1), Date.UTC(+m[2], i+1, 0)]; }
  return null;
}
const periodSort = k => { const b = periodBounds(k); return b ? b[0] : Infinity; };

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
// `spans` clips each week to the days inside the selected period, so a bar is named
// after the days it actually charges. Without it a Q4 view labelled its first bar
// "Sep", because the week of 28 Sep carries 1–2 Oct.
function WeekChart({weeks, spans, widths, series, caps, noCap, pinned, onPick, scale}){
  const [hov, setHov] = useState(null);
  const show = hov!=null ? hov : pinned;
  const uu = i => (noCap || !caps[i]) ? 0 : series[i]/caps[i];
  const label = i => dayRange(spans[i][0], spans[i][1]);
  return (
    <div className="wk">
      <div className="wk-bars" style={{'--thr': (100-(0.70/scale)*100)+'%'}}>
        <span className="wk-thr">70%</span>
        {series.map((h,i)=>(
          <span key={weeks[i]}
            className={'wk-b'+(i===pinned?' pinned':'')}
            style={{flexGrow: widths[i]}}
            onMouseEnter={()=>setHov(i)} onMouseLeave={()=>setHov(null)}
            onClick={()=>onPick(i)}
            title={label(i)+' — '+(noCap?'no capacity set':pct(uu(i))+'% · '+fmt(series[i])+' hrs')}>
            <i className={h>0 ? (noCap?'grey':band(uu(i))) : 'zero'}
               style={{height: h>0 ? Math.max(3,(uu(i)/scale)*100)+'%' : '2px'}}/>
          </span>
        ))}
      </div>
      <div className="wk-ax">
        {weeks.map((w,i)=>{
          // Named for the first day the bar charges, not for its Monday.
          const dt = new Date(spans[i][0]);
          const newMonth = i===0 || new Date(spans[i-1][0]).getUTCMonth()!==dt.getUTCMonth();
          return <span key={w} style={{flexGrow: widths[i]}}>
            {newMonth ? dt.toLocaleDateString(undefined,{month:'short',timeZone:'UTC'}) : ''}</span>;
        })}
      </div>
      <div className="wk-read">
        {show!=null && series.length
          ? <><span className="wk-wk">{label(show)}</span>
              <b>{noCap?'—':pct(uu(show))+'%'}</b>
              <span className="wk-h"> · {fmt(series[show])} hrs</span>
              {pinned!=null && hov==null && <span className="wk-pin"> pinned</span>}</>
          : null}
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


// The holiday table is optional, and useRecords cannot take a null table, so the
// read lives in its own component that only mounts when the table is exposed.
// ---- Team Assignment editor ----
// Opens under a person in a team's people list. It shows every assignment that
// person has, not only this team's, because the rows only make sense together:
// the home team keeps whatever share they don't lend out on a given day.
const isoDay = ms => ms==null ? '' : new Date(ms).toISOString().slice(0,10);
const pctIn = v => { const n = parseFloat(v); return isFinite(n) ? Math.max(0, n)/100 : null; };

// The busiest day across a set of rows. Totals only rise on a start date, so
// checking each start (and "from the beginning") finds the peak.
function peakSplit(rows){
  const starts = [...new Set(rows.map(r=>r.s==null ? -Infinity : r.s))];
  let peak = 0, at = null;
  starts.forEach(d=>{
    const tot = rows.reduce((a,r)=>a + ((r.s==null || r.s<=d) && (r.e==null || d<=r.e) ? r.split : 0), 0);
    if(tot > peak){ peak = tot; at = d; }
  });
  return {peak, at};
}

function AssignRow({row, teamOptions, table, onStatus}){
  const [d, setD] = useState(()=>({team:row.team, pct:String(Math.round(row.split*100)), s:isoDay(row.s), e:isoDay(row.e)}));
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const dirty = d.team!==row.team || pctIn(d.pct)!==row.split || d.s!==isoDay(row.s) || d.e!==isoDay(row.e);
  const teamId = (teamOptions.find(o=>o.name===d.team)||{}).id;

  const save = async () => {
    const split = pctIn(d.pct);
    if(split==null){ onStatus('Enter a % between 0 and 100.', true); return; }
    if(d.s && d.e && d.e < d.s){ onStatus('The end date is before the start date.', true); return; }
    const fields = {[ASSIGN.coe]: teamId ? [{id:teamId}] : [], [ASSIGN.split]: split,
                    [ASSIGN.start]: d.s || null, [ASSIGN.end]: d.e || null};
    const chk = table.checkPermissionsForUpdateRecord(row.id, fields);
    if(!chk.hasPermission){ onStatus(chk.reasonDisplayString, true); return; }
    setBusy(true);
    try { await table.updateRecordAsync(row.id, fields); onStatus('Saved', false); }
    catch(err){ onStatus("Couldn't save: "+err.message, true); }
    setBusy(false);
  };
  const remove = async () => {
    const chk = table.checkPermissionsForDeleteRecord(row.id);
    if(!chk.hasPermission){ onStatus(chk.reasonDisplayString, true); return; }
    setBusy(true);
    try { await table.deleteRecordAsync(row.id); onStatus('Removed', false); }
    catch(err){ onStatus("Couldn't remove: "+err.message, true); setBusy(false); }
  };

  return (
    <div className="arow">
      <select value={d.team} onChange={e=>setD({...d, team:e.target.value})} disabled={busy} aria-label="Team">
        {!teamId && <option value={d.team}>{d.team}</option>}
        {teamOptions.map(o=><option key={o.id} value={o.name}>{o.name}</option>)}
      </select>
      <span className="apct"><input type="number" min="0" max="100" step="5" value={d.pct} disabled={busy}
        onChange={e=>setD({...d, pct:e.target.value})} aria-label="Share of time (%)"/>%</span>
      <div className="adates">
      <input type="date" value={d.s} disabled={busy} onChange={e=>setD({...d, s:e.target.value})} aria-label="Start date"/>
      <span className="ato">to</span>
      <input type="date" value={d.e} disabled={busy} onChange={e=>setD({...d, e:e.target.value})} aria-label="End date (blank = ongoing)"
        title="Leave blank for ongoing"/>
      <span className="aact">
        {dirty && <button className="abtn pri" onClick={save} disabled={busy}>Save</button>}
        {dirty && <button className="abtn" disabled={busy}
          onClick={()=>setD({team:row.team, pct:String(Math.round(row.split*100)), s:isoDay(row.s), e:isoDay(row.e)})}>Undo</button>}
        {!dirty && (confirmDel
          ? <><button className="abtn warn" onClick={remove} disabled={busy}>Remove</button>
              <button className="abtn" onClick={()=>setConfirmDel(false)} disabled={busy}>Keep</button></>
          : <button className="abtn xbtn" onClick={()=>setConfirmDel(true)} disabled={busy} title="Remove this assignment" aria-label="Remove this assignment">✕</button>)}
      </span>
      </div>
    </div>
  );
}

// A new, unsaved row. Several can be open at once; each is saved or discarded on its own.
function DraftRow({draft, teamOptions, table, person, onDone, onStatus}){
  const [d, setD] = useState(draft);
  const [busy, setBusy] = useState(false);
  const teamId = (teamOptions.find(o=>o.name===d.team)||{}).id;
  const save = async () => {
    const split = pctIn(d.pct);
    if(!teamId){ onStatus('Pick a team.', true); return; }
    if(split==null){ onStatus('Enter a % between 0 and 100.', true); return; }
    if(d.s && d.e && d.e < d.s){ onStatus('The end date is before the start date.', true); return; }
    const fields = {[ASSIGN.person]:[{id:person.id}], [ASSIGN.coe]:[{id:teamId}], [ASSIGN.split]:split,
                    [ASSIGN.start]: d.s || null, [ASSIGN.end]: d.e || null};
    const chk = table.checkPermissionsForCreateRecord(fields);
    if(!chk.hasPermission){ onStatus(chk.reasonDisplayString, true); return; }
    setBusy(true);
    try { await table.createRecordAsync(fields); onStatus('Added '+d.team+' at '+Math.round(split*100)+'%', false); onDone(); }
    catch(err){ onStatus("Couldn't add: "+err.message, true); setBusy(false); }
  };
  return (
    <div className="arow adraft">
      <select value={d.team} onChange={e=>setD({...d, team:e.target.value})} disabled={busy} aria-label="Team">
        <option value="">Choose a team…</option>
        {teamOptions.map(o=><option key={o.id} value={o.name}>{o.name}</option>)}
      </select>
      <span className="apct"><input type="number" min="0" max="100" step="5" value={d.pct} disabled={busy}
        onChange={e=>setD({...d, pct:e.target.value})} placeholder="0" aria-label="Share of time (%)"/>%</span>
      <div className="adates">
        <input type="date" value={d.s} disabled={busy} onChange={e=>setD({...d, s:e.target.value})} aria-label="Start date"/>
        <span className="ato">to</span>
        <input type="date" value={d.e} disabled={busy} onChange={e=>setD({...d, e:e.target.value})} aria-label="End date (blank = ongoing)"
          title="Leave blank for ongoing"/>
        <span className="aact">
          <button className="abtn pri" onClick={save} disabled={busy}>Save</button>
          <button className="abtn xbtn" onClick={onDone} disabled={busy} title="Discard this new row" aria-label="Discard this new row">✕</button>
        </span>
      </div>
    </div>
  );
}

function AssignEditor({person, cardTeam, rows, teamOptions, table, defaults, onClose}){
  const home = person.home.length ? person.home.join(', ') : 'None';
  const [drafts, setDrafts] = useState([]);
  const [status, setStatus] = useState(null);
  const onStatus = (msg, err) => setStatus({msg, err});
  // A new row starts empty apart from the dates, which default to the period in view.
  const addDraft = (team='', pct='') => setDrafts(ds=>[...ds, {key: Date.now()+'-'+ds.length, team, pct, s:defaults.s, e:defaults.e}]);
  // 0% in their home team takes their time out of the capacity for those dates.
  const zeroHome = () => person.home.forEach(h=>addDraft(h, '0'));
  const dropDraft = key => setDrafts(ds=>ds.filter(x=>x.key!==key));

  const {peak, at} = peakSplit(rows);
  const any = rows.length + drafts.length > 0;

  return (
    <div className="aedit">
      <div className="ahead">
        <div><b>{person.name}</b><span>Home team: {home}</span></div>
        <button className="abtn ghost" onClick={onClose} aria-label="Close" title="Close">✕</button>
      </div>
      <div className="asec">Team allocation</div>
      {any && <div className="acols"><span>Team</span><span>% of time</span></div>}
      {rows.map(r=><AssignRow key={r.id+'|'+r.team+'|'+r.split+'|'+r.s+'|'+r.e} row={r} teamOptions={teamOptions} table={table} onStatus={onStatus}/>)}
      {drafts.map(d=><DraftRow key={d.key} draft={d} teamOptions={teamOptions} table={table} person={person}
        onDone={()=>dropDraft(d.key)} onStatus={onStatus}/>)}
      {peak > 1.001 && <div className="awarn">
        Adds up to {pct(peak)}%{at===-Infinity ? '' : ' from '+new Date(at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'})}</div>}
      {table
        ? <div className="aadds">
            <button className="aaddbtn" onClick={()=>addDraft()}>+ Add allocation</button>
            {person.home.length>0 && <button className="aaddbtn" onClick={zeroHome}
              title={'Adds a 0% row for '+home+' — their time is taken off the capacity for those dates'}>Set to 0%</button>}
          </div>
        : <div className="anone">Team Assignment isn't a data source on this page, so splits can't be saved here yet.</div>}
      {status && <div className={'astat'+(status.err?' err':'')}>{status.msg}</div>}
    </div>
  );
}

function HolidayLoader({table, children}){
  const recs = useRecords(table);
  const byTeam = useMemo(()=>{
    const m = new Map();
    (recs||[]).forEach(r=>{
      const ms = parseDate(r.getCellValue(HOL.date));
      if(ms==null) return;
      const teams = r.getCellValue(HOL.coes) || [];
      const names = teams.length ? teams.map(t=>String(t.name).trim()) : ['*'];
      names.forEach(n=>{
        if(!m.has(n)) m.set(n, new Set());
        m.get(n).add(ms);
      });
    });
    return m;
  },[recs]);
  return children(byTeam);
}

function PeopleLoader({table, children}){
  const recs = useRecords(table);
  // getCellValue throws on a field the element has not exposed, so every field is
  // checked before any of them is read — a missing one must degrade, not crash.
  const ready = [PEOPLE.name, PEOPLE.coe, PEOPLE.leader].every(f=>!!table.getFieldByIdIfExists(f));
  const hasHrs = !!table.getFieldByIdIfExists(PEOPLE.hrsDay);
  // Everyone, with their home team and hours. hrsDay is null when the field isn't
  // exposed; the dashboard then estimates it from the team's weekly hours.
  const list = useMemo(()=>{
    if(!ready) return null;
    return (recs||[]).map(r=>({
      id: r.id,
      name: r.getCellValueAsString(PEOPLE.name).trim(),
      leader: r.getCellValue(PEOPLE.leader)===true,
      hrsDay: hasHrs ? Number(r.getCellValue(PEOPLE.hrsDay))||0 : null,
      home: (r.getCellValue(PEOPLE.coe)||[]).map(t=>String(t.name).trim()),
    }));
  },[recs, ready, hasHrs]);
  const byTeam = useMemo(()=>{
    if(!ready) return null;
    const m = new Map();
    (recs||[]).forEach(r=>{
      const isLeader = r.getCellValue(PEOPLE.leader)===true;
      const nm = r.getCellValueAsString(PEOPLE.name).trim();
      (r.getCellValue(PEOPLE.coe) || []).forEach(t=>{
        const k = String(t.name).trim();
        const e = m.get(k) || {people:[], leaders:0};
        e.people.push({id:r.id, name:nm, leader:isLeader});
        if(isLeader) e.leaders++;
        m.set(k, e);
      });
    });
    // Contributors first, then leaders, each alphabetical.
    m.forEach(v=>v.people.sort((a,b)=>
      (a.leader?1:0)-(b.leader?1:0) || a.name.localeCompare(b.name)));
    return m;
  },[recs, ready]);
  return children(byTeam, list);
}

function AssignmentLoader({table, children}){
  const recs = useRecords(table);
  const assignments = useMemo(()=>(recs||[]).map(r=>{
    const p = firstLink(r.getCellValue(ASSIGN.person));
    const t = firstLink(r.getCellValue(ASSIGN.coe));
    if(!p || !t) return null;
    const split = r.getCellValue(ASSIGN.split);
    return {
      id: r.id,
      person: p.id,
      team: String(t.name).trim(),
      s: parseDate(r.getCellValue(ASSIGN.start)),         // null = from the start
      e: parseDate(r.getCellValue(ASSIGN.end)),           // null = ongoing
      split: split==null ? 1 : Math.max(0, Number(split)||0),
    };
  }).filter(Boolean),[recs]);
  return children(assignments);
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

  const holTable = base.getTableByIdIfExists(HOL.table);
  const pplTable = base.getTableByIdIfExists(PEOPLE.table);
  const asgTable = base.getTableByIdIfExists(ASSIGN.table);
  const dash = (hols, ppl, list, asg) => <Dashboard coeTable={coeTable} allocTable={allocTable}
                                         progTable={progTable} holidays={hols} peopleByTeam={ppl}
                                         peopleList={list} assignments={asg} asgTable={asg ? asgTable : null}/>;
  const pplReady = pplTable
    && [PEOPLE.name, PEOPLE.coe, PEOPLE.leader].every(f=>!!pplTable.getFieldByIdIfExists(f));
  // Split capacity needs every Team Assignment field; without them the page keeps
  // counting each person fully in their home team, as it always has.
  const asgReady = asgTable
    && [ASSIGN.person, ASSIGN.coe, ASSIGN.start, ASSIGN.end, ASSIGN.split]
         .every(f=>!!asgTable.getFieldByIdIfExists(f));
  const withAssign = (hols, ppl, list) => (asgReady && list)
    ? <AssignmentLoader table={asgTable}>{asg=>dash(hols, ppl, list, asg)}</AssignmentLoader>
    : dash(hols, ppl, list, null);
  const withPeople = hols => pplReady
    ? <PeopleLoader table={pplTable}>{(ppl, list)=>withAssign(hols, ppl, list)}</PeopleLoader>
    : dash(hols, null, null, null);
  return holTable
    ? <HolidayLoader table={holTable}>{withPeople}</HolidayLoader>
    : withPeople(null);
}

function Dashboard({coeTable, allocTable, progTable, holidays, peopleByTeam, peopleList, assignments, asgTable}){
  const coeRecords = useRecords(coeTable);
  const allocRecords = useRecords(allocTable);
  const progRecords = useRecords(progTable);

  const [sortMode, setSortMode] = useState('az');

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
      // Prefer the People table, which can tell a leader from a contributor. Falls
      // back to the CoE link, which only carries names, when it is not exposed.
      people: peopleByTeam
        ? ((peopleByTeam.get(r.getCellValueAsString(COE.name).trim())||{}).people || [])
        : (hasPeople
            ? (r.getCellValue(COE.people)||[]).map(x=>({id:x.id, name:x.name}))
                .sort((a,b)=>String(a.name).localeCompare(String(b.name)))
            : null),
      leaders: peopleByTeam
        ? ((peopleByTeam.get(r.getCellValueAsString(COE.name).trim())||{}).leaders || 0)
        : 0,
    })).filter(t=>t.n && !isExcludedCoE(t.n));
  },[coeRecords, hasPeople, peopleByTeam]);

  // The combined cards, built from whichever of their members exist. A combined
  // card carries its member teams as `parts`; every figure below sums over them.
  const combos = useMemo(()=>COMBINED.map(c=>{
    const parts = c.members.map(m=>teams.find(t=>norm(t.n)===norm(m))).filter(Boolean);
    if(parts.length<2) return null;
    const sum = k => parts.reduce((a,p)=>a+(p[k]||0), 0);
    return {n:c.n, parts, members:parts.map(p=>p.n), wk100:sum('wk100'), wk70:sum('wk70'),
            people: parts.some(p=>p.people) ? parts.flatMap(p=>p.people||[]) : null,
            leaders: sum('leaders')};
  }).filter(Boolean),[teams]);
  const membersOf = t => t.members || [t.n];
  const merged = useMemo(()=>new Set(combos.flatMap(c=>c.members)),[combos]);
  // Teams as the page presents them: combined cards in place of their members.
  const listed = useMemo(()=>[...teams.filter(t=>!merged.has(t.n)), ...combos],[teams, combos, merged]);

  // Which team cards have their people list open, and which are collapsed to a
  // single header row so a long list of teams stays scannable.
  const [openTeams, setOpenTeams] = useState(()=>new Set());
  const [collapsed, setCollapsed] = useState(()=>new Set());
  // Right-clicking a card's caret offers expand/collapse for every team, so the
  // action lives on the control it affects rather than in the toolbar.
  const [menu, setMenu] = useState(null);
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
  const teamNames = useMemo(()=>listed.map(t=>t.n).sort(),[listed]);
  // Everything except the teams that are off by default; null means "untouched",
  // so Reset drops back to this rather than to all-selected.
  const defaultTeams = useMemo(()=>new Set(teamNames.filter(n=>!isOffByDefault(n))),[teamNames]);
  const selTeams = selT ?? defaultTeams;
  const coeSelected = coe => selTeams.has(coe)
    || combos.some(c=>c.members.includes(coe) && selTeams.has(c.n));

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
  const hasSize = !!allocTable.getFieldByIdIfExists(ALLOC.size);
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
        // No programme record means we cannot confirm it is not a test or rejected —
        // and it also means a filter on the Programs data source has hidden it. Either
        // way the allocation is dropped rather than counted on an assumption.
        test: pm ? pm.test : true,
        st,
        // Both false when Program Status isn't exposed, so every total keeps its
        // previous unfiltered behaviour rather than silently dropping to zero.
        isAccepted: st ? ACCEPTED_STATUSES.has(st) : false,
        isRejected: st ? st === REJECTED_STATUS : false,
        size: hasSize ? sizeOf(firstLink(r.getCellValue(ALLOC.size))?.name) : null,
        s: hasDates ? parseDate(r.getCellValue(ALLOC.start)) : null,
        e: hasDates ? parseDate(r.getCellValue(ALLOC.end)) : null,
      };
    }).filter(x=>x.coe && !x.test && !isExcludedCoE(x.coe));
    // ^ programmes with Testing Programs ticked are excluded here, and so is any
    //   allocation whose programme the extension cannot see.
  },[allocRecords, progMap, hasAllocStatus, hasDates, hasSize]);

  // Options come from the data rather than a fixed Q1–Q4 list, so the dropdown
  // only offers quarters that work is actually scheduled in, and shows the year.
  const [period, setPeriod] = useState('quarter');   // 'quarter' | 'month'

  // Built from the weeks work is actually scheduled in, so a period with work in it
  // is always selectable. Previously the options came from the programme's Quarter
  // tag, which meant work scheduled in an untagged period could not be reached.
  // Spread each allocation across its working days — weekdays that are not a public
  // holiday for that team — rather than evenly across its weeks. Dividing by weeks
  // gave a partial week a full week's load, and gave a holiday week a full load
  // against reduced capacity, which spiked utilisation exactly where it should dip.
  // Hours are held per working day, not per week. Rolling them up to a Monday and
  // then testing that Monday against the period assigned a whole boundary week to
  // whichever quarter its Monday fell in — and a quarter rarely starts on a Monday.
  // Q4 2026 opens on Thursday 1 October, so 1–2 Oct were being charged to Q3.
  const rowDays = useMemo(()=>{
    const m = new Map();
    rows.forEach(x=>{
      if(x.s==null || x.e==null || x.e < x.s) return;
      const hset = holidays ? (holidays.get(x.coe) || holidays.get('*')) : null;
      const days = [];
      for(let t = x.s; t <= x.e; t += DAY_MS){
        const dow = new Date(t).getUTCDay();
        if(dow===0 || dow===6) continue;              // weekends are not working days
        if(hset && hset.has(t)) continue;             // nor are that team's holidays
        days.push(t);
      }
      if(!days.length) return;
      const perDay = x.sub/days.length;
      const out = new Map();
      days.forEach(t=>out.set(t, perDay));
      m.set(x.id, out);
    });
    return m;
  },[rows, holidays]);

  const quarterOptions = useMemo(()=>{
    const s = new Set();
    if(hasDates){
      rows.forEach(x=>{
        if(x.isRejected) return;
        const dm = rowDays.get(x.id);
        if(dm) dm.forEach((_,d)=>s.add(periodKey(d, period)));
      });
    }
    if(!s.size){                                    // no dates exposed: fall back to the tags
      rows.forEach(x=>{ if(x.qk!==UNASSIGNED) s.add(x.qk); });
      progMap.forEach(pm=>{ if(!pm.test && pm.q) s.add(qKey(pm.q, pm.y)); });
    }
    return [...s]
      .filter(k=>{ const b = periodBounds(k); return b && b[0] >= PERIOD_FLOOR; })
      .sort((a,b)=>periodSort(a)-periodSort(b));
  },[rows, rowDays, progMap, period, hasDates]);

  const [selQRaw, setSelQ] = useState(null);
  // Open on the quarter being planned, with every other quarter one click away in
  // the dropdown. Falls back to showing everything when that quarter has no work
  // in it, so the page can never open on an empty selection.
  const defaultQ = useMemo(()=>{
    const y = String(new Date().getFullYear());
    if(period==='month'){
      // The months of this year's planning quarter, so switching unit keeps the view.
      const want = [9,10,11].map(i=>MONTHS[i]+' '+y).filter(k=>quarterOptions.includes(k));
      return new Set(want.length ? want : quarterOptions.slice(0,3));
    }
    const q4 = PLANNING_QUARTER+' '+y;
    if(quarterOptions.includes(q4)) return new Set([q4]);
    const anyQ4 = quarterOptions.filter(k=>k.startsWith(PLANNING_QUARTER+' '));
    return new Set(anyQ4.length ? [anyQ4[anyQ4.length-1]] : quarterOptions);
  },[quarterOptions, period]);

  // Drop any selection the current unit no longer offers, so switching between
  // quarters and months recovers rather than emptying the page.
  const selQ = useMemo(()=>{
    const base = selQRaw ?? defaultQ;
    const valid = new Set(quarterOptions);
    const kept = [...base].filter(k=>valid.has(k));
    return kept.length ? new Set(kept) : defaultQ;
  },[selQRaw, defaultQ, quarterOptions]);

  // Capacity scales with how many real quarters are selected — "No quarter set"
  // is not a quarter and must not multiply anyone's capacity.
  const nQ = Math.max([...selQ].filter(k=>k!==UNASSIGNED).length,1);
  const inQ = k => selQ.has(k);
  // Bounds of every selected period, so a day can be tested against the selection.
  const selBounds = useMemo(()=>[...selQ].map(periodBounds).filter(Boolean),[selQ]);
  // Membership is decided per day. Testing a week's Monday instead moved up to four
  // working days of load across a period boundary, in either direction.
  const inSel = ms => selBounds.some(([a,b])=>ms>=a && ms<=b);
  // Hours from one allocation that land inside the selection. null = undateable.
  const hoursInSel = x => {
    if(!hasDates) return inQ(x.qk) ? x.sub : 0;     // no dates exposed: fall back to the tag
    if(x.s==null || x.e==null || x.e < x.s) return null;
    const dm = rowDays.get(x.id);
    if(!dm) return 0;
    let hit = 0;
    dm.forEach((h,d)=>{ if(inSel(d)) hit += h; });
    return hit;
  };

  // The bars on screen, each holding the working days it charges. A period rarely
  // starts on a Monday, and the days before that Monday are not a week of their own:
  // Q4 opens on Thursday 1 October, so 1–2 Oct belong with the week of 5 Oct rather
  // than in a two-day stub bar of their own labelled September. They are folded
  // forward, and the chart then runs Oct to Dec as the quarter does.
  const weekBuckets = useMemo(()=>{
    const byWeek = new Map();
    selBounds.forEach(([a,b])=>{
      for(let w = mondayOf(a); w <= b; w += MONDAY_MS){
        const key = w < a ? w + MONDAY_MS : w;     // a leading stub joins the next week
        for(let d=0; d<5; d++){
          const t = w + d*DAY_MS;
          if(!inSel(t)) continue;
          if(!byWeek.has(key)) byWeek.set(key, []);
          byWeek.get(key).push(t);
        }
      }
    });
    return [...byWeek.entries()].sort((x,y)=>x[0]-y[0])
      .map(([w,days])=>({w, days: days.sort((p,q)=>p-q)}));
  },[selBounds]);
  const selWeeks = useMemo(()=>weekBuckets.map(b=>b.w),[weekBuckets]);
  // Each bar named for the days it actually charges, so no month outside the
  // selected period can appear on the axis.
  const weekSpans = useMemo(()=>weekBuckets.map(b=>[b.days[0], b.days[b.days.length-1]]),[weekBuckets]);
  // Width tracks the days covered, so the area of a bar is its hours. A four-day
  // week at the end of a quarter is drawn four fifths as wide.
  const weekWidths = useMemo(()=>weekBuckets.map(b=>b.days.length),[weekBuckets]);
  // Which bar a given day belongs to — the fold means it is not always its Monday.
  const bucketOfDay = useMemo(()=>{
    const m = new Map();
    weekBuckets.forEach(b=>b.days.forEach(d=>m.set(d, b.w)));
    return m;
  },[weekBuckets]);


  // team -> Monday -> hours, for the weeks on screen.
  const weeklyByTeam = useMemo(()=>{
    const m = new Map();
    if(!hasDates) return m;
    rows.forEach(x=>{
      if(x.isRejected) return;
      const dm = rowDays.get(x.id);
      if(!dm) return;
      const t = m.get(x.coe) || new Map();
      dm.forEach((h,d)=>{ const w = bucketOfDay.get(d); if(w!=null) t.set(w, (t.get(w)||0) + h); });
      m.set(x.coe, t);
    });
    return m;
  },[rows, rowDays, bucketOfDay, hasDates]);

  // Work with no dates cannot be placed in any week, so it sits outside every figure
  // above. Listed rather than dropped, because it is real committed hours.
  const undated = useMemo(()=>{
    if(!hasDates) return null;
    const byProg = new Map(), byTeam = new Map();
    let total = 0;
    rows.forEach(x=>{
      if(x.isRejected || !coeSelected(x.coe)) return;
      if(!(x.s==null || x.e==null || x.e < x.s)) return;
      total += x.sub;
      byTeam.set(x.coe, (byTeam.get(x.coe)||0) + x.sub);
      const k = x.pid || x.pname;
      const pr = byProg.get(k) || {id:x.pid, name:x.pname, hrs:0, teams:new Set(), miss:new Set()};
      pr.hrs += x.sub; pr.teams.add(x.coe);
      // Which date is actually absent — "no dates" sent people hunting for the wrong one.
      pr.miss.add(x.s==null && x.e==null ? 'both' : x.s==null ? 'start' : x.e==null ? 'end' : 'order');
      byProg.set(k, pr);
    });
    return {
      total,
      teams: [...byTeam.entries()].sort((a,b)=>b[1]-a[1]),
      progs: [...byProg.values()].sort((a,b)=>b.hrs-a.hrs),
    };
  },[rows, selTeams, combos, hasDates]);

  // A week containing a public holiday is worth four days, not five. Capacity is
  // therefore summed week by week rather than taken as a flat 13 x weekly hours.
  const isHoliday = (team, dayMs) => {
    if(!holidays) return false;
    const set = holidays.get(team) || holidays.get('*');
    return !!set && set.has(dayMs);
  };
  // Capacity built person by person, day by day, so someone split 50/50 in October
  // and 80/20 in November lands in each team for exactly the days they are there.
  // On each day a person's active Team Assignment rows take their share, and the
  // rest stays with their home team. If the rows add up to more than 100%, they are
  // scaled back to 100% — capacity is never invented — and the person is flagged.
  // null when Team Assignment or People hours are not exposed: every figure then
  // falls back to the CoE's weekly hours, which count each person fully at home.
  // Each person's working hours per day. People → Working hours per day when it's
  // exposed; otherwise their home team's weekly hours shared across its members,
  // which adds back up to exactly the CoE figure the page used before.
  const hoursOf = useMemo(()=>{
    const m = new Map();
    if(!peopleList) return m;
    const teamWk = new Map((coeRecords||[]).map(r=>[r.getCellValueAsString(COE.name).trim(), Number(r.getCellValue(COE.wk100))||0]));
    const heads = new Map();
    peopleList.forEach(pp=>{ if(!pp.leader) pp.home.forEach(h=>heads.set(h, (heads.get(h)||0) + 1/pp.home.length)); });
    peopleList.forEach(pp=>{
      if(pp.leader){ m.set(pp.id, 0); return; }           // leaders carry no hours
      if(pp.hrsDay!=null){ m.set(pp.id, pp.hrsDay); return; }
      const est = pp.home.map(h=>heads.get(h) ? (teamWk.get(h)||0)/5/heads.get(h) : 0);
      m.set(pp.id, est.length ? est.reduce((a,b)=>a+b,0)/est.length : 0);
    });
    return m;
  },[peopleList, coeRecords]);

  const split = useMemo(()=>{
    if(!assignments || !peopleList || !weekBuckets.length) return null;
    const byPerson = new Map();
    assignments.forEach(a=>{
      if(!byPerson.has(a.person)) byPerson.set(a.person, []);
      byPerson.get(a.person).push(a);
    });
    const days = [];
    weekBuckets.forEach(b=>b.days.forEach(d=>days.push(d)));
    const cap = new Map();      // team -> day -> hours, net of that team's holidays
    const gross = new Map();    // team -> hours before holidays, for the weekly figure
    const who = new Map();      // team -> person id -> {person, frac}
    const over = new Map();     // person id -> {person, peak}
    const credit = (team, pp, d, frac) => {
      if(frac<=0) return;
      const h = (hoursOf.get(pp.id)||0)*frac;
      gross.set(team, (gross.get(team)||0) + h);
      if(!isHoliday(team, d)){
        if(!cap.has(team)) cap.set(team, new Map());
        const c = cap.get(team);
        c.set(d, (c.get(d)||0) + h);
      }
      if(!who.has(team)) who.set(team, new Map());
      const w = who.get(team);
      const cur = w.get(pp.id) || {person:pp, frac:0, lo:Infinity, hi:0, from:d, to:d};
      cur.frac += frac/days.length;           // average share across the selection
      // The rate on the days they're actually in this team, which is what the list shows.
      cur.lo = Math.min(cur.lo, frac); cur.hi = Math.max(cur.hi, frac);
      cur.from = Math.min(cur.from, d); cur.to = Math.max(cur.to, d);
      w.set(pp.id, cur);
    };
    peopleList.forEach(pp=>{
      if(!(hoursOf.get(pp.id)>0)) return;     // leaders carry no hours
      const mine = byPerson.get(pp.id) || [];
      days.forEach(d=>{
        const act = mine.filter(a=>(a.s==null || a.s<=d) && (a.e==null || d<=a.e));
        const lent = act.reduce((x,a)=>x+a.split, 0);
        if(lent > 1.001){
          const o = over.get(pp.id) || {person:pp, peak:0};
          o.peak = Math.max(o.peak, lent);
          over.set(pp.id, o);
        }
        const k = lent>1 ? 1/lent : 1;
        act.forEach(a=>credit(a.team, pp, d, a.split*k));
        // A row for their home team sets the home share outright (0% takes them out);
        // without one, home keeps whatever isn't lent elsewhere.
        if(act.some(a=>pp.home.includes(a.team))) return;
        const rest = Math.max(0, 1-lent);
        pp.home.forEach(h=>credit(h, pp, d, rest/pp.home.length));
      });
    });
    return {cap, gross, who, over, nDays: days.length};
  },[assignments, peopleList, weekBuckets, holidays, hoursOf]);

  // Weekly hours as the card states them: the CoE's figure, or with splits, the
  // average week this team actually has across the selection.
  const wkOf = t => t.parts ? t.parts.reduce((a,p)=>a+wkOf(p), 0)
    : (split ? (split.gross.get(t.n)||0)*5/split.nDays : t.wk100);
  // The base's own 70% field sets the ratio, rather than assuming it is exactly 0.70.
  const usableOf = t => t.wk100 ? t.wk70/t.wk100 : 0.7;

  // A bar is worth the working days it actually holds, less that team's public
  // holidays. It is the same day set the load is spread over, so the two sides
  // cannot drift — and a folded seven-day bar is measured against seven days.
  const weekCapOf = (t, bucket) => {
    if(t.parts) return t.parts.reduce((a,p)=>a+weekCapOf(p, bucket), 0);
    if(split){
      const c = split.cap.get(t.n);
      return c ? bucket.days.reduce((a,d)=>a+(c.get(d)||0), 0) : 0;
    }
    let n = 0;
    bucket.days.forEach(d=>{ if(!isHoliday(t.n, d)) n++; });
    return t.wk100 * n / 5;
  };
  const fullCapOf = t => weekBuckets.length
    ? weekBuckets.reduce((a,b)=>a+weekCapOf(t,b),0)
    : t.wk100*WEEKS*nQ;                       // no dates exposed: flat quarter

  // The people behind a card. With splits, that is everyone contributing time in
  // the selection — including people lent in from other teams — plus home members
  // lent out entirely, each with their average share; leaders always stay listed.
  const peopleOf = t => {
    if(t.parts){
      // Someone in both teams appears once, with their shares added together.
      const lists = t.parts.map(peopleOf);
      if(lists.every(l=>!l)) return null;
      const byId = new Map();
      lists.forEach(l=>(l||[]).forEach(pp=>{
        const cur = byId.get(pp.id);
        if(!cur){ byId.set(pp.id, {...pp}); return; }
        cur.leader = cur.leader || pp.leader;
        cur.guest = cur.guest && pp.guest;
        if(cur.share!=null && pp.share!=null) cur.share += pp.share;
        cur.lo = (cur.lo||0) + (pp.lo||0);
        cur.hi = (cur.hi||0) + (pp.hi||0);
        if(pp.from!=null) cur.from = cur.from==null ? pp.from : Math.min(cur.from, pp.from);
        if(pp.to!=null) cur.to = cur.to==null ? pp.to : Math.max(cur.to, pp.to);
      }));
      // Lent from one member to the other is not a guest of the pair.
      byId.forEach(pp=>{ if(pp.guest && t.members.some(m=>String(pp.home||'').includes(m))) pp.guest = false; });
      return [...byId.values()].sort((a,b)=>(a.leader?1:0)-(b.leader?1:0) || a.name.localeCompare(b.name));
    }
    if(!split || !t.people) return t.people;
    const w = split.who.get(t.n) || new Map();
    const out = t.people.map(pp=>{
      const e = w.get(pp.id);
      return {...pp, share: pp.leader ? null : (e ? e.frac : 0), guest:false,
              lo: e ? e.lo : 0, hi: e ? e.hi : 0, from: e ? e.from : null, to: e ? e.to : null};
    });
    const seen = new Set(t.people.map(pp=>pp.id));
    w.forEach((e,id)=>{
      if(seen.has(id)) return;
      out.push({id, name:e.person.name, leader:false, share:e.frac, guest:true,
                lo:e.lo, hi:e.hi, from:e.from, to:e.to,
                home:e.person.home.join(', ')});
    });
    return out.sort((a,b)=>(a.leader?1:0)-(b.leader?1:0) || a.name.localeCompare(b.name));
  };
  // The % shown beside a name: their rate on the days they're in this team, not an
  // average over the whole selection. A rate that changes within it shows as a range.
  const shareLabel = pp => {
    if(!split) return '100%';
    if(!(pp.hi>0)) return '0%';
    const lo = pct(pp.lo), hi = pct(pp.hi);
    return lo===hi ? hi+'%' : lo+'–'+hi+'%';
  };
  const dShort = ms => new Date(ms).toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'});
  const shareTitle = pp => {
    if(!split) return 'Counted fully in this team.';
    if(!(pp.hi>0)) return 'Not in this team during the selected period.';
    return 'In this team '+dShort(pp.from)+' – '+dShort(pp.to)+'. Averages '+pct(pp.share)+'% over the selected period.';
  };

  // Headcount in full-time equivalents: two people at 50% are one person's time.
  const fteOf = t => {
    const pl = peopleOf(t);
    if(!pl) return null;
    return pl.filter(pp=>!pp.leader).reduce((a,pp)=>a+(pp.share==null ? 1 : pp.share), 0);
  };

  // The programmes contributing to each team inside the selection.
  const teamProgs = useMemo(()=>{
    const m = new Map();
    if(!hasDates) return m;
    rows.forEach(x=>{
      if(x.isRejected) return;
      const dm = rowDays.get(x.id);
      if(!dm) return;
      let h = 0;
      dm.forEach((v,d)=>{ if(inSel(d)) h += v; });
      if(h<=0) return;
      const t = m.get(x.coe) || new Map();
      const k = x.pid || x.pname;
      const cur = t.get(k) || {id:x.pid, name:x.pname, hrs:0, size:x.size};
      cur.hrs += h;
      if(!cur.size && x.size) cur.size = x.size;
      t.set(k, cur); m.set(x.coe, t);
    });
    const out = new Map();
    m.forEach((t,k)=>out.set(k, [...t.values()].sort(bySizeThenHours)));
    return out;
  },[rows, rowDays, selBounds, hasDates]);

  // A combined card lists each programme once, with both teams' hours on it.
  const progsOf = t => {
    if(!t.parts) return teamProgs.get(t.n) || [];
    const m = new Map();
    t.members.forEach(n=>(teamProgs.get(n)||[]).forEach(pp=>{
      const k = pp.id || pp.name;
      const cur = m.get(k) || {...pp, hrs:0};
      cur.hrs += pp.hrs;
      if(!cur.size && pp.size) cur.size = pp.size;
      m.set(k, cur);
    }));
    return [...m.values()].sort(bySizeThenHours);
  };

  // Hours by size inside the selection, using each team's own sizing: a programme
  // Events sized L counts as L here even if another team sized it M. A combined
  // card sums its members, so a programme sized differently by each appears under
  // both sizes. Unsized work gets its own row rather than disappearing.
  const sizeBreakdownOf = t => {
    const rows = new Map();
    membersOf(t).forEach(n=>(teamProgs.get(n)||[]).forEach(pp=>{
      const k = pp.size || '—';
      const r = rows.get(k) || {size:k, progs:new Set(), hrs:0};
      r.progs.add(pp.id || pp.name);
      r.hrs += pp.hrs;
      rows.set(k, r);
    }));
    return [...rows.values()].sort((a,b)=>(SIZE_RANK[a.size] ?? 5) - (SIZE_RANK[b.size] ?? 5));
  };

  const [openProgs, setOpenProgs] = useState(()=>new Set());
  const toggleProgs = n => setOpenProgs(prev=>{
    const next = new Set(prev);
    next.has(n) ? next.delete(n) : next.add(n);
    return next;
  });

  // Why a team is over: read off the data rather than asserted. Only the two
  // strongest signals are kept, so the line stays one line.
  const shortName = n => { const t = String(n||'').trim(); return t.length>30 ? t.slice(0,29)+'…' : t; };

  // Which person's assignments are open for editing, per card: "team|personId".
  const [editing, setEditing] = useState(null);
  const teamOptions = useMemo(()=>(coeRecords||[])
    .map(r=>({id:r.id, name:r.getCellValueAsString(COE.name).trim()}))
    .filter(o=>o.name)
    .sort((a,b)=>a.name.localeCompare(b.name)),[coeRecords]);
  const personById = useMemo(()=>new Map((peopleList||[]).map(p=>[p.id,p])),[peopleList]);
  // A new assignment defaults to the selected period, which is usually what is being planned.
  const editDefaults = useMemo(()=>{
    if(!selBounds.length) return {s:'', e:''};
    return {s:isoDay(Math.min(...selBounds.map(b=>b[0]))), e:isoDay(Math.max(...selBounds.map(b=>b[1])))};
  },[selBounds]);
  const canEditSplits = !!peopleList;
  const diagnosis = useMemo(()=>{
    const m = new Map();
    if(!hasDates || !selWeeks.length) return m;
    [...teams, ...combos].forEach(t=>{
      if(wkOf(t)<=0) return;
      const ms = membersOf(t);
      const full = fullCapOf(t);
      if(full<=0) return;
      const byProg = new Map(), perWeek = new Map(), progsPerWeek = new Map();
      let total = 0;
      rows.forEach(x=>{
        if(!ms.includes(x.coe) || x.isRejected) return;
        const dm = rowDays.get(x.id);
        if(!dm) return;
        let h = 0;
        dm.forEach((v,d)=>{
          const w = bucketOfDay.get(d);
          if(v<=0 || w==null) return;
          h += v;
          perWeek.set(w, (perWeek.get(w)||0) + v);
          if(!progsPerWeek.has(w)) progsPerWeek.set(w, new Set());
          progsPerWeek.get(w).add(x.pname);
        });
        if(h<=0) return;
        total += h;
        byProg.set(x.pname, (byProg.get(x.pname)||0) + h);
      });
      // The busiest week, and how many programmes are running in it.
      let peakWeek = null, peakLoad = -1;
      perWeek.forEach((v,w)=>{ if(v>peakLoad){ peakLoad=v; peakWeek=w; } });
      const peakProgs = peakWeek!=null ? (progsPerWeek.get(peakWeek)||new Set()).size : 0;
      if(total <= full*0.70) return;            // only speak up past the threshold

      // Each signal points at a different remedy: re-size the big one, staff up,
      // stagger the overlap. "Over in n of 13 weeks" was dropped — it restated the
      // symptom rather than explaining it.
      const parts = [];
      const sorted = [...byProg.entries()].sort((a,b)=>b[1]-a[1]);

      if(sorted.length && sorted[0][1]/full >= 0.35)
        parts.push(shortName(sorted[0][0])+' alone is '+pct(sorted[0][1]/full)+'% of the quarter');

      const top3 = sorted.slice(0,3).reduce((a,[,v])=>a+v, 0);
      if(parts.length<2 && sorted.length>=3 && top3/total >= 0.65)
        parts.push('3 programmes are '+pct(top3/total)+'% of the load');

      const heads = fteOf(t);
      const need = heads ? Math.round(total/full*heads) : null;
      if(parts.length<2 && need && need >= Math.round(heads)+1)
        parts.push(fmt(total)+' hrs equates to ~'+need+' people, team has '+fmtHeads(heads));

      // Sizing: a wall of large programmes is a different problem from many small ones.
      if(parts.length<2){
        const big = progsOf(t).filter(pp=>pp.size==='L' || pp.size==='XL');
        const xl = big.filter(pp=>pp.size==='XL').length, lg = big.length - xl;
        if(xl+lg >= 3){
          const bits = [];
          if(xl) bits.push(xl+' XL');
          if(lg) bits.push(lg+' L');
          parts.push(bits.join(' and ')+' programme'+(xl+lg===1?'':'s')+' this quarter');
        }
      }

      let usedOverlap = false;
      if(parts.length<2 && peakWeek && peakProgs >= 4){
        parts.push(peakProgs+' programmes overlap in the busiest week');
        usedOverlap = true;
      }
      if(parts.length<2 && !usedOverlap && sorted.length>=10)
        parts.push(sorted.length+' programmes in one quarter');

      if(parts.length) m.set(t.n, parts.slice(0,2).join(' · '));
    });
    return m;
  },[teams, combos, rows, rowDays, weekBuckets, bucketOfDay, weeklyByTeam, holidays, hasDates, teamProgs, split]);

  const demandOf = t => {
    const ms = membersOf(t);
    return rows.reduce((s,x)=>{
      if(!ms.includes(x.coe) || x.isRejected) return s;
      return s + (hoursInSel(x) || 0);
    },0);
  };


  // BU table (respects team + quarter filters)
  const buAgg = {}; BU_ORDER.forEach(b=>buAgg[b]={sub:0,acc:0,crit:0});
  rows.forEach(x=>{
    if(!coeSelected(x.coe)) return;
    if(!buAgg[x.bu]) return; // Unassigned & others not shown
    if(x.isRejected) return;                       // Submitted = everything but Rejected
    const h = hoursInSel(x) || 0;                  // placed by date, like the cards
    buAgg[x.bu].sub += h;
    if(!hasStatusField || x.isAccepted) buAgg[x.bu].acc += x.acc;
    if(x.crit) buAgg[x.bu].crit += h;
  });
  const tot = {sub:0,acc:0,crit:0}; BU_ORDER.forEach(b=>{tot.sub+=buAgg[b].sub;tot.acc+=buAgg[b].acc;tot.crit+=buAgg[b].crit;});

  const shown = listed.filter(t=>selTeams.has(t.n));
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
  // Net of holidays and of part-weeks at the period edges, like the cards. A flat
  // 13 x weekly hours quietly disagreed with every figure underneath it. The base's
  // own 70% field sets the ratio, rather than assuming it is exactly 0.70.
  const totCap = shown.reduce((s,t)=>s + fullCapOf(t)*usableOf(t),0);
  const totSub = shown.reduce((s,t)=>s+demandOf(t),0);

  let cards = listed.filter(t=>selTeams.has(t.n));
  // Same denominator the card shows, so "busiest" orders by the number on screen.
  const util = t => { const c = fullCapOf(t); return c>0 ? demandOf(t)/c : (demandOf(t)>0?9:0); };
  if(sortMode==='busy') cards.sort((a,b)=>util(b)-util(a));
  else {
    // Alphabetical, with each combined card placed straight after its members.
    const cmp = sortMode==='az' ? (a,b)=>a.n.localeCompare(b.n) : (a,b)=>b.n.localeCompare(a.n);
    const ordered = cards.filter(t=>!t.parts).sort(cmp);
    cards.filter(t=>t.parts).forEach(c=>{
      const at = Math.max(...c.members.map(m=>ordered.findIndex(t=>t.n===m)));
      if(at>=0) ordered.splice(at+1, 0, c);
      else { const i = ordered.findIndex(t=>cmp(c,t)<0); ordered.splice(i<0?ordered.length:i, 0, c); }
    });
    cards = ordered;
  }

  return (
    <div className="cap">
      <h1>Capacity Overview</h1>
      <div className="controls">
        <div className="seg" title="Filter by quarter or by month">
          <button data-on={period==='quarter'?'1':'0'} onClick={()=>{setPeriod('quarter'); setSelQ(null);}}>Quarter</button>
          <button data-on={period==='month'?'1':'0'} onClick={()=>{setPeriod('month'); setSelQ(null);}}>Month</button>
        </div>
        <Dropdown label={period==='month'?'Months':'Quarters'} options={quarterOptions} selected={selQ}
          onToggle={q=>setSelQ(()=>{const n=new Set(selQ); n.has(q)?n.delete(q):n.add(q); return n;})}
          onSetAll={next=>setSelQ(next)} onReset={()=>setSelQ(null)}/>
        <Dropdown label="Teams" options={teamNames} selected={selTeams}
          onToggle={t=>setSelT(()=>{const n=new Set(selTeams); n.has(t)?n.delete(t):n.add(t); return n;})}
          onSetAll={next=>setSelT(next)} onReset={()=>setSelT(null)}/>
        <button onClick={()=>setSortMode(m=>m==='az'?'za':(m==='za'?'busy':'az'))}>
          Sort: {sortMode==='az'?'A→Z':(sortMode==='za'?'Z→A':'busiest')}</button>
        <a className="ext" href={CAPACITY_PAGE_URL} target="_blank" rel="noopener noreferrer">
          Accepted &amp; Submitted Capacity Planning ↗</a>
      </div>

      <div className="ctx">
        Showing <b>{selQ.size===0 ? 'nothing' : [...selQ].sort((a,b)=>periodSort(a)-periodSort(b)).join(', ')}</b>
        {' · '}<b>{shown.length}</b> of {listed.length} teams
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
        title={openSections.bu?'Collapse this section':'Expand this section'}>
        Total per Business Unit <span className="tcaret">{openSections.bu?'▾':'▸'}</span>
      </button>
      {openSections.bu && <table className="bu">
        <thead><tr><th>Business Unit</th><th className="num">Submitted hrs</th>
          <th className="num">Business-critical hrs</th><th className="num acc">Accepted hrs</th></tr></thead>
        <tbody>
          {BU_ORDER.map(b=>(
            <tr key={b}><td><b>{b}</b></td>
              <td className="num">{fmt(buAgg[b].sub)}</td>
              <td className="num">{fmt(buAgg[b].crit)}</td>
              <td className="num acc">{fmt(buAgg[b].acc)}</td></tr>
          ))}
          <tr className="total"><td>Total</td><td className="num">{fmt(tot.sub)}</td>
            <td className="num">{fmt(tot.crit)}</td><td className="num acc">{fmt(tot.acc)}</td></tr>
        </tbody>
      </table>}

      <button className="st st-toggle" onClick={()=>toggleSection('teams')}
        title={openSections.teams?'Collapse this section':'Expand this section'}>
        Team Capacity <span className="tcaret">{openSections.teams?'▾':'▸'}</span>
      </button>
      {openSections.teams && <div className="grid">
        {cards.map(t=>{
          const wk=wkOf(t), noCap=wk===0, full=fullCapOf(t), d=demandOf(t);
          const progs = progsOf(t), canEdit = canEditSplits;
          const cap = full*usableOf(t);                  // the same 70% of a holiday-adjusted quarter
          const ppl = peopleOf(t), fte = fteOf(t);
          // Percentage and colour run off full capacity; "remaining" and the
          // reduction still measure against the 70% allowance, which is the
          // number a lead actually plans to.
          const series = selWeeks.map(w=>membersOf(t).reduce((a,m)=>a+((weeklyByTeam.get(m)||new Map()).get(w)||0), 0));
          const weekCaps = weekBuckets.map(b=>weekCapOf(t,b));
          const ratios = series.map((h,i)=>weekCaps[i]>0 ? h/weekCaps[i] : 0);
          const peakIdx = ratios.reduce((bi,v,i,arr)=>v>arr[bi]?i:bi, 0);
          const peakU = (noCap||!series.length) ? null : ratios[peakIdx];
          const uQ = noCap? null : d/full;
          // Top of the chart is 100%, or the peak when it exceeds — plus a tenth of
          // headroom so the tallest bar never crowds the text above it.
          const wkScale = Math.max(1, peakU||0) * 1.1;
          const pinIdx = (pinnedWk.get(t.n)!=null && pinnedWk.get(t.n)<series.length) ? pinnedWk.get(t.n) : null;
          const u = (pinIdx!=null && !noCap) ? ratios[pinIdx] : uQ;
          const bnd = (u==null)?'grey':band(u);
          const rem = cap-d, red = d>cap? d-cap : 0;
          const tagCls = noCap?'t-grey':(bnd==='red'?'t-red':bnd==='amber'?'t-amber':'t-green');
          const tagTxt = noCap?'No capacity set':(bnd==='red'?'Over threshold':bnd==='amber'?'Approaching':'Healthy');
          const isCol = collapsed.has(t.n);
          return (
            <div className={'team'+(isCol?' collapsed':'')+(t.parts?' combo':'')} key={t.n}>
              <div className="top">
                <button className="thead" onClick={()=>toggleCollapse(t.n)}
                  onContextMenu={e=>{ e.preventDefault(); setMenu({x:e.clientX, y:e.clientY}); }}
                  title={(isCol?'Expand this team':'Collapse this team')+' · right-click for all teams'}>
                  <span className="tname">{t.n}</span>
                  <span className="thead-r">
                    {isCol && <span className="thead-pct" style={{color:noCap?'#aaa':BC[bnd]}}>{u==null?'—':pct(u)+'%'}</span>}
                    <span className="tcaret">{isCol?'▸':'▾'}</span>
                  </span>
                </button>
                {!isCol && <>
                {t.parts && <div className="combo-of">{t.members.join(' + ')}</div>}
                <div className="urow">
                  <div className="ubig" style={{color:noCap?'#aaa':BC[bnd]}}>{u==null?'—':pct(u)+'%'}</div>
                  {diagnosis.get(t.n)
                    ? <span className="tagwrap">
                        <span className={'tag '+tagCls+' has-tip'}>{tagTxt}</span>
                        <span className="tip">{diagnosis.get(t.n)}</span>
                      </span>
                    : <span className={'tag '+tagCls}>{tagTxt}</span>}
                </div>
                <div className="ucap">
                  {pinIdx!=null
                    ? 'Week of '+dayRange(weekSpans[pinIdx][0], weekSpans[pinIdx][1])+' · quarter average '+(uQ==null?'—':pct(uQ)+'%')
                    : (hasDates && !series.length ? 'No dated work in this selection' : 'Quarter average')}
                </div>
                {hasDates && series.length>0 && <WeekChart
                  weeks={selWeeks} spans={weekSpans} widths={weekWidths}
                  series={series} caps={weekCaps} noCap={noCap}
                  pinned={pinIdx} scale={wkScale}
                  onPick={i=>pickWeek(t.n,i)}/>}
                {(()=>{
                  const sizes = sizeBreakdownOf(t);
                  if(!sizes.length) return null;
                  const n = sizes.reduce((a,r)=>a+r.progs.size, 0);
                  const h = sizes.reduce((a,r)=>a+r.hrs, 0);
                  const share = v => noCap ? '—' : (v>0 && v/full<0.005 ? '<1%' : pct(v/full)+'%');
                  return <table className="sizes" title="% is of this team's capacity for the selected period, so the rows add up to the quarter figure">
                    <thead><tr><th>Size</th><th className="n">Programmes</th><th className="n">Hours</th><th className="n">%</th><th/></tr></thead>
                    <tbody>
                      {sizes.map(r=>(
                        <tr key={r.size}>
                          <td>{r.size==='—' ? <span className="nosz">No size</span> : <span className="szt">{r.size}</span>}</td>
                          <td className="n">{r.progs.size}</td>
                          <td className="n">{fmt(r.hrs)}</td>
                          <td className="n">{share(r.hrs)}</td>
                          <td className="sbar">{!noCap && <span className="strack"><i style={{width:Math.min(100, r.hrs/full*100)+'%', background:BC[bnd==='grey'?'green':bnd]}}/></span>}</td>
                        </tr>
                      ))}
                      <tr className="tot"><td>Total</td><td className="n">{n}</td><td className="n">{fmt(h)}</td>
                        <td className="n" style={{color:noCap?'inherit':BC[band(h/full)]}}>{share(h)}</td><td/></tr>
                    </tbody>
                  </table>;
                })()}
                </>}
              </div>
              {!isCol && <div className="metrics">
                <div><div className="k">Working hrs / quarter {holidays?'(net of holidays)':'(100%)'}</div><div className="v">{fmt(full)}</div></div>
                <div><div className="k">Usable / quarter (70%)</div><div className="v">{fmt(cap)} <small>hrs</small></div></div>
                <div><div className="k">Submitted hrs</div><div className="v">{fmt(d)}</div></div>
                <div><div className="k">Hrs remaining</div><div className="v" style={{color:rem<0?'var(--red)':'inherit'}}>{fmt(rem)}</div></div>
                <div><div className="k">Reduction to hit 70%</div><div className="v" style={{color:red>0?'var(--red)':'var(--green)'}}>{red>0?fmt(red)+' hrs':'None'}</div></div>
                <div><div className="k">Working hrs / week{split?' (avg)':''}</div><div className="v">{fmt(wk)} <small>/ 70%: {fmt(wk*usableOf(t))}</small></div></div>
              </div>}
              {!isCol && ppl && <div className="pfoot">
                <div className="prow">
                  <button className="pcount" onClick={()=>toggleTeam(t.n)}
                    title={ppl.length ? 'Show the people in this team' : 'No one is linked to this team'}>
                    {fmtHeads(fte)} {Math.abs(fte-1)<0.05?'person':'people'}
                    <span>{openTeams.has(t.n)?'▾':'▸'}</span>
                  </button>
                  {progs.length>0 && <button className="pcount" onClick={()=>toggleProgs(t.n)}
                    title="Programmes this team is assigned to in the selected quarter">
                    {progs.length} programme{progs.length===1?'':'s'}
                    <span>{openProgs.has(t.n)?'▾':'▸'}</span>
                  </button>}
                  <a className="pgo" href={PEOPLE_PAGE} target="_blank" rel="noopener noreferrer">People ↗</a>
                </div>
                {openProgs.has(t.n) && <ul className="plist">
                  {progs.map(pp=>(
                    <li key={pp.id||pp.name} className="prog">
                      <a href={pp.id?programUrl(pp.id):PROGRAM_PAGE} target="_blank" rel="noopener noreferrer">{pp.name}</a>
                      {pp.size && <span className="szt">{pp.size}</span>}
                      <span className="wk-h">{fmt(pp.hrs)} hrs</span>
                    </li>
                  ))}
                </ul>}
                {openTeams.has(t.n) && (
                  ppl.length
                    ? <ul className="plist">
                        {ppl.map(pp=>(
                          <li key={pp.id} className={pp.leader?'lead':'pp'}>
                            <a href={personUrl(pp.id)} target="_blank" rel="noopener noreferrer">{pp.name}</a>
                            {pp.leader && <span className="leadtag">not counted in capacity</span>}
                            {!pp.leader && (canEdit && personById.has(pp.id)
                              ? <button className="sharetag" aria-expanded={editing===t.n+'|'+pp.id}
                                  onClick={()=>setEditing(editing===t.n+'|'+pp.id ? null : t.n+'|'+pp.id)}
                                  title={shareTitle(pp)+' Click to change their splits.'}>
                                  {shareLabel(pp)}</button>
                              : <span className="sharetag" title={shareTitle(pp)}>{shareLabel(pp)}</span>)}
                          </li>
                        ))}
                      </ul>
                    : <div className="pnone">No people linked — that is why capacity is 0.</div>
                )}
                {openTeams.has(t.n) && canEdit && editing && editing.startsWith(t.n+'|')
                  && personById.has(editing.slice(t.n.length+1)) && (()=>{
                  const pid = editing.slice(t.n.length+1);
                  return <AssignEditor
                    key={pid}
                    person={personById.get(pid)}
                    cardTeam={t.n}
                    rows={(assignments||[]).filter(a=>a.person===pid)
                      .sort((a,b)=>(a.s??-Infinity)-(b.s??-Infinity) || a.team.localeCompare(b.team))}
                    teamOptions={teamOptions}
                    table={asgTable}
                    defaults={editDefaults}
                    onClose={()=>setEditing(null)}/>;
                })()}
              </div>}
            </div>
          );
        })}
      </div>}

      {menu && <>
        <div className="menu-ov" onClick={()=>setMenu(null)}
          onContextMenu={e=>{ e.preventDefault(); setMenu(null); }}/>
        <div className="menu" style={{left:menu.x, top:menu.y}}>
          <button onClick={()=>{ setCollapsed(new Set()); setMenu(null); }}>Expand all teams</button>
          <button onClick={()=>{ setCollapsed(new Set(cards.map(t=>t.n))); setMenu(null); }}>Collapse all teams</button>
        </div>
      </>}

      {undated && undated.progs.length>0 && <>
        <button className="st st-toggle" onClick={()=>toggleSection('nodate')}
          title={openSections.nodate?'Collapse':'Expand'}>
          Missing work dates <span className="tcaret">{openSections.nodate?'▾':'▸'}</span>
        </button>
        {openSections.nodate && <>
          <div className="ctx">
            <b>{fmt(undated.total)} hrs</b> across <b>{undated.progs.length}</b> programme{undated.progs.length===1?'':'s'}
            {' '}have a missing or backwards work date, so they cannot be placed in a week and are counted
            nowhere above. The <b>Issue</b> column says which one. Fill it and they appear —
            no reload needed.
          </div>
          <div className="chips">
            {undated.teams.map(([coe,h])=>(
              <span className="chip" key={coe}>{coe} <b>{fmt(h)}</b> hrs</span>
            ))}
          </div>
          <table>
            <thead><tr><th>Programme</th><th className="num">Hours</th><th>Issue</th><th>Teams waiting</th></tr></thead>
            <tbody>
              {undated.progs.map(pr=>(
                <tr key={pr.id||pr.name}>
                  <td>{pr.id
                    ? <a className="plain" href={programUrl(pr.id)} target="_blank" rel="noopener noreferrer">{pr.name} ↗</a>
                    : pr.name}</td>
                  <td className="num">{fmt(pr.hrs)}</td>
                  <td>{[...pr.miss].sort().map(m=>(
                    <span className="miss" key={m}>{m==='both'?'Est. Work start + end':m==='order'?'Work end before start':'Est. Work '+m}</span>
                  ))}</td>
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
