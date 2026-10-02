import assert from "node:assert/strict";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the resident-facing dashboard without JavaScript", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>Durham Water Watch<\/title>/i);
  assert.match(html, /Unofficial independent community dashboard/);
  assert.match(html, /Stage \/ Etapa/);
  assert.match(html, /Daily snapshot record/);
  assert.match(html, /Exact daily values/);
  assert.match(html, /Today and previous days/);
  assert.match(html, /How have conditions changed/);
  assert.ok(html.indexOf("Reservoirs: how far below full?") < html.indexOf("Supply: is the estimate rising or falling?"));
  assert.ok(html.indexOf("Supply: is the estimate rising or falling?") < html.indexOf("River flow: is this typical for the season?"));
  assert.ok(html.indexOf("River flow: is this typical for the season?") < html.indexOf("No landscape spray irrigation"));
  assert.match(html, /Historical daily mean/);
  assert.match(html, /usual seasonal pattern through December/);
  assert.match(html, /gaps mean no observation/);
  assert.match(html, /no long-term supply average/);
  assert.match(html, /USGS daily means appear where available/);
  assert.match(html, /Official City guidance always takes precedence/);
  assert.match(html, /What to do now/);
  assert.match(html, /Español/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("renders authoritative direct links and no reservoir percentages", async () => {
  const response = await render();
  const html = await response.text();
  assert.match(html, /https:\/\/www\.durhamnc\.gov\/1214\/Current-Data/);
  assert.match(html, /https:\/\/www\.durhamnc\.gov\/1225\/Lake-Levels/);
  assert.match(html, /https:\/\/www\.ncdrought\.org\//);
  assert.match(html, /02085500/);
  assert.match(html, /0208521324/);
  assert.match(html, /Where rain can feed Durham’s reservoirs/);
  assert.match(html, /webgis\.durhamnc\.gov\/server\/rest\/services\/PublicServices\/Planning\/MapServer\/3/);
  assert.match(html, /The purple M\/LR protection areas/);
  assert.match(html, /World_Topo_Map\/MapServer/);
  assert.match(html, /Interactive watershed and rainfall map/);
  assert.match(html, /Full screen/);
  assert.match(html, /Drag to explore/);
  assert.match(html, /Forecast rainfall for the next 7 days/);
  assert.match(html, /NOAA 7-day rainfall forecast/);
  assert.match(html, /forecast bands, not measured rainfall/);
  assert.match(html, /Zoom in on the watershed map/);
  assert.match(html, /Zoom out on the watershed map/);
  assert.match(html, /Reset view/);
  assert.doesNotMatch(html, /percent full|% full/i);
});
