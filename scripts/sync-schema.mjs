#!/usr/bin/env node
// sync-schema.mjs — Vendor event-schema.json from nan-labs/fleeet

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCAL = join(__dirname, "../packages/core/schema/event-schema.json");
const REMOTE = "https://raw.githubusercontent.com/nan-labs/fleeet/main/schema/event-schema.json";

async function sync() {
  console.log("Fetching schema from", REMOTE);
  const res = await fetch(REMOTE);
  if (!res.ok) throw new Error(`Failed to fetch schema: ${res.status}`);
  const remote = await res.text();
  
  console.log("Checking local schema");
  const local = readFileSync(LOCAL, "utf8");
  
  if (local.trim() === remote.trim()) {
    console.log("✓ Schema is up to date");
    return true;
  }
  
  if (process.argv.includes("--check")) {
    console.error("✗ Schema mismatch! Run `npm run sync-schema` to update.");
    process.exit(1);
  }
  
  console.log("Updating local schema");
  writeFileSync(LOCAL, remote);
  console.log("✓ Schema synced");
  return false;
}

sync().catch((err) => {
  console.error("Schema sync failed:", err.message);
  process.exit(1);
});
