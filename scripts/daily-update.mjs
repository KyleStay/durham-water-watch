import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { publishPages } from "./publish-pages.mjs";
import { validatePagesManifest } from "./pages-artifact.mjs";
import { verifyPublishedPages } from "./verify-pages.mjs";
import { acquireDailyLock, gitDirectory, recoverAbandonedLock, writeJson } from "./daily-lock.mjs";
import { runCommand, runGitWithRetry } from "./run-command.mjs";

export const snapshotPaths = [
  "data/quarantine.json",
  "public/data/dashboard.json",
  "public/data/history.json",
  "public/data/streamflow-history.json",
  "public/data/rainfall-forecast.png",
];

export function parseNullPaths(output) {
  return output.split("\0").filter(Boolean);
}

export function parsePorcelainPaths(output) {
  const records = parseNullPaths(output);
  const paths = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const status = record.slice(0, 2);
    if (status.includes("R") || status.includes("C")) {
      throw new Error("Daily refresh may not rename or copy snapshot files");
    }
    paths.push(record.slice(3));
  }
  return paths;
}

export function assertOnlySnapshotChanges(paths) {
  const unexpected = paths.filter((path) => !snapshotPaths.includes(path));
  if (unexpected.length > 0) {
    throw new Error(`Refresh changed files outside the snapshot allowlist: ${unexpected.join(", ")}`);
  }
}

