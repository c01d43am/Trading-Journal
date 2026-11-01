import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, "../..");
const appDirectory = path.join(projectDirectory, "dashboard-app");
const sourcePath = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.join(projectDirectory, "Market Data", "all_pairs.csv");
const input = parseCsv((await readFile(sourcePath, "utf8")).replace(/^\uFEFF/, ""));

if (!input.length) {
  throw new Error(`CSV has no pair rows: ${sourcePath}`);
}

const requiredColumns = ["Market", "Pair", "Name"];
const headers = input[0].map((header) => header.trim());
const hasHeaders = requiredColumns.every((column) => headers.includes(column));
let pairs;

if (hasHeaders) {
  const columnIndexes = Object.fromEntries(
    requiredColumns.map((column) => [column, headers.indexOf(column)]),
  );
  pairs = input.slice(1).map((row, index) => {
    if (row.length !== headers.length) {
      throw new Error(`CSV row ${index + 2} has ${row.length} columns; expected ${headers.length}.`);
    }
    return Object.fromEntries(
      requiredColumns.map((column) => [column, (row[columnIndexes[column]] ?? "").trim()]),
    );
  });
} else {
  const marketSourcePath = path.join(path.dirname(sourcePath), "all_pairs.txt");
  const marketRows = parseCsv((await readFile(marketSourcePath, "utf8")).replace(/^\uFEFF/, ""), "\t");
  const marketHeaders = marketRows[0].map((header) => header.trim());
  const marketIndex = marketHeaders.indexOf("Market");
  const pairIndex = marketHeaders.indexOf("Pair");
  if (marketIndex < 0 || pairIndex < 0) {
    throw new Error(`Cannot group headerless Pair,Name CSV; Market and Pair columns not found in ${marketSourcePath}.`);
  }
  const marketsByPair = new Map(
    marketRows.slice(1).map((row) => [row[pairIndex]?.trim(), row[marketIndex]?.trim()]),
  );
  pairs = input.map((row, index) => {
    if (row.length !== 2) {
      throw new Error(`Headerless CSV row ${index + 1} has ${row.length} columns; expected Pair,Name.`);
    }
    const pair = row[0].trim();
    const market = marketsByPair.get(pair);
    if (!market) {
      throw new Error(`No Market metadata found for pair "${pair}" in ${marketSourcePath}.`);
    }
    return { Market: market, Pair: pair, Name: row[1].trim() };
  });
}

if (!pairs.length) throw new Error(`CSV has no pair rows: ${sourcePath}`);
for (const [index, pair] of pairs.entries()) {
  if (!pair.Market || !pair.Pair) {
    throw new Error(`CSV row ${index + (hasHeaders ? 2 : 1)} is missing Market or Pair.`);
  }
}

const seenPairs = new Set();
for (const pair of pairs) {
  const key = `${pair.Market}\u0000${pair.Pair}`;
  if (seenPairs.has(key)) {
    throw new Error(`Duplicate pair in CSV: ${pair.Market} / ${pair.Pair}`);
  }
  seenPairs.add(key);
}

const serialized = JSON.stringify(pairs, null, 2);
const typescript = [
  "export type MarketPair = {",
  "  Market: string;",
  "  Pair: string;",
  "  Name: string;",
  "};",
  "",
  `export const allPairs: MarketPair[] = ${serialized};`,
  "",
].join("\n");

await Promise.all([
  writeFile(path.join(appDirectory, "src", "data", "pairsData.ts"), typescript, "utf8"),
  writeFile(path.join(projectDirectory, "web", "all_pairs.json"), `${serialized}\n`, "utf8"),
]);

console.log(`Generated ${pairs.length} pairs from ${sourcePath}.`);

function parseCsv(input, delimiter = ",") {
  const records = [];
  let record = [];
  let field = "";
  let insideQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (insideQuotes) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        insideQuotes = false;
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"' && field.length === 0) {
      insideQuotes = true;
    } else if (character === delimiter) {
      record.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      record.push(field);
      if (record.some((value) => value.length > 0)) records.push(record);
      record = [];
      field = "";
      if (character === "\r" && input[index + 1] === "\n") index += 1;
    } else {
      field += character;
    }
  }

  if (insideQuotes) throw new Error("CSV contains an unterminated quoted field.");
  record.push(field);
  if (record.some((value) => value.length > 0)) records.push(record);
  return records;
}
