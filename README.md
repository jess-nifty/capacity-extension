# Capacity Overview — Airtable Interface Extension

A custom Airtable Interface Extension that renders the capacity dashboard (team cards, utilisation % with colour bands, Business Units table) reading **live** from the base — Accepted and Business-critical hours are real, and test programs are excluded automatically.

- **Base:** `appE8STdMZa2kq9eb`
- **Entry point:** `frontend/index.jsx`

## Repo contents
```
capacity-overview-extension/
├── block.json          # points the CLI at frontend/index.jsx
├── package.json        # deps: @airtable/blocks, react, react-dom
├── .gitignore
├── frontend/
│   └── index.jsx       # the whole extension (UI + data logic)
└── README.md
```

---

## 1. Put it on GitHub (account: jess-nifty)

Create an empty repo on GitHub first — go to https://github.com/new, owner **jess-nifty**, name **capacity-overview-extension**, keep it **empty** (no README/gitignore, since we already have them).

Then, from inside this folder:
```bash
git init
git add .
git commit -m "Initial commit: Capacity Overview interface extension"
git branch -M main
git remote add origin https://github.com/jess-nifty/capacity-overview-extension.git
git push -u origin main
```

> Prefer the GitHub CLI? With `gh` installed and logged in as jess-nifty, one line does it all:
> ```bash
> gh repo create jess-nifty/capacity-overview-extension --private --source=. --remote=origin --push
> ```

You now have the code stored and versioned. Commit + push as you build it out.

---

## 2. Wire it to Airtable (the Blocks CLI dev loop)

**Prerequisites:** Node 22+, and a Personal Access Token with the `block:manage` scope (create at https://airtable.com/create/tokens).

```bash
npm install -g @airtable/blocks-cli
block set-api-key            # paste your PAT
```

**Get a blockId:** in the base, open **Extensions → Build a custom extension → Interface Extension → Start from scratch**. Airtable gives you a `blkXXXXXXXX` id. Then link this repo to it:
```bash
npm install
block init appE8STdMZa2kq9eb/blkXXXXXXXX --template=none    # or: block add-remote
block run                                                   # local dev server, hot reload
```
In an Interface, add a **Custom (blank) layout**, open its settings, click **`</> Develop`**, and load the local server URL to see your live version.

**Ship it:**
```bash
block release
```

### Add data sources (required)
The extension only sees tables/fields the interface exposes. On the page, add these as data sources with the referenced fields visible:
- **CoE** — Name, `Working hours per week Rollup`, `70% working hours per week Rollup`
- **Program CoE Allocation** — CoE link, `Submitted hours required`, `Accepted total hours`, Program link, `Program In Market Start Date`
- **Programs** — `Owning Business Unit`, `Testing Programs`, `Is this Business Critical?`

Field IDs are hard-coded (stable) at the top of `frontend/index.jsx` — only edit if a field is recreated.

---

## Alternative: no-CLI paste via Omni
If you just want it live fast without the CLI: in Omni, **Tools → Generate an Interface element**, then **Edit Source** and paste the contents of `frontend/index.jsx`. (This won't version-control it in your repo — use the CLI route above for that.)

---

## Notes on the numbers
- Capacity = usable weekly hours × 13 working weeks × number of selected quarters.
- Quarter is derived from the program's in-market date; programs with no BU / no in-market date sit outside the named BUs and quarter buckets.
- Making those fully exact is the "base additions" work: make `Owning Business Unit` required at intake, add a proper `Quarter` link, and quarter-scope the rollups. The extension already reads all of that correctly once it exists.
