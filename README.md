# Durham Water Watch

Durham Water Watch is an unofficial independent community dashboard for
Durham, North Carolina drinking-water reservoirs, drought conditions, and
current water-use rules.

The application:

- renders a resident-first English and Spanish overview;
- links every operational metric to an authoritative City, NC DMAC, or USGS source;
- stores verified last-known-good values in a versioned JSON snapshot;
- refreshes and validates official sources in a scheduled GitHub Actions workflow;
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

`pages-dist/` is the complete GitHub Pages artifact. The included workflow
refreshes USGS data approximately every 30 minutes, checks dated Durham
readings daily, checks the weekly NC drought update, and deploys through the
official GitHub Pages Actions.

The visible correction-contact placeholder must be replaced before a public
launch.
