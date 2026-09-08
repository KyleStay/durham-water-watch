import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  assertOnlySnapshotChanges,
  dailyUpdate,
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

test("daily update releases its lock and does not fetch over a dirty worktree", async () => {
  const commands = [];
  let unlocked = false;
  const run = (command, args) => {
    commands.push([command, ...args]);
    if (args[0] === "branch") return { status: 0, stdout: "main\n" };
    if (args[0] === "status") return { status: 0, stdout: "?? notes.txt\n" };
    throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
  };
  await assert.rejects(dailyUpdate({
    root: "/unused",
    run,
    lock: async () => async () => { unlocked = true; },
  }), /requires a clean worktree/);
  assert.equal(unlocked, true);
  assert.equal(commands.some((command) => command[1] === "fetch"), false);
});

test("failed validation cannot commit, push, or publish", async () => {
  const commands = [];
  let statusCalls = 0;
  let published = false;
  const run = (command, args) => {
    commands.push([command, ...args]);
    if (command === "npm") return { status: 0, stdout: "" };
    if (args[0] === "branch") return { status: 0, stdout: "main\n" };
    if (args[0] === "status") {
      statusCalls += 1;
      return {
        status: 0,
        stdout: statusCalls < 3 ? "" : " M public/data/dashboard.json\0",
      };
    }
    if (args[0] === "fetch" || args[0] === "merge") return { status: 0, stdout: "" };
    throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
  };
  await assert.rejects(dailyUpdate({
    root: "/unused",
    run,
    lock: async () => async () => {},
    validate: async () => { throw new Error("artifact validation failed"); },
    publish: async () => { published = true; },
  }), /artifact validation failed/);
  assert.equal(commands.some((command) => ["add", "commit", "push"].includes(command[1])), false);
  assert.equal(published, false);
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

test("remote verification retries propagation and compares exact bytes", async () => {
  const { root, pagesRoot } = await fixture();
  const expected = Object.fromEntries(await Promise.all(requiredPublishedFiles.map(async (path) => [
    path,
    await readFile(resolve(pagesRoot, path)),
  ])));
  let requestCount = 0;
  let sleeps = 0;
  const fetchImpl = async (url) => {
    requestCount += 1;
    const path = new URL(url).pathname.replace("/durham-water-watch/", "");
    const body = requestCount === 1 ? Buffer.from("old deployment\n") : expected[path];
    return new Response(body, { status: 200 });
  };
  try {
    await verifyPublishedPages({
      root,
      fetchImpl,
      attempts: 2,
      retryDelayMs: 1,
      sleep: async () => { sleeps += 1; },
    });
    assert.equal(sleeps, 1);
    assert.equal(requestCount, requiredPublishedFiles.length + 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
