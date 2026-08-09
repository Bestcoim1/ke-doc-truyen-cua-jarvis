import { spawnSync } from "node:child_process";

const result = spawnSync(
  "npx",
  [
    "--yes",
    "supabase@2.113.0",
    "migration",
    "list",
    "--linked",
  ],
  { encoding: "utf8", shell: process.platform === "win32" },
);

if (result.status !== 0) {
  process.stderr.write(
    result.stderr || result.error?.message || "Unable to list linked Supabase migrations.\n",
  );
  process.exit(result.status ?? 1);
}

let payload;
try {
  payload = JSON.parse(result.stdout);
} catch {
  process.stderr.write("Supabase CLI returned invalid migration JSON.\n");
  process.exit(1);
}

const migrations = Array.isArray(payload) ? payload : payload.migrations;
if (!Array.isArray(migrations)) {
  process.stderr.write("Supabase CLI response did not contain a migration list.\n");
  process.exit(1);
}

const localOnly = migrations.filter((migration) => migration.local && !migration.remote);
const remoteOnly = migrations.filter((migration) => migration.remote && !migration.local);

if (localOnly.length || remoteOnly.length) {
  if (localOnly.length) {
    process.stderr.write(
      `Local migrations not applied remotely: ${localOnly.map((migration) => migration.local).join(", ")}\n`,
    );
  }
  if (remoteOnly.length) {
    process.stderr.write(
      `Remote migrations missing locally: ${remoteOnly.map((migration) => migration.remote).join(", ")}\n`,
    );
  }
  process.exit(1);
}

process.stdout.write(`Migration history is aligned (${migrations.length} migrations).\n`);
