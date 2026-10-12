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

## Source coverage and chart inspection

The daily command always passes `--all`: stage, all four supply components,
both reservoir elevations, both instantaneous USGS flows, drought, both USGS
daily-mean comparisons, and NOAA's seven-day forecast are checked each day.
Each station and reservoir validates independently. Supply components and total
remain a consistent batch, and NOAA's locations and image must share one cycle.
The snapshot's `refreshReport` and durable daily record's `sourceChecks` list
each value, previous value, observation date, check outcome and error reason,
plus daily-mean coverage and each named NOAA location's rainfall band.

If direct City requests are blocked, Codex can retrieve the actual three public
City pages with its web tool before the permitted update. Save verbatim relevant
page sections (including official dates, supply components/total and both lake
full-pool references) as an input JSON file with `pages` entries containing
`url`, `retrievedAt` (ISO UTC retrieval time), and `text`, then run:

```bash
node scripts/cache-city-sources.mjs /absolute/path/to/official-page-evidence.json
```

This creates an immutable, hashed evidence record under the Git common directory
at `durham-water-source-evidence/YYYY-MM-DD.json`. The fallback accepts only
those exact official City URLs, the current Eastern date, and retrievals less
than two hours old. Normal parsers, observation-date checks, change limits and
publication validation still apply. It does not turn an older City observation
into today's reading. Missing, expired or rejected evidence retains labeled
last-known-good data. Earlier evidence records remain for diagnosis.

Native trend charts support hover, tap and keyboard arrow keys, Home/End and
Escape. Tooltips include the full date/year, exact elevation and distance from
full pool, supply days, and both current and historical weekly flows with their
actual observation ranges and sample counts. Gaps remain missing observations.
The City's prior-year chart images remain images; exact values are available
only where the project holds verified numeric readings.

## Ten-year river-flow average

River charts show a seasonal ten-year average alongside current-year flow and
the full-record USGS historical mean. For 2026 the window is January 1, 2016
through December 31, 2025: the current year is excluded. Each calendar date
averages available official USGS daily means across that window. The chart then
averages those calendar-date means into its displayed weeks. Hover labels name
the actual decade and contributing sample-year range; leap days use only leap
years. Missing observations are excluded rather than treated as zero or filled
in. Provisional historical values are disclosed and may be revised by USGS.

The percentage comparison uses the ten-year means for the exact dates with
current-year observations, so a partial week does not compare against unobserved
dates. If a verified decade is unavailable, it uses the labeled full-record
historical mean. Each station's decade refresh runs independently of current
and full-record retrievals, preserving a labeled last-known-good decade after a
failure without relabeling its year range. Daily reports include this source's
window, coverage, provisional count and retrieval outcome.

The current verified City supply archive and reservoir image charts do not
provide a ten-year numeric series for those plots. Their displayed readings and
official prior-year traces remain available without estimating an average from
image pixels.
