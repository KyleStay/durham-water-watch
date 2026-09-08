Durham Water Watch audit, September 8, 2026

The daily task is publishing successfully, but its failure handling and the dashboard's freshness claims need correction. This audit inspected commit `23bb813`, the scheduled task configuration, the two latest run reports, the live GitHub Pages site, the refresh and publication scripts, and the tests. Application code, snapshots, and automation settings were not changed.

Verified results

- The task `Refresh Durham Water Watch from Codex` is active and scheduled daily at 8:00 AM. It targets `Automate daily data publishing` in this workspace.
- The September 7 and September 8 runs completed. Today's report records source commit `23bb813` and deployment commit `8c8edca`.
- The live homepage and all three public JSON endpoints returned HTTP 200. Each JSON response matched its local snapshot byte for byte.
- The ledger has 192 consecutive rows, March 1 through September 8. Current-year USGS daily means extend through September 7. Today's daily means are unavailable, as expected for an incomplete day.
- `npm test` passed all 21 tests, including the production and static builds. TypeScript passed with `npx tsc --noEmit --incremental false`. ESLint returned no errors and one image-optimization warning.
- The live page rendered and switched to Spanish. A repeated hydration error is described below.

Findings, in priority order

1. P1: Freshness labels remain frozen between publications.

   [Status](</Users/kyle/Documents/Durham water/app/water-watch.tsx:295>) displays the stored status directly. [WaterWatch](</Users/kyle/Documents/Durham water/app/water-watch.tsx:683>) uses the imported snapshot without recalculating its age. Only the refresh script updates freshness. Today's 7:15 AM and 7:45 AM USGS observations will therefore remain labeled fresh after the advertised three-hour limit, until the next build. A missed daily run also leaves stage verification labeled fresh indefinitely. The [methodology text](</Users/kyle/Documents/Durham water/app/water-watch.tsx:1217>) incorrectly promises USGS checks every 30 minutes, while the task runs once daily.

   Recalculate age from observation and verification timestamps when displaying metrics, including while a page stays open. Describe the actual daily cadence. Keep the publication timestamp visible for readers without JavaScript.

2. P1: The publication gate rejects supported fallback states and stage changes.

   The automation says to publish valid retained data after a partial source failure, but [the comparison test](</Users/kyle/Documents/Durham water/tests/pages-build.test.mjs:46>) requires every station to be fresh. I copied the artifact and test to a temporary directory, changed only Flat River's status to stale while retaining its data, and ran the targeted test. It failed with `stale !== fresh`. Thus an extended historical-feed outage blocks publication of otherwise valid current readings.

   The artifact and render tests also unconditionally require the Stage 2 explorer, although the application intentionally hides it when the verified stage changes. See [the artifact assertions](</Users/kyle/Documents/Durham water/tests/pages-build.test.mjs:21>) and [render assertions](</Users/kyle/Documents/Durham water/tests/rendered-html.test.mjs:35>). Separate fixed scenario tests from validation of the live snapshot. Validate preserved values, dates, and failure labels for stale or unavailable comparisons, and verify content appropriate to the actual stage.

3. P2: The daily record mixes capture dates with observation dates and loses delayed City readings.

   [Daily entry creation](</Users/kyle/Documents/Durham water/scripts/refresh-data.mjs:548>) writes City values under the run date if they pass the freshness threshold. It does not preserve their individual observation dates in that row. The September 3 row contains 185 days of supply, but that run's dashboard identified the observation as September 1. The current verified City reading is 183 days dated September 2, yet the existing September 2 ledger row remains null. The missing-date loop repairs only absent rows, so it never fills that known observation into an existing row.

   The page calls these exact daily readings and averages their values as verified readings. Repeated captures can therefore weight one official reading multiple times, while delayed readings can be absent entirely. Store observations by their source date, or explicitly retain capture-date snapshots with per-field observation dates and calculate trends from unique observations.

