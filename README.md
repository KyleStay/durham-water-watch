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

The scheduled Codex task runs at 6:00 AM America/New_York time. This Mac must be
on and Codex must be running. GitHub Actions and Sites do not refresh or publish
this dashboard.

Run the read-only `npm run daily:preflight` before requesting network permission for the single
`npm run daily:update` invocation. Preflight requires clean `main`, installed
dependencies, no active owned lock, and no command attempt for today's Eastern
calendar date. Automation memory also counts a blocked preflight or denied
permission as today's attempt. Neither failure nor success schedules another
attempt that day; the next run remains 6:00 AM the following day.

The updater takes an exclusive repository lock, fetches and fast-forwards from
`origin/main`, then refreshes and validates a detached candidate worktree under
the Git common directory. Installed dependencies are shared through a symlink.
It permits changes only to the three public JSON snapshots, NOAA rainfall image,
and `data/quarantine.json`. Build/tests, lint, TypeScript, and artifact manifest
checks must pass before snapshots can advance `main`. The manifest records
hashes and byte counts for every artifact file and tracked build input. Main is
checked again before advancement; concurrent user edits or a changed HEAD stop
the update and are preserved.

Only changed snapshot files are committed and pushed to `main`. The publisher
rejects a missing, stale, or modified manifest, pushes the validated artifact to
`gh-pages` without force, then compares the live HTML and all three JSON files
and NOAA rainfall image with the tested bytes. Verification has both a retry
limit and a fifteen-minute total budget while GitHub Pages caches expire. Git
transport failures retry at most three times inside the same invocation;
permission, authentication, and non-fast-forward failures stop. Commands have
timeouts, and interruption terminates the updater's child process groups.

Each invocation reserves `.git/durham-water-daily-attempts/YYYY-MM-DD.json`
before preflight. It records the failing phase, source result, candidate path,
source commit, and exact verification outcome. Failed candidates remain under
`.git/durham-water-runs/` for diagnosis. Validation failures leave `main` clean
and unchanged. If source push or publication fails, any already validated
snapshot commit remains on clean `main`, and the next day's fresh run can
finish publication. The updater never stashes, resets, force-pushes, or adopts
unvalidated failed candidates. Successful candidates are removed without force;
cleanup failure preserves them and reports a warning after verified publication.

Locks record their local owner PID and child process groups. Only a known local
lock whose owner and all recorded groups are proven gone can be accepted by
preflight and archived during permitted updater acquisition; its evidence is preserved. Active, foreign, malformed, legacy, or
ambiguous locks (including an interrupted, unconfirmed child launch) remain blocking and require inspection. No unknown lock is
cleared to make the job pass.

For an existing failed snapshot, repair the cause and run the normal validations
before explicitly committing and publishing that preserved snapshot. This is a
user-directed repair, not a second source refresh. Do not rerun the daily command
or invent observations for a skipped date.

The daily ledger is a permanent archive. City values appear under the official
observation date, even when Durham publishes them later. Missing values remain
missing, and retained or quarantined readings do not become new observations
for the run date. The version 3 migration rebuilt known City observations from
archived City pages and earlier dashboard commits. Each migrated value records
its source URL, verification time, and evidence note. Corrections can be filed
through the dashboard's GitHub Issues link.
