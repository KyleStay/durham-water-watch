import { mkdir, rm } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { publishPages } from "./publish-pages.mjs";
import { validatePagesManifest } from "./pages-artifact.mjs";
import { verifyPublishedPages } from "./verify-pages.mjs";

export const snapshotPaths = [
  "data/quarantine.json",
  "public/data/dashboard.json",
  "public/data/history.json",
  "public/data/streamflow-history.json",
];

function defaultRun(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  });
  if (result.status !== 0 && !options.allowFailure) {
    const detail = options.capture ? `: ${(result.stderr || result.stdout).trim()}` : "";
    throw new Error(`${command} ${args.join(" ")} failed${detail}`);
  }
  return result;
}

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

async function acquireDailyLock(root, run) {
  const gitDirectoryValue = run("git", ["rev-parse", "--git-common-dir"], { cwd: root, capture: true }).stdout.trim();
  const gitDirectory = isAbsolute(gitDirectoryValue) ? gitDirectoryValue : resolve(root, gitDirectoryValue);
  const lockPath = resolve(gitDirectory, "durham-water-daily.lock");
  try {
    await mkdir(lockPath);
  } catch (error) {
    if (error.code === "EEXIST") throw new Error(`Another daily update holds ${lockPath}`);
    throw error;
  }
  return async () => rm(lockPath, { recursive: true });
}

function output(run, root, args) {
  return run("git", args, { cwd: root, capture: true }).stdout.trim();
}

export async function dailyUpdate({
  root = resolve(import.meta.dirname, ".."),
  run = defaultRun,
  lock = () => acquireDailyLock(root, run),
  validate = () => validatePagesManifest({ root, pagesRoot: resolve(root, "pages-dist") }),
  publish = () => publishPages({ root, run }),
  verify = () => verifyPublishedPages({ root }),
  date = () => new Date(),
} = {}) {
  const unlock = await lock();
  try {
    const branch = output(run, root, ["branch", "--show-current"]);
    if (branch !== "main") throw new Error(`Daily update requires main, found ${branch || "detached HEAD"}`);

    const initialStatus = output(run, root, ["status", "--porcelain=v1", "--untracked-files=all"]);
    if (initialStatus) throw new Error("Daily update requires a clean worktree; preserve or finish existing work first");

    run("git", ["fetch", "origin", "main"], { cwd: root });
    run("git", ["merge", "--ff-only", "origin/main"], { cwd: root });
    if (output(run, root, ["status", "--porcelain=v1", "--untracked-files=all"])) {
      throw new Error("Worktree is not clean after synchronizing main");
    }

    run("npm", ["run", "refresh:data", "--", "--all"], { cwd: root });
    const refreshedPaths = parsePorcelainPaths(run("git", [
      "status", "--porcelain=v1", "-z", "--untracked-files=all",
    ], { cwd: root, capture: true }).stdout);
    assertOnlySnapshotChanges(refreshedPaths);

    run("npm", ["test"], { cwd: root });
    run("npm", ["run", "lint"], { cwd: root });
    run("npm", ["run", "typecheck"], { cwd: root });
    await validate();

    const validatedPaths = parsePorcelainPaths(run("git", [
      "status", "--porcelain=v1", "-z", "--untracked-files=all",
    ], { cwd: root, capture: true }).stdout);
    assertOnlySnapshotChanges(validatedPaths);
    if (validatedPaths.length > 0) {
      run("git", ["add", "--", ...snapshotPaths], { cwd: root });
      const staged = parseNullPaths(run("git", ["diff", "--cached", "--name-only", "-z"], {
        cwd: root,
        capture: true,
      }).stdout);
      assertOnlySnapshotChanges(staged);
      const sourceDate = date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
      run("git", ["commit", "-m", `Refresh Durham water data for ${sourceDate}`], { cwd: root });
    }

    if (output(run, root, ["status", "--porcelain=v1", "--untracked-files=all"])) {
      throw new Error("Daily update will not push while the worktree has uncommitted files");
    }
    run("git", ["push", "origin", "main"], { cwd: root });
    await publish();
    await verify();
    console.log("Daily refresh, source push, Pages publish, and remote content verification succeeded.");
  } finally {
    await unlock();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await dailyUpdate();
