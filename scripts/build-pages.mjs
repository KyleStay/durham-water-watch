import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "pages-dist");
const workerUrl = pathToFileURL(resolve(root, "dist/server/index.js"));
workerUrl.searchParams.set("pages-build", Date.now().toString());

const { default: worker } = await import(workerUrl.href);
const response = await worker.fetch(
  new Request("https://example.invalid/", { headers: { accept: "text/html" } }),
  {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  },
  {
    waitUntil() {},
    passThroughOnException() {},
  },
);

if (!response.ok) {
  throw new Error(`Static render failed with HTTP ${response.status}`);
}

let html = await response.text();
html = html
  // vinext emits asset paths in links, the hydration import, and serialized
  // RSC data. Every one must be relative for a GitHub Pages project site.
  .replaceAll('/assets/', './assets/')
  .replaceAll('href="/og.png"', 'href="./og.png"')
  .replaceAll('content="/og.png"', 'content="./og.png"');

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(resolve(root, "dist/client"), output, { recursive: true });
await writeFile(resolve(output, "index.html"), html);
await writeFile(resolve(output, "404.html"), html);
await writeFile(resolve(output, ".nojekyll"), "");

const built = await readFile(resolve(output, "index.html"), "utf8");
if (!built.includes("Unofficial independent community dashboard")) {
  throw new Error("Static HTML is missing the required unofficial framing");
}
if (!built.includes("./assets/")) {
  throw new Error("Static HTML did not receive relative GitHub Pages asset paths");
}
if (/(?:["'(=:]|\\")\/assets\//.test(built)) {
  throw new Error("Static HTML still contains root-relative asset paths");
}

console.log(`GitHub Pages artifact ready: ${output}`);
