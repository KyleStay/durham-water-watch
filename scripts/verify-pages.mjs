import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { requiredPublishedFiles, sha256, validatePagesManifest } from "./pages-artifact.mjs";

export const defaultPagesUrl = "https://kylestay.github.io/durham-water-watch/";

export async function verifyPublishedPages({
  root = resolve(import.meta.dirname, ".."),
  baseUrl = defaultPagesUrl,
  fetchImpl = fetch,
  // GitHub Pages caches HTML for 10 minutes; allow time for that cache to expire.
  attempts = 180,
  maxDurationMs = 15 * 60_000,
  requestTimeoutMs = 10_000,
  retryDelayMs = 5_000,
  signal,
  sleep = (ms) => delay(ms, undefined, { signal }),
  now = Date.now,
} = {}) {
  const manifest = await validatePagesManifest({ root, pagesRoot: resolve(root, "pages-dist") });
  let lastError;
  const deadline = now() + maxDurationMs;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    signal?.throwIfAborted();
    try {
      for (const path of requiredPublishedFiles) {
        const remaining = deadline - now();
        if (remaining <= 0) throw new Error("Live-content verification time budget expired");
        const response = await fetchImpl(new URL(path, baseUrl), {
          cache: "no-store",
          signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(Math.min(requestTimeoutMs, remaining))]) : AbortSignal.timeout(Math.min(requestTimeoutMs, remaining)),
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
      signal?.throwIfAborted();
      lastError = error;
      if (attempt === 1 || attempt % 12 === 0) console.log(`Waiting for GitHub Pages (${attempt}/${attempts}): ${error.message}`);
      if (now() >= deadline) break;
      if (attempt < attempts) await sleep(Math.min(retryDelayMs, deadline - now()));
    }
  }
  throw new Error(`GitHub Pages did not converge within ${attempts} attempts / ${maxDurationMs} ms: ${lastError.message}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await verifyPublishedPages();
}
