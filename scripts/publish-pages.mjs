import { cp, mkdtemp, mkdir, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const pagesRoot = resolve(root, "pages-dist");
const deployRoot = await mkdtemp(join(tmpdir(), "durham-water-pages-"));

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  });
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${args.join(" ")} failed`);
  }
  return result;
}

try {
  const remote = run("git", ["remote", "get-url", "origin"], { capture: true }).stdout.trim();
  if (!remote) throw new Error("The GitHub origin remote is not configured");

  const clone = run(
    "git",
    ["clone", "--depth", "1", "--branch", "gh-pages", remote, deployRoot],
    { allowFailure: true },
  );

  if (clone.status !== 0) {
    await rm(deployRoot, { recursive: true, force: true });
    await mkdir(deployRoot, { recursive: true });
    run("git", ["init", "--initial-branch=gh-pages"], { cwd: deployRoot });
    run("git", ["remote", "add", "origin", remote], { cwd: deployRoot });
  }

  for (const entry of await readdir(deployRoot)) {
    if (entry !== ".git") {
      await rm(resolve(deployRoot, entry), { recursive: true, force: true });
    }
  }
  await cp(pagesRoot, deployRoot, { recursive: true });

  const name = run("git", ["config", "user.name"], { capture: true }).stdout.trim() || "KyleStay";
  const email = run("git", ["config", "user.email"], { capture: true }).stdout.trim()
    || "KyleStay@users.noreply.github.com";
  run("git", ["config", "user.name", name], { cwd: deployRoot });
  run("git", ["config", "user.email", email], { cwd: deployRoot });
  run("git", ["add", "--all"], { cwd: deployRoot });

  const unchanged = run("git", ["diff", "--cached", "--quiet"], {
    cwd: deployRoot,
    allowFailure: true,
  }).status === 0;
  if (unchanged) {
    console.log("GitHub Pages already matches the generated site.");
  } else {
    run("git", ["commit", "-m", "Deploy Durham Water Watch"], { cwd: deployRoot });
    run("git", [
      "-c", "http.version=HTTP/1.1",
      "-c", "http.postBuffer=524288000",
      "push", "origin", "gh-pages",
    ], { cwd: deployRoot });
    console.log("Published pages-dist to the gh-pages branch.");
  }
} finally {
  await rm(deployRoot, { recursive: true, force: true });
}