4. P2: The live page fails React hydration on initial load.

   The in-app browser logged React error 418 on the initial load and again after a reload. React defines this as a mismatch between server-rendered markup and the client, causing client regeneration. Spanish switching worked afterward, so this is not evidence that the page is unusable. The exact mismatching node was not isolated during this audit. The existing render tests inspect HTML strings and never exercise hydration. Add a browser smoke check that fails on hydration errors and diagnose the mismatch in a development build. [React's error explanation](https://react.dev/errors/418).

5. P2: The rolling ledger cap eventually breaks daily publication.

   [The refresh script](</Users/kyle/Documents/Durham water/scripts/refresh-data.mjs:600>) retains only the last 366 rows, but [the test](</Users/kyle/Documents/Durham water/tests/pages-build.test.mjs:72>) requires the first row to remain March 1, 2026. With uninterrupted daily rows, the first row advances to March 2, 2026 on March 2, 2027. The test then fails and the daily task refuses to publish. The coverage start also remains fixed, causing refresh to rebuild discarded dates before dropping them again. Decide whether this is a permanent archive or a rolling window, then align retention, coverage metadata, and tests.

6. P2: Dependency maintenance is overdue.

   The live npm advisory check reported 20 affected packages: 17 high, one moderate, and two low, with no critical entries. This counts affected packages, including transitive dependencies, rather than 20 independently demonstrated exploits. Direct packages flagged include Next, React Server DOM Webpack, Vinext, Vite, Wrangler, and the Cloudflare Vite plugin. The raw report is saved in [outputs/audit-2026-09-08/npm-audit.json](</Users/kyle/Documents/Durham water/outputs/audit-2026-09-08/npm-audit.json>).

   GitHub Pages serves static files, so server-function advisories do not establish a vulnerability in this public deployment. For example, the [React advisory](https://github.com/react/react/security/advisories/GHSA-wx67-qw84-cm4g) concerns crafted requests to server-function endpoints. Update the dependency set with build and browser verification, and review exposure separately if the server or Sites deployment is used. No dependency versions were changed during this audit.

7. P3: Published copy still contains unfinished or misleading text.

   The [corrections address](</Users/kyle/Documents/Durham water/app/water-watch.tsx:184>) is still `corrections@example.org`, with an instruction to replace it before launch. The live Recent direction message says no earlier verified reading exists even though the ledger contains many; its calculation only checks the latest two rows, which currently contain null supply values. Correct that message or compare the latest distinct verified observations. The annual comparison's raw freshness status and several source labels also remain English after switching to Spanish.

Daily task assessment

The saved prompt has useful safeguards: synchronize without discarding local work, check every source, retain verified values, run tests before publishing, commit snapshot changes, and publish the built artifact directly to `gh-pages`. The latest two reports additionally checked the served data date, which is stronger than the prompt's minimum HTTP-success check. Make that content verification an explicit requirement so an older cached deployment cannot count as success.

The task depends on this Mac and its local workspace. Official documentation says local scheduled tasks require the computer on and the app running. That is an operating dependency, not proof that the scheduler failed. [Scheduled task documentation](https://learn.chatgpt.com/docs/automations?surface=app). The September 4 row is marked `missed-run-backfill`; this audit did not establish why that run was missed.

Durham's current supply and reservoir snapshots are dated September 2 and correctly marked stale in today's publication. Their age is distinct from the task's successful September 8 source checks. No new source refresh or publication was triggered for this audit.

Suggested repair order: fix fallback validation and freshness behavior first, correct the observation ledger, resolve hydration, then address retention, dependency updates, and copy. The current test suite passing is useful evidence for the normal path, but does not cover these failure and aging cases.

Repair follow-up, September 8, 2026

The findings above describe the original audited commit. The subsequent repair implements:

- Shared freshness rules in the refresh script and browser, minute-by-minute aging and visibility updates, a visible publication timestamp, and accurate daily-cadence copy.
- Scenario tests for stages 1–4 and unavailable stage, supported stale/unavailable USGS comparisons, and React hydration with language switching.
- Version 3 history with 134 recovered City field observations placed on official observation dates. Each populated City cell carries its source, observation date, verification date, and migration evidence. Missing City values remain null. The archive is permanent rather than capped at 366 rows.
- A hydration fix for split text children in SVG titles and descriptions, plus corrected GitHub Pages asset paths for the updated build toolchain.
- Updated dependencies; the September 8 post-update npm audit reports zero vulnerabilities.
- Corrected trend calculations, translated source/status labels, an active GitHub Issues corrections link, and a visible drought freshness badge.
- A guarded `npm run daily:update` workflow with an exclusive lock, clean-main requirement, fast-forward synchronization, snapshot allowlist, build/tests/lint/typecheck, artifact hashes, non-forced publication, and exact live HTML/JSON verification. Source requests have bounded retries; deployment verification retries during propagation.

The existing 8:00 AM daily automation now invokes this guarded command. It preserves local work, reports source failures, and cannot count an HTTP 200 or push alone as publication success. The Mac-on/Codex-running dependency remains.
