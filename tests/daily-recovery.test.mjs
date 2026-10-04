import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir, hostname } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { dailyPreflight, dailyUpdate, easternDate, snapshotPaths } from "../scripts/daily-update.mjs";
import { acquireDailyLock, recoverAbandonedLock } from "../scripts/daily-lock.mjs";
import { processExists, runCommand, runGitWithRetry } from "../scripts/run-command.mjs";
import { createPagesManifest, requiredPublishedFiles } from "../scripts/pages-artifact.mjs";

const firstDate = new Date("2026-10-04T10:00:00Z");
const secondDate = new Date("2026-10-05T10:00:00Z");
const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

async function fixture(t) {
  const temporary = await mkdtemp(resolve(tmpdir(), "durham-daily-recovery-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const root = resolve(temporary, "project"), remote = resolve(temporary, "origin.git");
  await mkdir(root);
  git(root, ["init", "--quiet", "--initial-branch=main"]);
  git(root, ["config", "user.name", "Fixture"]);
  git(root, ["config", "user.email", "fixture@example.test"]);
  await writeFile(resolve(root, ".gitignore"), "/node_modules\n/pages-dist/\n");
  await mkdir(resolve(root, "node_modules"));
  for (const path of snapshotPaths) {
    await mkdir(resolve(root, path, ".."), { recursive: true });
    await writeFile(resolve(root, path), path.endsWith("dashboard.json") ? "{}\n" : "original\n");
  }
  await writeFile(resolve(root, "AGENTS.md"), "Preserve user work.\n");
  git(root, ["add", "."]);
  git(root, ["commit", "--quiet", "-m", "Initial fixture"]);
  git(root, ["init", "--quiet", "--bare", remote]);
  git(root, ["remote", "add", "origin", remote]);
  git(root, ["push", "--quiet", "--set-upstream", "origin", "main"]);
  const commands = [], events = [];
  const run = async (command, args, options = {}) => {
    commands.push({ command, args, cwd: options.cwd });
    if (command === "npm") {
      if (args.includes("refresh:data")) {
        await writeFile(resolve(options.cwd, "public/data/dashboard.json"), JSON.stringify({ generatedAt: firstDate.toISOString(), lastRefreshResult: "verified: fixture source" }));
      }
      return { status: 0, stdout: "" };
    }
    return runCommand(command, args, { ...options, capture: true });
  };
  const options = { root, run, date: () => firstDate,
    validate: async (candidate) => { events.push(["validate", candidate]); },
    publish: async (candidate) => { events.push(["publish", candidate]); },
    verify: async (candidate) => { events.push(["verify", candidate]); },
  };
  const record = async (date = "2026-10-04") => JSON.parse(await readFile(resolve(root, `.git/durham-water-daily-attempts/${date}.json`), "utf8"));
  return { root, remote, run, options, commands, events, record };
}

test("Eastern day guard handles midnight and DST dates", () => {
  assert.equal(easternDate(new Date("2027-01-01T03:00:00Z")), "2026-12-31");
  assert.equal(easternDate(new Date("2026-11-01T05:30:00Z")), "2026-11-01");
});

test("dirty user work is preserved and blocks fetch; its attempt cannot be repeated", async (t) => {
  const f = await fixture(t);
  await writeFile(resolve(f.root, "AGENTS.md"), "User edits\n");
  await assert.rejects(dailyUpdate(f.options), /clean worktree.*AGENTS.md/);
  assert.equal(f.commands.some(({ args }) => args[0] === "fetch"), false);
  assert.equal(await readFile(resolve(f.root, "AGENTS.md"), "utf8"), "User edits\n");
  assert.equal((await f.record()).phase, "preflight");
  await assert.rejects(dailyUpdate(f.options), /already attempted/);
  await assert.rejects(dailyPreflight({ root: f.root, date: firstDate }), /already attempted/);
  await assert.rejects(access(resolve(f.root, ".git/durham-water-daily.lock")), { code: "ENOENT" });
});

test("an index lock blocks network access and remains untouched", async (t) => {
  const f = await fixture(t), path = resolve(f.root, ".git/index.lock");
  await writeFile(path, "unknown owner\n");
  await assert.rejects(dailyUpdate(f.options), /Repository lock requires owner inspection/);
  assert.equal(f.commands.some(({ args }) => args[0] === "fetch"), false);
  assert.equal(await readFile(path, "utf8"), "unknown owner\n");
});

test("network sync failure reserves the day without changing main or retrieving sources", async (t) => {
  const f = await fixture(t);
  await assert.rejects(dailyUpdate({ ...f.options, run: async (command, args, config) => {
    if (command === "git" && args[0] === "fetch") throw new Error("fixture transport failure");
    return f.run(command, args, config);
  } }), /fixture transport failure/);
  assert.equal(git(f.root, ["status", "--porcelain"]), "");
  assert.equal(f.commands.some(({ command }) => command === "npm"), false);
  await assert.rejects(dailyUpdate(f.options), /already attempted/);
  assert.equal((await dailyUpdate({ ...f.options, date: () => secondDate })).outcome, "verified");
});

test("inputs mutated during staging cannot commit or advance main", async (t) => {
  const f = await fixture(t), initial = git(f.root, ["rev-parse", "HEAD"]);
  await assert.rejects(dailyUpdate({ ...f.options, validate: undefined, run: async (command, args, config) => {
    const result = await f.run(command, args, config);
    if (command === "npm" && args[0] === "test") {
      const pagesRoot = resolve(config.cwd, "pages-dist");
      for (const path of requiredPublishedFiles) {
        await mkdir(resolve(pagesRoot, path, ".."), { recursive: true });
        await writeFile(resolve(pagesRoot, path), `${path}\n`);
      }
      await createPagesManifest({ root: config.cwd, pagesRoot });
    }
    if (command === "git" && args[0] === "add") await writeFile(resolve(config.cwd, "public/data/dashboard.json"), '{"tampered":true}\n');
    return result;
  } }), /Tracked build input content changed/);
  assert.equal(git(f.root, ["rev-parse", "HEAD"]), initial);
  assert.equal(f.commands.some(({ args }) => args[0] === "commit"), false);
});

for (const failure of ["refresh:data", "test", "lint", "typecheck", "manifest", "unexpected edit"]) {
  test(`${failure} failure preserves candidate, leaves main clean, and permits the next day's fresh refresh`, async (t) => {
    const f = await fixture(t), initial = git(f.root, ["rev-parse", "HEAD"]);
    const options = { ...f.options, run: async (command, args, config) => {
      if (command === "npm" && args.includes(failure)) throw new Error(`fixture ${failure} failure`);
      const result = await f.run(command, args, config);
      if (failure === "unexpected edit" && command === "npm" && args.includes("refresh:data")) await writeFile(resolve(config.cwd, "AGENTS.md"), "Unauthorized refresh edit\n");
      return result;
    }, validate: failure === "manifest" ? async () => { throw new Error("fixture manifest failure"); } : f.options.validate };
    await assert.rejects(dailyUpdate(options), /failure|outside the snapshot allowlist/);
    assert.equal(git(f.root, ["rev-parse", "HEAD"]), initial);
    assert.equal(git(f.root, ["status", "--porcelain"]), "");
    assert.equal(f.events.some(([kind]) => kind === "publish"), false);
    const state = await f.record();
    assert.equal(state.outcome, "failed");
    await access(state.candidate);
    await assert.rejects(dailyUpdate(f.options), /already attempted/);
    const result = await dailyUpdate({ ...f.options, date: () => secondDate });
    assert.equal(result.outcome, "verified");
    assert.equal(result.liveContentVerified, true);
    assert.equal(git(f.root, ["status", "--porcelain"]), "");
    assert.equal(git(f.root, ["rev-parse", "HEAD"]), git(f.root, ["rev-parse", "origin/main"]));
    await assert.rejects(access(result.candidate), { code: "ENOENT" });
    assert.equal(f.commands.filter(({ command, args }) => command === "npm" && args.includes("refresh:data")).length, failure === "refresh:data" ? 1 : 2);
  });
}

for (const failure of ["push", "publish", "verify"]) {
  test(`${failure} failure leaves a clean validated main and preserves evidence for the next day`, async (t) => {
    const f = await fixture(t);
    const options = { ...f.options };
    if (failure === "push") options.run = async (command, args, config) => {
      if (command === "git" && args[0] === "push") throw new Error("fixture push failure");
      return f.run(command, args, config);
    };
    if (failure === "publish") options.publish = async () => { throw new Error("fixture publish failure"); };
    if (failure === "verify") options.verify = async () => { throw new Error("fixture verify failure"); };
    await assert.rejects(dailyUpdate(options), new RegExp(`fixture ${failure} failure`));
    assert.equal(git(f.root, ["status", "--porcelain"]), "");
    const state = await f.record();
    assert.equal(git(f.root, ["rev-parse", "HEAD"]), state.sourceCommit);
    await access(state.candidate);
    await assert.rejects(dailyUpdate(f.options), /already attempted/);
    const next = await dailyUpdate({ ...f.options, date: () => secondDate });
    assert.equal(next.outcome, "verified");
  });
}

test("cleanup failure preserves verified success and does not force removal", async (t) => {
  const f = await fixture(t);
  const result = await dailyUpdate({ ...f.options, run: async (command, args, config) => {
    if (command === "git" && args[0] === "worktree" && args[1] === "remove") throw new Error("fixture cleanup failure");
    return f.run(command, args, config);
  } });
  assert.equal(result.outcome, "verified");
  assert.equal(result.liveContentVerified, true);
  assert.match(result.cleanupWarning, /cleanup failure/);
  await access(result.candidate);
});

test("an editor changing main during validation is preserved and prevents advancement or push", async (t) => {
  const f = await fixture(t), initial = git(f.root, ["rev-parse", "HEAD"]);
  await assert.rejects(dailyUpdate({ ...f.options, validate: async () => {
    await writeFile(resolve(f.root, "AGENTS.md"), "New user instructions\n");
  } }), /clean worktree.*AGENTS.md/);
  assert.equal(git(f.root, ["rev-parse", "HEAD"]), initial);
  assert.equal(await readFile(resolve(f.root, "AGENTS.md"), "utf8"), "New user instructions\n");
  assert.equal(f.commands.some(({ args }) => args[0] === "push"), false);
});

test("non-fast-forward synchronization stops before source retrieval", async (t) => {
  const f = await fixture(t);
  const old = git(f.root, ["rev-parse", "HEAD"]);
  await writeFile(resolve(f.root, "remote.txt"), "Remote work\n");
  git(f.root, ["add", "remote.txt"]); git(f.root, ["commit", "--quiet", "-m", "Remote advance"]);
  git(f.root, ["push", "--quiet", "origin", "main"]);
  // Detached fixture branch creates divergent history without rewriting any
  // real repository or remote; the production path must reject it.
  git(f.root, ["checkout", "--quiet", "-B", "main", old]);
  await writeFile(resolve(f.root, "local.txt"), "Local work\n");
  git(f.root, ["add", "local.txt"]); git(f.root, ["commit", "--quiet", "-m", "Local advance"]);
  await assert.rejects(dailyUpdate(f.options), /fast-forward/);
  assert.equal(f.commands.some(({ command }) => command === "npm"), false);
  assert.equal(git(f.root, ["status", "--porcelain"]), "");
});

test("concurrent lock acquisition admits one owner and blocks live ownership", async (t) => {
  const f = await fixture(t), directory = resolve(f.root, ".git");
  const results = await Promise.allSettled([acquireDailyLock(directory), acquireDailyLock(directory)]);
  assert.equal(results.filter(({ status }) => status === "fulfilled").length, 1);
  await assert.rejects(recoverAbandonedLock(directory), /Another daily update|no verifiable owner/);
  await results.find(({ status }) => status === "fulfilled").value.release();
});

test("only a known local lock with a dead owner and dead child groups can be archived", async (t) => {
  const f = await fixture(t), directory = resolve(f.root, ".git"), lock = resolve(directory, "durham-water-daily.lock");
  await mkdir(lock);
  await assert.rejects(recoverAbandonedLock(directory), /no verifiable owner/);
  const owner = { schemaVersion: 1, token: 'fixture-owner', startedAt: firstDate.toISOString(), host: hostname(), pid: 123, childGroups: [456], launchPending: true };
  await writeFile(resolve(lock, "owner.json"), JSON.stringify(owner));
  await assert.rejects(recoverAbandonedLock(directory, { alive: (pid) => pid === -456 }), /Another daily update/);
  await assert.rejects(recoverAbandonedLock(directory, { host: "different-host", alive: () => false }), /cannot be verified/);
  await assert.rejects(recoverAbandonedLock(directory, { alive: () => false }), /unconfirmed child launch/);
  owner.launchPending = false;
  await writeFile(resolve(lock, "owner.json"), JSON.stringify(owner));
  assert.equal((await recoverAbandonedLock(directory, { alive: () => false, checkOnly: true })).abandoned, true);
  await access(lock);
  await recoverAbandonedLock(directory, { alive: () => false });
  await assert.rejects(access(lock), { code: "ENOENT" });
  assert.equal((await readdir(directory)).filter((name) => name.startsWith("durham-water-daily.lock.abandoned-")).length, 1);
});

test("bounded Git retries handle transient transport failures and never retry a rejected push", async () => {
  let calls = 0;
  const result = await runGitWithRetry("git", ["fetch", "origin", "main"], {}, { retryDelayMs: 0,
    run: async () => { calls += 1; if (calls < 3) throw new Error("Could not resolve host: example.test"); return { status: 0 }; },
  });
  assert.equal(result.status, 0); assert.equal(calls, 3);
  calls = 0;
  await assert.rejects(runGitWithRetry("git", ["push", "origin", "main"], {}, { retryDelayMs: 0,
    run: async () => { calls += 1; throw new Error("rejected: non-fast-forward"); },
  }), /non-fast-forward/);
  assert.equal(calls, 1);
});

test("a timed-out command terminates descendants that ignore SIGTERM and clears ownership", async () => {
  const groups = [];
  const program = "const {spawn}=require('node:child_process'); spawn(process.execPath, ['-e', 'process.on(\"SIGTERM\", () => {}); console.log(\"ready\"); setInterval(() => {}, 1000)'], {stdio:'inherit'}); setInterval(() => {}, 1000);";
  await assert.rejects(runCommand(process.execPath, ["-e", program], {
    capture: true, timeoutMs: 5000, killGraceMs: 100,
    childGroup: async (pid, active) => { groups.push([pid, active]); },
  }), (error) => { assert.match(error.message, /timed out/); assert.match(error.result.stdout, /ready/); return true; });
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map(([, active]) => active), [true, false]);
  assert.equal(processExists(-groups[0][0]), false);
});

test("cancellation kills an owned command and does not trigger Git retries", async () => {
  const controller = new AbortController(), groups = [];
  const pending = runCommand(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    capture: true, signal: controller.signal,
    childGroup: async (pid, active) => { groups.push([pid, active]); if (active) controller.abort(new Error("fixture cancellation")); },
  });
  await assert.rejects(pending, /fixture cancellation/);
  assert.deepEqual(groups.map(([, active]) => active), [true, false]);
  let calls = 0;
  await assert.rejects(runGitWithRetry("git", ["fetch"], { signal: controller.signal }, {
    run: async () => { calls += 1; throw new Error("Could not resolve host"); },
  }), /Could not resolve/);
  assert.equal(calls, 1);
});
