# Durham Water Watch

Durham Water Watch is an unofficial independent community dashboard for
Durham, North Carolina drinking-water reservoirs, drought conditions, and
current water-use rules.

The application:

- renders a resident-first English and Spanish overview;
- links every operational metric to an authoritative City, NC DMAC, or USGS source;
- stores verified last-known-good values in a versioned JSON snapshot;
- maintains one dated snapshot per day, including retained and quarantined-field labels;
- presents important values in a latest-first table and accessible trend charts;
- compares year-to-date USGS daily-mean streamflow with official day-of-year historical means;
- shows the City’s full-width annual reservoir charts for 2026 versus prior years;
- overlays clearly labeled tracked-period averages on total supply and distance-below-full charts;
- refreshes and validates official sources in a scheduled Codex job;
- produces a fully static artifact compatible with GitHub Pages;
- preserves last-known-good values and quarantines invalid, older, or implausible readings;
- treats drought classification, shortage response, elevation, and streamflow as distinct concepts.

Official City guidance always takes precedence.

## Local development

```bash
npm install
npm run dev
npm run build
npm run build:pages
npm test
```

`pages-dist/` is the complete GitHub Pages artifact. The daily Codex job checks
every official source, retries any stale or previously failed field, refreshes
the City-published chart images on each build, and publishes the artifact
directly to the `gh-pages` branch with `npm run publish:pages`. GitHub hosts that
branch but does not run the refresh or build.

## Daily publication

The scheduled Codex task runs at 8:00 AM America/New_York time. This Mac must be
on and Codex must be running. GitHub Actions and Sites do not refresh or publish
this dashboard.

Run `npm run daily:update` for the same guarded process by hand. It takes an
exclusive repository lock, requires a clean `main` worktree, fetches and
fast-forwards from `origin/main`, and runs the full source refresh. The process
stops if refresh changes anything except the three public snapshots and
`data/quarantine.json`. It then runs the build and tests, lint, and TypeScript
checks. The test command writes a manifest containing hashes and byte counts for
the artifact and all tracked build inputs.

Only changed snapshot files are committed and pushed to `main`. The publisher
rejects a missing, stale, or modified manifest, pushes the validated artifact to
`gh-pages` without force, then compares the live HTML and all three JSON files
with the built bytes. Verification retries for a bounded period while GitHub
Pages updates. A later run can safely finish publication after a source commit
or push succeeds and deployment fails. It never stashes or discards local work.

The daily ledger is a permanent archive. City values appear under the official
observation date, even when Durham publishes them later. Missing values remain
missing, and retained or quarantined readings do not become new observations
for the run date. The version 3 migration rebuilt known City observations from
archived City pages and earlier dashboard commits. Each migrated value records
its source URL, verification time, and evidence note. Corrections can be filed
through the dashboard's GitHub Issues link.
