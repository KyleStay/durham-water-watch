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

The visible correction-contact placeholder must be replaced before a public
launch.
