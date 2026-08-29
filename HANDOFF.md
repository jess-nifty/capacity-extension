# Handoff — build & ship the Capacity Overview Airtable Interface Extension

Paste this whole file into Claude Code (run it from inside the `capacity-extension` repo folder).

## Goal
Get the custom Airtable **Interface Extension** in `frontend/index.jsx` running, then published, on the interface page — so it renders live (team cards, utilisation %, colour bands, Business Units table, quarter + team filters). The code is already written; this is the build/link/run/release + data-source wiring.

## What's in this repo
- `frontend/index.jsx` — the entire extension (UI + data logic). Uses the **Interface Extensions SDK** (`@airtable/blocks/interface/ui`), entry point `initializeBlock({interface: () => <App />})`.
- `block.json` — `{"frontendEntry": "frontend/index.jsx"}`
- `package.json` — deps: `@airtable/blocks`, `react`, `react-dom`
- `README.md` — longer notes
- GitHub: **github.com/jess-nifty/capacity-extension** (already pushed)

## Base + IDs (hard-coded at the top of index.jsx — verify they still exist, don't change unless a field was recreated)
- **Base:** `appE8STdMZa2kq9eb`
- **CoE** table `tblM62hRfWTmZWM6y`: name `fldW71asl0CYBmoTo`, working-hrs/wk `fldKOGdC0wZqfDuiy`, 70% `fldvuSkFOY4yp6dUs`
- **Program CoE Allocation** table `tblqCfUqS0Uv9cAHY`: CoE link `fldQfjuOcQN3OEsqI`, Submitted hours `fldI3EvQkmFAnj6WN`, Accepted hours `fldokig5iBzBNFjyO`, Program link `fld86ciaUU28ftWCS`, In-market date lookup `fldeEJQsoSruTVgDD`
- **Programs** table `tblxbXHBPVWUeT0Ea`: Owning Business Unit `fldJmSYJeMYm9q4kb`, Testing Programs (checkbox) `fldgr5Knddb8qNG0V`, Is this Business Critical? (single-select) `fldfW60SpnS5OCaD2`

## Steps
1. `npm install -g @airtable/blocks-cli` (needs Node 22+).
2. `block set-api-key` — Jess pastes a Personal Access Token with the **`block:manage`** scope (create at airtable.com/create/tokens). *(Assistant: do not handle the token; have her type it.)*
3. Get a **blockId**: in the base → Extensions → Build a custom extension → Interface Extension → Start from scratch → copy the `blkXXXXXXXX`. (There's already a dev-mode element named **"test"** pointing at `https://localhost:9000` — you can reuse its block or make a new one.)
4. From this folder: `npm install`, then link + run:
   ```
   block init appE8STdMZa2kq9eb/blkXXXXXXXX --template=none   # or: block add-remote
   block run
   ```
   In the interface, add a **Custom (blank)** element, open its settings, and it should connect to the local dev server and render.
5. **Add data sources** to the element/page (required — the extension only sees what's exposed): **CoE**, **Program CoE Allocation**, **Programs**, with the fields above visible. If it shows an "add these tables as data sources" message, that's what's missing.
6. When it looks right: `block release` to publish for everyone. Commit any code changes back to the repo.

## Notes / gotchas
- If pasting into Airtable's Omni "Edit Source" instead of the CLI, drop the final `initializeBlock(...)` line if that scaffold expects just the component. For the CLI route, keep it as-is.
- The numbers: capacity = usable weekly hrs × 13 weeks × #selected quarters; test programs excluded; quarter derived from in-market date. Programs missing a BU or in-market date fall outside the named BUs / quarter buckets — making that fully exact is separate base work (required Owning BU, a Quarter link, quarter-scoped rollups), not needed to get the extension running.
