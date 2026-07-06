import type { Doc, Id } from "@/convex/_generated/dataModel";

export interface OrgUnitOption {
  id: Id<"orgUnits">;
  label: string;
}

/** Flattens the orgUnits tree into a depth-indented, alphabetically-sorted-per-level option list for a <select>. */
export function buildFlatOrgUnitOptions(units: Doc<"orgUnits">[]): OrgUnitOption[] {
  const byParent = new Map<string, Doc<"orgUnits">[]>();
  for (const unit of units) {
    const key = unit.parentUnitId ?? "root";
    byParent.set(key, [...(byParent.get(key) ?? []), unit]);
  }

  const options: OrgUnitOption[] = [];
  function walk(parentKey: string, depth: number) {
    const children = (byParent.get(parentKey) ?? [])
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
    for (const unit of children) {
      options.push({ id: unit._id, label: `${"— ".repeat(depth)}${unit.name} (${unit.unitType})` });
      walk(unit._id, depth + 1);
    }
  }
  walk("root", 0);
  return options;
}
