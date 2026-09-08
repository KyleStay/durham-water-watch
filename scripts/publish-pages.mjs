import { cp, mkdtemp, mkdir, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { validatePagesManifest } from "./pages-artifact.mjs";

function defaultRun(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  });
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${args.join(" ")} failed`);
  }
  return result;
}

export async function publishPages({
  root = resolve(import.meta.dirname, ".."),
  run = defaultRun,
  makeTemp = () => mkdtemp(join(tmpdir(), "durham-water-pages-")),
} = {}) {
  const pagesRoot = resolve(root, "pages-dist");
  const manifest = await validatePagesManifest({ root, pagesRoot });
  const deployRoot = await makeTemp();
  try {
    const remote = run("git", ["remote", "get-url", "origin"], { cwd: root, capture: true }).stdout.trim();
    if (!remote) throw new Error("The GitHub origin remote is not configured");

    const probe = run("git", ["ls-remote", "--exit-code", "--heads", remote, "gh-pages"], {
      cwd: root,
      capture: true,
      allowFailure: true,
    });
    if (probe.status === 0) {
      run("git", ["clone", "--depth", "1", "--branch", "gh-pages", remote, deployRoot], { cwd: root });
    } else if (probe.status === 2) {
      await rm(deployRoot, { recursive: true, force: true });
      await mkdir(deployRoot, { recursive: true });
      run("git", ["init", "--initial-branch=gh-pages"], { cwd: deployRoot });
      run("git", ["remote", "add", "origin", remote], { cwd: deployRoot });
    } else {
      throw new Error(`Cannot determine whether origin/gh-pages exists (git ls-remote exited ${probe.status})`);
    }

    for (const entry of await readdir(deployRoot)) {
      if (entry !== ".git") await rm(resolve(deployRoot, entry), { recursive: true, force: true });
    }
    await cp(pagesRoot, deployRoot, { recursive: true });

    const name = run("git", ["config", "user.name"], { cwd: root, capture: true, allowFailure: true }).stdout.trim() || "KyleStay";
    const email = run("git", ["config", "user.email"], { cwd: root, capture: true, allowFailure: true }).stdout.trim()
      || "KyleStay@users.noreply.github.com";
    run("git", ["config", "user.name", name], { cwd: deployRoot });
    run("git", ["config", "user.email", email], { cwd: deployRoot });
    run("git", ["add", "--all"], { cwd: deployRoot });

    const unchanged = run("git", ["diff", "--cached", "--quiet"], {
      cwd: deployRoot,
      allowFailure: true,
    }).status === 0;
    if (unchanged) {
      console.log("GitHub Pages already matches the validated artifact.");
      return { changed: false, manifest };
    }

    run("git", ["commit", "-m", "Deploy Durham Water Watch"], { cwd: deployRoot });
    run("git", [
      "-c", "http.version=HTTP/1.1",
      "-c", "http.postBuffer=524288000",
      "push", "origin", "gh-pages",
    ], { cwd: deployRoot });
    console.log("Published validated pages-dist to the gh-pages branch.");
    return { changed: true, manifest };
  } finally {
    await rm(deployRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await publishPages();