export function easternDate(date) {
  return date.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

async function output(run, root, args) {
  return (await run("git", args, { cwd: root, capture: true })).stdout.trim();
}

async function assertCleanMain(root, run, expectedHead) {
  const branch = await output(run, root, ["branch", "--show-current"]);
  if (branch !== "main") throw new Error(`Daily update requires main, found ${branch || "detached HEAD"}`);
  const status = await run("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], { cwd: root, capture: true });
  if (status.stdout) throw new Error(`Daily update requires a clean worktree; preserve or finish existing work first: ${parsePorcelainPaths(status.stdout).join(", ")}`);
  const workingGitDirectory = await output(run, root, ["rev-parse", "--absolute-git-dir"]);
  const commonDirectory = gitDirectory(root);
  for (const path of [resolve(workingGitDirectory, "index.lock"), resolve(workingGitDirectory, "HEAD.lock"),
    ...["packed-refs.lock", "shallow.lock", "config.lock", "refs/heads/main.lock"].map((name) => resolve(commonDirectory, name))]) {
    try { await access(path); }
    catch (error) { if (error.code === "ENOENT") continue; throw error; }
    throw new Error(`Repository lock requires owner inspection; preserve ${path}`);
  }
  const head = await output(run, root, ["rev-parse", "HEAD"]);
  if (expectedHead && head !== expectedHead) throw new Error("Main changed during the update; preserving the candidate without advancing main");
  return head;
}

function attemptPath(directory, date) {
  return resolve(directory, "durham-water-daily-attempts", `${date}.json`);
}

async function assertNotAttempted(directory, date) {
  try { await access(attemptPath(directory, date)); }
  catch (error) { if (error.code === "ENOENT") return; throw error; }
  throw new Error(`A daily update was already attempted for ${date}; next attempt belongs to the next Eastern calendar date. See ${attemptPath(directory, date)}`);
}

export async function dailyPreflight({ root = resolve(import.meta.dirname, ".."), date = new Date() } = {}) {
  const directory = gitDirectory(root);
  await assertNotAttempted(directory, easternDate(date));
  const abandoned = await recoverAbandonedLock(directory, { checkOnly: true });
  const head = await assertCleanMain(root, runCommand);
  await access(resolve(root, "node_modules"));
  console.log(`Preflight passed: clean main at ${head}, no active owned lock, no command attempt for ${easternDate(date)}.`);
  if (abandoned) console.log(`Verified abandoned owned lock; the permitted updater will archive ${abandoned.path} during acquisition.`);
}

export async function dailyUpdate({
  root = resolve(import.meta.dirname, ".."),
  run: suppliedRun,
  validate = (candidate) => validatePagesManifest({ root: candidate, pagesRoot: resolve(candidate, "pages-dist") }),
  publish = (candidate, run) => publishPages({ root: candidate, run }),
  verify = (candidate) => verifyPublishedPages({ root: candidate, signal }),
  date = () => new Date(),
  signal,
} = {}) {
  const directory = gitDirectory(root);
  const lock = await acquireDailyLock(directory);
  const run = suppliedRun ?? ((command, args, options) => runGitWithRetry(command, args, { ...options, signal, beforeSpawn: lock.beforeSpawn, childGroup: lock.childGroup }));
  const localDate = easternDate(date());
  const path = attemptPath(directory, localDate);
  const state = { schemaVersion: 1, localDate, startedAt: date().toISOString(), phase: "preflight", outcome: "running" };
  let reserved = false, candidate;
  const phase = async (name) => { signal?.throwIfAborted(); state.phase = name; await writeJson(path, state); };
  try {
    await mkdir(resolve(path, ".."), { recursive: true });
    try { await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, { flag: "wx" }); reserved = true; }
    catch (error) {
      if (error.code === "EEXIST") throw new Error(`A daily update was already attempted for ${localDate}; see ${path}`);
      throw error;
    }
    await assertCleanMain(root, run);
    await access(resolve(root, "node_modules"));
    await phase("synchronize");
    await run("git", ["fetch", "origin", "main"], { cwd: root });
    await run("git", ["merge", "--ff-only", "origin/main"], { cwd: root });
    const base = await assertCleanMain(root, run);
    state.baseCommit = base;
    candidate = resolve(directory, "durham-water-runs", `${localDate}-${randomUUID()}`, "worktree");
    state.candidate = candidate;
    await phase("prepare candidate");
    await mkdir(resolve(candidate, ".."), { recursive: true });
    await run("git", ["worktree", "add", "--detach", candidate, base], { cwd: root });
    await symlink(resolve(root, "node_modules"), resolve(candidate, "node_modules"), "dir");

    await phase("refresh sources");
    await run("npm", ["run", "refresh:data", "--", "--all"], { cwd: candidate });
    const refreshedPaths = parsePorcelainPaths((await run("git", [
      "status", "--porcelain=v1", "-z", "--untracked-files=all",
    ], { cwd: candidate, capture: true })).stdout);
    assertOnlySnapshotChanges(refreshedPaths);
    const snapshot = JSON.parse(await readFile(resolve(candidate, "public/data/dashboard.json"), "utf8"));
    state.sourceResult = snapshot.lastRefreshResult;
    state.snapshotGeneratedAt = snapshot.generatedAt;

    await phase("validate");
    await run("npm", ["test"], { cwd: candidate });
    await run("npm", ["run", "lint"], { cwd: candidate });
    await run("npm", ["run", "typecheck"], { cwd: candidate });
    await validate(candidate);

    const validatedPaths = parsePorcelainPaths((await run("git", [
      "status", "--porcelain=v1", "-z", "--untracked-files=all",
    ], { cwd: candidate, capture: true })).stdout);
    assertOnlySnapshotChanges(validatedPaths);
    await phase("commit candidate");
    if (validatedPaths.length > 0) {
      await run("git", ["add", "--", ...snapshotPaths], { cwd: candidate });
      const staged = parseNullPaths((await run("git", ["diff", "--cached", "--name-only", "-z"], {
        cwd: candidate,
        capture: true,
      })).stdout);
      assertOnlySnapshotChanges(staged);
      await validate(candidate);
      if (await output(run, candidate, ["diff", "--name-only"])) throw new Error("Candidate inputs changed while staging; refusing to commit");
      await run("git", ["commit", "-m", `Refresh Durham water data for ${localDate}`], { cwd: candidate });
    }
    if (await output(run, candidate, ["status", "--porcelain=v1", "--untracked-files=all"])) {
      throw new Error("Daily update will not advance main while its candidate has uncommitted files");
    }
    await validate(candidate);
    state.sourceCommit = await output(run, candidate, ["rev-parse", "HEAD"]);
    await phase("advance main");
    await assertCleanMain(root, run, base);
    await run("git", ["merge", "--ff-only", state.sourceCommit], { cwd: root });
    await assertCleanMain(root, run, state.sourceCommit);
    await phase("push source");
    await run("git", ["push", "origin", "main"], { cwd: root });
    await phase("publish Pages");
    await publish(candidate, run);
    await phase("verify live content");
    await verify(candidate);
    state.liveContentVerified = true;
    state.outcome = "verified";
    state.completedAt = date().toISOString();
    await writeJson(path, state);
    // Git refuses to remove a dirty candidate. Never force cleanup or discard
    // user changes, even if someone edited it while verification was running.
    try { await run("git", ["worktree", "remove", candidate], { cwd: root }); }
    catch (error) {
      state.cleanupWarning = error.message;
      await writeJson(path, state);
      console.warn(`Publication verified; candidate cleanup deferred at ${candidate}: ${error.message}`);
    }
    console.log("Daily refresh, source push, Pages publish, and remote content verification succeeded.");
    return state;
  } catch (error) {
    if (reserved) {
      state.outcome = "failed";
      state.error = error.message;
      state.completedAt = date().toISOString();
      await writeJson(path, state);
      console.error(`Daily update failed during ${state.phase}. Record: ${path}${candidate ? `; candidate preserved at ${candidate}` : ""}`);
    }
    throw error;
  } finally {
    await lock.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.includes("--preflight")) await dailyPreflight();
  else {
    const controller = new AbortController();
    const interrupt = () => controller.abort(new Error("Daily update interrupted by SIGINT"));
    const terminate = () => controller.abort(new Error("Daily update interrupted by SIGTERM"));
    process.once("SIGINT", interrupt);
    process.once("SIGTERM", terminate);
    try { await dailyUpdate({ signal: controller.signal }); }
    finally { process.removeListener("SIGINT", interrupt); process.removeListener("SIGTERM", terminate); }
  }
}
