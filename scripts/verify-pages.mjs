import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { requiredPublishedFiles, sha256, validatePagesManifest } from "./pages-artifact.mjs";

export const defaultPagesUrl = "https://kylestay.github.io/durham-water-watch/";

export async function verifyPublishedPages({
  root = resolve(import.meta.dirname, ".."),
  baseUrl = defaultPagesUrl,
  fetchImpl = fetch,
  attempts = 24,
  requestTimeoutMs = 10_000,
  retryDelayMs = 5_000,
  sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms)),
} = {}) {
  const manifest = await validatePagesManifest({ root, pagesRoot: resolve(root, "pages-dist") });
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      for (const path of requiredPublishedFiles) {
        const response = await fetchImpl(new URL(path, baseUrl), {
          cache: "no-store",
          signal: AbortSignal.timeout(requestTimeoutMs),
        });
        if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
        const body = Buffer.from(await response.arrayBuffer());
        const expected = manifest.files[path];
        if (!expected || body.byteLength !== expected.bytes || sha256(body) !== expected.sha256) {
          throw new Error(`${path} does not match the validated artifact`);
        }
      }
      console.log(`Verified ${requiredPublishedFiles.length} published files against the validated artifact.`);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(retryDelayMs);
    }
  }
  throw new Error(`GitHub Pages did not converge after ${attempts} attempts: ${lastError.message}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await verifyPublishedPages();
}
