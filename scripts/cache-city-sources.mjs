import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cachePageEvidence } from "./official-page-evidence.mjs";
import { gitDirectory } from "./daily-lock.mjs";

if (!process.argv[2]) throw new Error("Usage: node scripts/cache-city-sources.mjs <official-page-evidence.json>");
const input = JSON.parse(await readFile(process.argv[2], "utf8"));
console.log(await cachePageEvidence(gitDirectory(resolve(import.meta.dirname, "..")), input));
