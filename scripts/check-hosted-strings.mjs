#!/usr/bin/env node
// check-hosted-strings.mjs — Fail on leaked hosted service references

import { readFileSync } from "node:fs";
import { glob } from "glob";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const BANNED = [
  "supabase",
  "netlify",
  "resend",
  "posthog",
  "turnstile",
  "getStore",
  "FLEEET_OWNER",
];

const ALLOWLIST = [
  "scripts/check-hosted-strings.mjs", // this file
];

async function check() {
  const files = await glob("packages/core/**/*.{mjs,js,json}", { cwd: ROOT });
  let errors = 0;
  
  for (const file of files) {
    const rel = relative(ROOT, join(ROOT, file));
    if (ALLOWLIST.includes(rel)) continue;
    
    const content = readFileSync(join(ROOT, file), "utf8");
    const lines = content.split("\n");
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lower = line.toLowerCase();
      
      for (const banned of BANNED) {
        if (lower.includes(banned.toLowerCase())) {
          console.error(`${rel}:${i + 1}: Found banned string "${banned}"`);
          console.error(`  ${line.trim()}`);
          errors++;
        }
      }
    }
  }
  
  if (errors > 0) {
    console.error(`\n✗ Found ${errors} banned string(s)`);
    process.exit(1);
  }
  
  console.log("✓ No hosted service references found");
}

check().catch((err) => {
  console.error("Check failed:", err.message);
  process.exit(1);
});
