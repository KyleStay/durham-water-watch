import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cityPages } from "./city-readings.mjs";

const localDate = (now) => now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const hash = (text) => createHash("sha256").update(text).digest("hex");
export const evidencePath = (directory, now) => resolve(directory, "durham-water-source-evidence", localDate(now) + ".json");

export function validatePageEvidence(page, now) {
  const retrieved = Date.parse(page?.retrievedAt);
  if (!Object.values(cityPages).includes(page?.url) || !Number.isFinite(retrieved)
    || localDate(new Date(retrieved)) !== localDate(now) || retrieved > now.getTime() + 60_000
    || now.getTime() - retrieved > 2 * 3_600_000
    || typeof page.text !== "string" || page.text.length < 64 || page.text.length > 262_144
    || page.method !== "official-page-text" || page.sha256 !== hash(page.text)) {
    throw new Error("Official page evidence has an invalid source, content, or retrieval time");
  }
  return page;
}

export async function cachePageEvidence(directory, input, now = new Date()) {
  if (!Array.isArray(input.pages) || !input.pages.length) throw new Error("No official City page evidence supplied");
  const pages = input.pages.map((page) => validatePageEvidence({ ...page, method: "official-page-text", sha256: hash(page.text) }, now));
  if (new Set(pages.map((page) => page.url)).size !== pages.length) throw new Error("Duplicate official page evidence");
  const path = evidencePath(directory, now);
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, JSON.stringify({ schemaVersion: 1, pages }, null, 2) + "\n", { flag: "wx" });
  return path;
}

export async function readPageEvidence(directory, url, now = new Date()) {
  let evidence;
  try { evidence = JSON.parse(await readFile(evidencePath(directory, now), "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
  if (evidence.schemaVersion !== 1 || !Array.isArray(evidence.pages)) throw new Error("Invalid official page evidence record");
  const matches = evidence.pages.filter((page) => page.url === url);
  if (!matches.length) return null;
  if (matches.length !== 1) throw new Error("Duplicate official page evidence");
  return validatePageEvidence(matches[0], now);
}
