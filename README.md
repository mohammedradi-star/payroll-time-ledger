# Payroll time ledger

A personal dashboard for Time Doctor exports. It shows how much time you have tracked in the current payroll period, what is left, the daily pace you need, and estimates of the work-hour shortfall and idle time under the company HR policy.

Everything runs in the browser. **Reports you upload and entries you make are stored only in that browser** (`localStorage`). Nothing is sent to a server, and nothing is stored in this repository.

## Using it

1. In Time Doctor, export **Hours Tracked – Totals** and **Activity Summary** for the payroll period (21st to the 20th), for one person.
2. Open the site and choose **Upload Time Doctor exports**. Review the preview, confirm the person, and apply.
3. Add approved leave with **Add approved day off** (full day = 8h, half day = 4h, quarter day = 2h).
4. Check **Days off & holidays**. Egypt public holidays are applied automatically; when the cabinet announces a moved date, use **Move**.
5. Use **Settings → Export full backup** regularly. To move to another browser or device, export a backup there and restore it with **Upload**.

Coming from the Claude version of this dashboard? Open it, choose **Settings → Export full backup**, then upload that `.json` file here.

## Rules implemented

| Rule | Implementation |
|---|---|
| Payroll period | 21st of one month to the 20th of the next, labelled by the ending month |
| Workday | 8h of actual work, Sunday–Thursday (configurable, effective-dated) |
| Leave | 0.25 (2h), 0.5 (4h) or 1 (8h) day; only manager-approved leave |
| Public holidays | Built-in Egypt calendar through 2027; expected vs announced dates; move/remove/add |
| Shortfall (default) | Monthly total: required hours on completed workdays − all tracked hours (weekend hours count) |
| Shortfall (alternative) | Day by day: sum of each workday's gap to its required hours |
| Idle | Net idle = idle − meetings (floor 0); excess = net idle above 33% of tracked; ÷ 8h for days |
| No-assignment exception | Reported within one working day: that day's idle and meetings are excluded once |

All durations are integer seconds; rounding happens only for display. Estimates are for review, not payroll figures.

## Development

```bash
npm test        # 100+ checks on the calculation, import and holiday logic
npm run build   # writes dist/index.html (single self-contained file)
npm start       # build and serve locally
```

- `src/core.js` – pure calculation, CSV import, holiday and leave engine (no DOM)
- `src/ui.html` – the dashboard; `build.mjs` inlines the engine into `dist/index.html`
- `test/fixtures/` – **synthetic** reports only. Never add real exports; `.gitignore` blocks other CSV and JSON files.

## Deploying with GitHub Pages

The workflow in `.github/workflows/pages.yml` runs the tests, builds, and deploys on every push to `main`.
One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

Visibility: GitHub Pages sites are public on free plans, even from a private repository (Enterprise plans can restrict access). Your data still stays in your own browser, but anyone with the link can open the empty dashboard.

## Updating holidays

Add the next year's dates to `EG_HOLIDAYS` in `src/core.js` (status `expected` until the cabinet / Ministry of Labour confirms them), run `npm test`, and push.
