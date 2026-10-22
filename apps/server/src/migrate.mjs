// migrate.mjs — Simple migration runner

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '../migrations');

export async function runMigrations(sql) {
  await sql`
    create table if not exists migrations (
      id serial primary key,
      name text not null unique,
      applied_at timestamptz not null default now()
    )
  `;

  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const [applied] = await sql`
      select name from migrations where name = ${file}
    `;

    if (applied) {
      console.log(`  ✓ ${file} (already applied)`);
      continue;
    }

    console.log(`  → ${file}`);
    const content = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    await sql.unsafe(content);
    await sql`insert into migrations (name) values (${file})`;
    console.log(`  ✓ ${file}`);
  }
}
