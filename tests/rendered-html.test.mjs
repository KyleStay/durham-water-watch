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
  assert.match(html, /195/);
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
  assert.doesNotMatch(html, /percent full|% full/i);
});
