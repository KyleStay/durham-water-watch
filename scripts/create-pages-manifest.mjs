import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createPagesManifest } from "./pages-artifact.mjs";

export async function createManifestForRepository(root = resolve(import.meta.dirname, "..")) {
  await createPagesManifest({ root, pagesRoot: resolve(root, "pages-dist") });
  console.log("Recorded validated pages-dist manifest.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await createManifestForRepository();
}
