import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

export const manifestName = ".durham-water-manifest.json";
export const requiredPublishedFiles = [
  "index.html",
  "data/dashboard.json",
  "data/history.json",
  "data/streamflow-history.json",
];

export function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

async function listFiles(directory, base = directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(path, base));
    else if (entry.isFile()) files.push(relative(base, path).split("\\").join("/"));
  }
  return files.sort();
}

async function hashFiles(root, paths) {
  return Object.fromEntries(await Promise.all(paths.map(async (path) => {
    const content = await readFile(resolve(root, path));
    return [path, { bytes: content.byteLength, sha256: sha256(content) }];
  })));
}

export function trackedFiles(root) {
  const result = spawnSync("git", ["ls-files", "-z"], { cwd: root, encoding: "buffer" });
  if (result.status !== 0) throw new Error("Cannot list tracked build inputs");
  return result.stdout.toString("utf8").split("\0").filter(Boolean).sort();
}

export async function createPagesManifest({ root, pagesRoot }) {
  const artifactPaths = (await listFiles(pagesRoot)).filter((path) => path !== manifestName);
  for (const path of requiredPublishedFiles) {
    if (!artifactPaths.includes(path)) throw new Error(`Pages artifact is missing ${path}`);
  }

  const inputPaths = trackedFiles(root);
  const manifest = {
    schemaVersion: 1,
    validationCommand: "npm test",
    inputs: await hashFiles(root, inputPaths),
    files: await hashFiles(pagesRoot, artifactPaths),
  };
  await writeFile(resolve(pagesRoot, manifestName), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export async function validatePagesManifest({ root, pagesRoot }) {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(resolve(pagesRoot, manifestName), "utf8"));
  } catch (error) {
    throw new Error(`Pages artifact has no valid ${manifestName}: ${error.message}`);
  }
  if (manifest.schemaVersion !== 1 || manifest.validationCommand !== "npm test") {
    throw new Error("Pages artifact manifest was not produced by the supported validation workflow");
  }

  const artifactPaths = (await listFiles(pagesRoot)).filter((path) => path !== manifestName);
  if (JSON.stringify(artifactPaths) !== JSON.stringify(Object.keys(manifest.files).sort())) {
    throw new Error("Pages artifact files differ from the validated manifest");
  }
  const currentFiles = await hashFiles(pagesRoot, artifactPaths);
  if (JSON.stringify(currentFiles) !== JSON.stringify(manifest.files)) {
    throw new Error("Pages artifact content differs from the validated manifest");
  }

  const inputPaths = trackedFiles(root);
  if (JSON.stringify(inputPaths) !== JSON.stringify(Object.keys(manifest.inputs).sort())) {
    throw new Error("Tracked build inputs differ from the validated manifest");
  }
  const currentInputs = await hashFiles(root, inputPaths);
  if (JSON.stringify(currentInputs) !== JSON.stringify(manifest.inputs)) {
    throw new Error("Tracked build input content changed after validation");
  }
  return manifest;
}
