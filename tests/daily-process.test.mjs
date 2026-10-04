import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  assertOnlySnapshotChanges,
  parseNullPaths,
  parsePorcelainPaths,
  snapshotPaths,
} from "../scripts/daily-update.mjs";
import { createPagesManifest, requiredPublishedFiles } from "../scripts/pages-artifact.mjs";
import { publishPages } from "../scripts/publish-pages.mjs";
import { verifyPublishedPages } from "../scripts/verify-pages.mjs";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "durham-water-process-test-"));
  const pagesRoot = resolve(root, "pages-dist");
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  await writeFile(resolve(root, "source.txt"), "validated input\n");
  execFileSync("git", ["add", "source.txt"], { cwd: root });
  for (const path of requiredPublishedFiles) {
    await mkdir(resolve(pagesRoot, path, ".."), { recursive: true });
    await writeFile(resolve(pagesRoot, path), `${path}\n`);
  }
  const manifest = await createPagesManifest({ root, pagesRoot });
  return { root, pagesRoot, manifest };
}

test("snapshot allowlist rejects unrelated refresh edits", () => {
  assert.deepEqual(parseNullPaths("public/data/dashboard.json\0data/quarantine.json\0"), [
    "public/data/dashboard.json",
    "data/quarantine.json",
  ]);
  assert.deepEqual(parsePorcelainPaths(" M public/data/dashboard.json\0?? data/quarantine.json\0"), [
    "public/data/dashboard.json",
    "data/quarantine.json",
  ]);
  assert.doesNotThrow(() => assertOnlySnapshotChanges(snapshotPaths));
  assert.throws(() => assertOnlySnapshotChanges(["README.md"]), /outside the snapshot allowlist/);
  assert.throws(() => parsePorcelainPaths("R  old.json\0new.json\0"), /may not rename/);
});

test("publisher rejects a network probe failure instead of treating it as a missing branch", async () => {
  const { root } = await fixture();
  const commands = [];
  const run = (command, args) => {
    commands.push([command, ...args]);
    if (args[0] === "remote") return { status: 0, stdout: "https://example.invalid/repo.git\n" };
    if (args[0] === "ls-remote") return { status: 128, stdout: "", stderr: "network failed" };
    throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
  };
  try {
    await assert.rejects(publishPages({ root, run }), /Cannot determine whether origin\/gh-pages exists/);
    assert.equal(commands.some((command) => command[1] === "init"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("publisher rejects an artifact after a tracked build input changes", async () => {
  const { root } = await fixture();
  try {
    await writeFile(resolve(root, "source.txt"), "changed after tests\n");
    await assert.rejects(publishPages({ root }), /Tracked build input content changed after validation/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("publisher validates the copied artifact and pushes exact files to a local Pages branch", async () => {
  const { root, pagesRoot } = await fixture();
  try {
    const remote = resolve(root, "origin.git");
    execFileSync("git", ["init", "--quiet", "--bare", remote]);
    execFileSync("git", ["remote", "add", "origin", remote], { cwd: root });
    const result = await publishPages({ root });
    assert.equal(result.changed, true);
    for (const path of requiredPublishedFiles) {
      const actual = execFileSync("git", ["--git-dir", remote, "show", `gh-pages:${path}`]);
      assert.deepEqual(actual, await readFile(resolve(pagesRoot, path)));
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("remote verification outlasts the Pages cache and compares exact bytes", async () => {
  const { root, pagesRoot } = await fixture();
  const expected = Object.fromEntries(await Promise.all(requiredPublishedFiles.map(async (path) => [
    path,
    await readFile(resolve(pagesRoot, path)),
  ])));
  const staleAttempts = 121; // More than 10 minutes at the default five-second retry interval.
  let requestCount = 0;
  let sleeps = 0;
  const fetchImpl = async (url) => {
    requestCount += 1;
    const path = new URL(url).pathname.replace("/durham-water-watch/", "");
    const body = requestCount <= staleAttempts ? Buffer.from("old deployment\n") : expected[path];
    return new Response(body, { status: 200 });
  };
  try {
    await verifyPublishedPages({
      root,
      fetchImpl,
      sleep: async () => { sleeps += 1; },
    });
    assert.equal(sleeps, staleAttempts);
    assert.equal(requestCount, requiredPublishedFiles.length + staleAttempts);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("live verification has a total time budget and cancellation stops retries", async () => {
  const { root } = await fixture();
  let stamp = 0, calls = 0;
  try {
    await assert.rejects(verifyPublishedPages({ root, maxDurationMs: 50, retryDelayMs: 5,
      now: () => stamp,
      sleep: async (ms) => { stamp += ms; },
      fetchImpl: async () => { stamp += 10; calls += 1; return new Response("old deployment"); },
    }), /did not converge within/);
    assert.ok(calls < 10);
    const controller = new AbortController();
    await assert.rejects(verifyPublishedPages({ root, signal: controller.signal,
      fetchImpl: async () => { controller.abort(new Error("cancel readback")); throw controller.signal.reason; },
      sleep: async () => { throw new Error("Must not retry cancellation"); },
    }), /cancel readback/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
