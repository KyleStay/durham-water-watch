import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { knownCityObservations } from "./history-city-observations.mjs";
import { clearCityObservations, setCityObservation } from "./history-ledger.mjs";

const historyPath = resolve(import.meta.dirname, "../public/data/history.json");
const history = JSON.parse(await readFile(historyPath, "utf8"));

if (history.schemaVersion >= 3) {
  console.log(`History schema ${history.schemaVersion} is already migrated; no changes written.`);
} else {
  clearCityObservations(history);
  for (const observation of knownCityObservations) {
    if (!setCityObservation(history, observation.field, observation)) {
      throw new Error(`Could not place ${observation.field} observation on ${observation.observedAt}`);
    }
  }

  history.schemaVersion = 3;
  history.coverage.note = "Permanent daily archive. USGS daily means and weekly USDM county categories fill the historical record. City supply and reservoir values appear only on their official observation dates; unavailable dates remain null and are not forward-filled.";
  for (const source of history.coverage.sources) {
    if (source.fields.includes("supply.total")) {
      source.label = "City of Durham Current Data page and archived copies";
      source.url = "https://www.durhamnc.gov/1214/Current-Data";
      source.archiveUrls = source.urls;
      delete source.urls;
    }
    if (source.fields.includes("reservoirs.michie")) {
      source.label = "City of Durham Lake Levels page and archived copy";
      source.url = "https://www.durhamnc.gov/1225/Lake-Levels";
      source.archiveUrls = ["https://web.archive.org/web/20260415040721/https://www.durhamnc.gov/1225/Lake-Levels"];
    }
  }
  await writeFile(historyPath, `${JSON.stringify(history, null, 2)}\n`);
  console.log(`Migrated ${knownCityObservations.length} field observations into ${history.days.length} permanent daily rows.`);
}
