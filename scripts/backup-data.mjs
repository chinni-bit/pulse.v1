#!/usr/bin/env node
// Data backup script - exports every row of every business table to one
// timestamped JSON file per table under backups/<timestamp>/.
//
// This is the row-DATA half of the three-way backup rule in CLAUDE.md.
// The SCHEMA (table structure) is backed up separately as git-tracked
// migration files under supabase/migrations/ - this script backs up the
// actual data those tables hold, which lives only in the database
// otherwise.
//
// Usage:
//   node scripts/backup-data.mjs
//
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from
// .env.local (same file the app already uses) - no new dependency, just
// a minimal inline .env parser since this project doesn't use `dotenv`.
//
// Output goes to backups/<timestamp>/<table>.json - gitignored (business
// data doesn't belong in version control) and NOT something to upload to
// Google Drive through this project's AI tooling (see CLAUDE.md's hard
// rule against zip/binary/large-file uploads there - export files can
// get large as real data grows). Copy this folder somewhere safe
// yourself if you want an off-machine copy.

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

function loadEnvLocal() {
  const envPath = join(repoRoot, '.env.local');
  if (!existsSync(envPath)) {
    console.error('.env.local not found - cannot read Supabase credentials.');
    process.exit(1);
  }
  const env = {};
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

// Every table this app writes to, in dependency-safe order (tenants
// first, everything else after). Add a new table here whenever a new
// migration introduces one, so this stays complete.
const TABLES = [
  'tenants',
  'users',
  'warehouses',
  'products',
  'product_variants',
  'product_mappings',
  'finish_groups',
  'customer_groups',
  'customers',
  'customer_contacts',
  'product_customer_exclusivity',
  'channels',
  'channel_configs',
  'sync_logs',
  'orders',
  'order_items',
  'inventory_batches',
  'batch_locations',
  'inventory_transfers',
  'inventory_qc_holds',
  'inventory_counts',
  'inventory_adjustments',
  'inventory_adjustment_lines',
  'inventory_audit_log',
  'vendors_factories',
  'country_tariff_rates',
  'inventory_settings',
  'inventory_shipments',
  'inventory_landed_cost_worksheets',
  'inventory_landed_cost_worksheet_lines',
];

async function main() {
  const env = loadEnvLocal();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or a Supabase key in .env.local.');
    process.exit(1);
  }
  const supabase = createClient(url, key);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = join(repoRoot, 'backups', stamp);
  mkdirSync(outDir, { recursive: true });

  let totalRows = 0;
  const summary = [];

  for (const table of TABLES) {
    const { data, error } = await supabase.from(table).select('*');
    if (error) {
      console.error(`  ${table}: FAILED - ${error.message}`);
      summary.push({ table, error: error.message });
      continue;
    }
    const rows = data || [];
    writeFileSync(join(outDir, `${table}.json`), JSON.stringify(rows, null, 2));
    totalRows += rows.length;
    summary.push({ table, rows: rows.length });
    console.log(`  ${table}: ${rows.length} rows`);
  }

  writeFileSync(join(outDir, '_summary.json'), JSON.stringify({ timestamp: stamp, totalRows, tables: summary }, null, 2));
  console.log(`\nBackup complete: ${outDir}`);
  console.log(`Total rows exported: ${totalRows}`);
}

main().catch((err) => {
  console.error('Backup failed:', err);
  process.exit(1);
});
