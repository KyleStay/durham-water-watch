import { fetchBytesWithRetry, fetchJsonWithRetry } from "./source-fetch.mjs";

export const rainfallSource = "https://mapservices.weather.noaa.gov/vector/rest/services/precip/wpc_qpf/MapServer";
export const rainfallPage = "https://www.wpc.ncep.noaa.gov/qpf/day1-7.shtml";
export const rainfallLocations = [
  { name: "Roxboro", longitude: -78.9828, latitude: 36.3938 },
  { name: "Rougemont", longitude: -78.922, latitude: 36.2196 },
  { name: "Lake Michie", longitude: -78.83, latitude: 36.1508333333333 },
  { name: "Little River Reservoir", longitude: -78.8691666666667, latitude: 36.115 },
  { name: "Hillsborough", longitude: -79.0997, latitude: 36.0754 },
  { name: "Butner", longitude: -78.7567, latitude: 36.1321 },
  { name: "Durham", longitude: -78.8986, latitude: 35.994 },
];
export function mercator(longitude, latitude) {
  const radius = 6378137;
  return [radius * longitude * Math.PI / 180, radius * Math.log(Math.tan(Math.PI / 4 + latitude * Math.PI / 360))];
}
const [centerX, centerY] = mercator(-78.9, 36.2);
export const rainfallBounds = [centerX - 105000, centerY - 63000, centerX + 105000, centerY + 63000];
const thresholds = [0, 0.01, 0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5, 7, 10, 15, 20];

function utc(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) throw new Error("NOAA forecast time is invalid");
  const date = new Date(`${value.replace(" ", "T")}Z`);
  if (!Number.isFinite(date.getTime())) throw new Error("NOAA forecast time is invalid");
  return date.toISOString();
}

export function parseRainfallPoint(body, now) {
  if (body.error || body.exceededTransferLimit || !body.features?.length) throw new Error("NOAA forecast coverage is unavailable");
  const attributes = body.features.map(({ attributes }) => attributes);
  const reference = attributes[0];
  const issuedAt = utc(reference.issue_time);
  const startsAt = utc(reference.start_time);
  const endsAt = utc(reference.end_time);
  const issued = Date.parse(issuedAt);
  if (issued > now.getTime() + 3600000 || now.getTime() - issued > 36 * 3600000
    || Date.parse(endsAt) <= now.getTime() || Date.parse(endsAt) - Date.parse(startsAt) !== 168 * 3600000) {
    throw new Error("NOAA seven-day forecast is expired or has an invalid period");
  }
  for (const item of attributes) {
    if (item.product !== "7-day QPF" || item.units !== "Inches" || !thresholds.includes(item.qpf)
      || item.issue_time !== reference.issue_time || item.start_time !== reference.start_time || item.end_time !== reference.end_time) {
      throw new Error("NOAA forecast fields or forecast cycles disagree");
    }
  }
  const lowerInches = Math.max(...attributes.map((item) => item.qpf));
  return { issuedAt, startsAt, endsAt, lowerInches, upperInches: thresholds[thresholds.indexOf(lowerInches) + 1] ?? null, issueTime: reference.issue_time };
}

export function retainRainfallForecast(previous, now, note) {
  return { ...previous, sourceUrl: rainfallPage, checkedAt: now.toISOString(), status: previous?.issuedAt ? "stale" : "unavailable", retrievalStatus: "failed", note };
}

export async function fetchRainfallForecast({ now = new Date(), json = fetchJsonWithRetry, bytes = fetchBytesWithRetry } = {}) {
  const options = { headers: { "user-agent": "Durham Water Watch/1.0", accept: "application/json" } };
  const { response: metadataResponse, body: metadata } = await json(`${rainfallSource}/11?f=json`, options);
  if (!metadataResponse.ok || metadata.name !== "QPF 168 Hour Day 1-7" || !metadata.drawingInfo?.renderer?.uniqueValueInfos?.length) throw new Error("NOAA seven-day forecast layer or legend is unavailable");
  const legend = metadata.drawingInfo.renderer.uniqueValueInfos.map(({ value, symbol }) => {
    if (!thresholds.includes(Number(value)) || !Array.isArray(symbol?.color) || symbol.color.slice(0, 3).some((item) => !Number.isInteger(item) || item < 0 || item > 255)) throw new Error("NOAA rainfall legend is invalid");
    return { lowerInches: Number(value), color: `rgb(${symbol.color.slice(0, 3).join(",")})` };
  }).sort((left, right) => left.lowerInches - right.lowerInches);
  const query = async (location) => {
    const params = new URLSearchParams({
      f: "json", where: "1=1", geometry: `${location.longitude},${location.latitude}`,
      geometryType: "esriGeometryPoint", inSR: "4326", spatialRel: "esriSpatialRelIntersects",
      returnGeometry: "false", outFields: "product,qpf,units,issue_time,start_time,end_time",
    });
    const { response, body } = await json(`${rainfallSource}/11/query?${params}`, options);
    if (!response.ok) throw new Error(`NOAA forecast returned HTTP ${response.status}`);
    return parseRainfallPoint(body, now);
  };
  const values = await Promise.all(rainfallLocations.map(query));
  const period = values[0];
  if (values.some((item) => item.issuedAt !== period.issuedAt || item.startsAt !== period.startsAt || item.endsAt !== period.endsAt)) {
    throw new Error("NOAA forecast updated during retrieval; retry for a consistent forecast");
  }
  const params = new URLSearchParams({
    f: "image", bbox: rainfallBounds.join(","), bboxSR: "3857", imageSR: "3857",
    size: "2000,1200", format: "png32", transparent: "true", layers: "show:11",
    layerDefs: JSON.stringify({ 11: `issue_time = '${period.issueTime}'` }),
  });
  const { response, body: image } = await bytes(`${rainfallSource}/export?${params}`, { headers: { "user-agent": "Durham Water Watch/1.0" } });
  if (!response.ok || image.length < 24 || !image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    || image.readUInt32BE(16) !== 2000 || image.readUInt32BE(20) !== 1200) {
    throw new Error("NOAA forecast map was not the expected PNG image");
  }
  const after = await query(rainfallLocations[0]);
  if (after.issuedAt !== period.issuedAt) throw new Error("NOAA forecast changed while its map was downloaded");
  return {
    image,
    forecast: {
      sourceUrl: rainfallPage, issuedAt: period.issuedAt, startsAt: period.startsAt, endsAt: period.endsAt,
      verifiedAt: now.toISOString(), checkedAt: now.toISOString(), retrievalStatus: "verified", status: "fresh",
      imagePath: "data/rainfall-forecast.png", imageBounds: rainfallBounds, legend,
      locations: rainfallLocations.map((location, index) => ({ ...location, lowerInches: values[index].lowerInches, upperInches: values[index].upperInches })),
    },
  };
}
