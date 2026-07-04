/**
 * One-time backfill: rewrites every existing Clerk user's publicMetadata
 * from the legacy `{ role: "x" }` shape to the new `{ roles: ["x"] }` shape.
 *
 * Defaults to a dry run (prints what would change, writes nothing). Pass
 * --apply to actually mutate Clerk user records.
 *
 * Usage:
 *   bun run scripts/migrate-roles.ts            # dry run
 *   bun run scripts/migrate-roles.ts --apply     # actually rewrite
 *
 * Safe to delete once run against every environment that needs it.
 */
import { clerkClient } from "@clerk/nextjs/server";

async function main() {
  const apply = process.argv.includes("--apply");
  const client = await clerkClient();

  let checked = 0;
  let migrated = 0;
  let skipped = 0;
  let offset = 0;
  const limit = 100;

  for (;;) {
    const page = await client.users.getUserList({ limit, offset });
    if (page.data.length === 0) break;

    for (const user of page.data) {
      checked++;
      const metadata = user.publicMetadata as { role?: string; roles?: string[] };

      if (metadata.roles) {
        skipped++;
        continue;
      }
      if (!metadata.role) {
        skipped++;
        continue;
      }

      console.log(`${apply ? "Migrating" : "[dry run] Would migrate"} ${user.id}: role="${metadata.role}" -> roles=["${metadata.role}"]`);

      if (apply) {
        await client.users.updateUser(user.id, {
          publicMetadata: { roles: [metadata.role] },
        });
      }
      migrated++;
    }

    offset += limit;
  }

  console.log(`\nDone. Checked ${checked}, ${apply ? "migrated" : "would migrate"} ${migrated}, skipped ${skipped}.`);
  if (!apply) {
    console.log("This was a dry run — re-run with --apply to write changes.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
