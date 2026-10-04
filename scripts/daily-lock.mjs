import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { resolve } from "node:path";
import { processExists } from "./run-command.mjs";

export function gitDirectory(root) {
  return resolve(root, execFileSync("git", ["rev-parse", "--git-common-dir"], { cwd: root, encoding: "utf8" }).trim());
}

export async function writeJson(path, value) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, path);
}

async function inspectAndRecoverLock(directory, { alive, host, checkOnly = false }) {
  const path = resolve(directory, "durham-water-daily.lock");
  let raw;
  try { raw = await readFile(resolve(path, "owner.json"), "utf8"); }
  catch (error) {
    if (error.code === "ENOENT") {
      try { await access(path); }
      catch (missing) { if (missing.code === "ENOENT") return; }
    }
    throw new Error(`Daily lock has no verifiable owner; preserve ${path} for manual inspection`);
  }
  let owner;
  try { owner = JSON.parse(raw); } catch { /* Unknown locks must never be cleared. */ }
  if (owner?.schemaVersion !== 1 || owner.host !== host || !owner.token || !Number.isFinite(Date.parse(owner.startedAt))
    || !Number.isInteger(owner.pid) || owner.pid <= 0
    || !Array.isArray(owner.childGroups) || owner.childGroups.some((pid) => !Number.isInteger(pid) || pid <= 0)) {
    throw new Error(`Daily lock owner cannot be verified; preserve ${path} for manual inspection`);
  }
  if (alive(owner.pid) || owner.childGroups.some((pid) => alive(-pid))) {
    throw new Error(`Another daily update holds ${path} (owner PID ${owner.pid})`);
  }
  if (owner.launchPending !== false) throw new Error(`Daily lock has an unconfirmed child launch; preserve ${path} for owner inspection`);
  // Preserve the evidence, and fail if another process changed ownership while
  // we inspected it. A new updater still has to acquire mkdir exclusively.
  if (await readFile(resolve(path, "owner.json"), "utf8") !== raw) throw new Error("Daily lock changed during inspection");
  if (checkOnly) return { path, abandoned: true };
  const archived = `${path}.abandoned-${randomUUID()}`;
  await rename(path, archived);
  console.warn(`Archived abandoned updater lock at ${archived}; owner and child groups are no longer running.`);
}

export async function recoverAbandonedLock(directory, { alive = processExists, host = hostname(), checkOnly = false } = {}) {
  const path = resolve(directory, "durham-water-daily.lock");
  try { await access(path); } catch (error) { if (error.code === "ENOENT") return; throw error; }
  if (checkOnly) return inspectAndRecoverLock(directory, { alive, host, checkOnly });
  // Serialize reclamation so two preflights cannot move a newly acquired lock.
  const mutex = `${path}.inspection`;
  try { await mkdir(mutex); }
  catch (error) {
    if (error.code === "EEXIST") throw new Error(`Another lock inspection holds ${mutex}; preserve it for inspection`);
    throw error;
  }
  try {
    await writeJson(resolve(mutex, "owner.json"), { host: hostname(), pid: process.pid, startedAt: new Date().toISOString() });
    await inspectAndRecoverLock(directory, { alive, host });
  } finally { await rm(mutex, { recursive: true }); }
}

export async function acquireDailyLock(directory) {
  await recoverAbandonedLock(directory);
  const path = resolve(directory, "durham-water-daily.lock");
  try { await mkdir(path); }
  catch (error) {
    if (error.code === "EEXIST") throw new Error(`Another daily update holds ${path}`);
    throw error;
  }
  const owner = { schemaVersion: 1, token: randomUUID(), host: hostname(), pid: process.pid, startedAt: new Date().toISOString(), childGroups: [], launchPending: false };
  await writeJson(resolve(path, "owner.json"), owner);
  return {
    async beforeSpawn() {
      owner.launchPending = true;
      await writeJson(resolve(path, "owner.json"), owner);
    },
    async childGroup(pid, active) {
      if (active) owner.launchPending = false;
      owner.childGroups = active ? [...owner.childGroups, pid] : owner.childGroups.filter((group) => group !== pid);
      await writeJson(resolve(path, "owner.json"), owner);
    },
    async release() {
      const current = JSON.parse(await readFile(resolve(path, "owner.json"), "utf8"));
      if (current.token !== owner.token) throw new Error("Daily lock ownership changed; refusing to release it");
      if (owner.childGroups.some((pid) => processExists(-pid))) throw new Error(`Updater children are still running; preserving ${path}`);
      await rm(path, { recursive: true });
    },
  };
}
