"use client";

import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { ArloLoader } from "@/components/ui/arlo-loader";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useOrgId } from "@/lib/use-org-id";
import type { Doc } from "../../../convex/_generated/dataModel";

type OrgUnit = Doc<"orgUnits">;

interface TreeNode {
  unit: OrgUnit;
  children: TreeNode[];
}

function buildTree(units: OrgUnit[]): TreeNode[] {
  const byParent = new Map<string, OrgUnit[]>();
  for (const unit of units) {
    const key = unit.parentUnitId ?? "root";
    byParent.set(key, [...(byParent.get(key) ?? []), unit]);
  }
  function build(parentKey: string): TreeNode[] {
    return (byParent.get(parentKey) ?? [])
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name))
      .map((unit) => ({ unit, children: build(unit._id) }));
  }
  return build("root");
}

function TreeNodeRow({
  node,
  depth,
  unitTypes,
  onAddChild,
  onDelete,
}: {
  node: TreeNode;
  depth: number;
  unitTypes: string[];
  onAddChild: (parent: OrgUnit) => void;
  onDelete: (unit: OrgUnit) => void;
}) {
  return (
    <div>
      <div
        className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
        style={{ marginLeft: depth * 24 }}
      >
        <div>
          <span className="font-medium">{node.unit.name}</span>
          <span className="ml-2 text-xs text-muted-foreground">{node.unit.unitType}</span>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => onAddChild(node.unit)}>
            Add Child
          </Button>
          <Button size="sm" variant="destructive" onClick={() => onDelete(node.unit)}>
            Delete
          </Button>
        </div>
      </div>
      {node.children.map((child) => (
        <TreeNodeRow
          key={child.unit._id}
          node={child}
          depth={depth + 1}
          unitTypes={unitTypes}
          onAddChild={onAddChild}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

export default function AdminOrgUnitsPage() {
  const orgId = useOrgId();
  const units = useQuery(api.orgUnits.listOrgUnits, orgId ? { orgId } : "skip");
  const createOrgUnit = useMutation(api.orgUnits.createOrgUnit);
  const deleteOrgUnit = useMutation(api.orgUnits.deleteOrgUnit);

  const [createParent, setCreateParent] = useState<OrgUnit | "root" | null>(null);
  const [newUnitType, setNewUnitType] = useState("");
  const [newName, setNewName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pendingDelete, setPendingDelete] = useState<OrgUnit | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const tree = useMemo(() => buildTree(units ?? []), [units]);
  const unitTypes = useMemo(
    () => Array.from(new Set((units ?? []).map((u) => u.unitType))).sort(),
    [units]
  );

  if (!orgId || units === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <ArloLoader />
      </div>
    );
  }

  async function handleCreate() {
    if (!orgId || !newUnitType.trim() || !newName.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await createOrgUnit({
        orgId,
        parentUnitId: createParent && createParent !== "root" ? createParent._id : undefined,
        unitType: newUnitType.trim(),
        name: newName.trim(),
      });
      setCreateParent(null);
      setNewUnitType("");
      setNewName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create unit");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDelete() {
    if (!orgId || !pendingDelete) return;
    setDeleteSubmitting(true);
    setDeleteError(null);
    try {
      await deleteOrgUnit({ orgId, unitId: pendingDelete._id });
      setPendingDelete(null);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Failed to delete unit");
    } finally {
      setDeleteSubmitting(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center py-12 px-4">
      <div className="w-full max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Org Structure</h1>
            <p className="text-sm text-muted-foreground">
              Build your league&apos;s own hierarchy — e.g. League &gt; Township &gt; Program &gt; Division &gt; Team — with
              whatever level names make sense for you.
            </p>
          </div>
          <Button size="sm" onClick={() => setCreateParent("root")}>
            Add Top-Level Unit
          </Button>
        </div>

        <div className="space-y-2">
          {tree.length === 0 ? (
            <p className="text-sm text-muted-foreground">No org units yet.</p>
          ) : (
            tree.map((node) => (
              <TreeNodeRow
                key={node.unit._id}
                node={node}
                depth={0}
                unitTypes={unitTypes}
                onAddChild={(parent) => setCreateParent(parent)}
                onDelete={(unit) => {
                  setPendingDelete(unit);
                  setDeleteError(null);
                }}
              />
            ))
          )}
        </div>
      </div>

      <Dialog open={!!createParent} onOpenChange={(open) => !open && setCreateParent(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {createParent === "root" ? "New Top-Level Unit" : `New Unit under "${(createParent as OrgUnit | null)?.name}"`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Type</label>
              <Input
                value={newUnitType}
                onChange={(e) => setNewUnitType(e.target.value)}
                placeholder="e.g. Township, Division, Program"
                list="org-unit-types"
              />
              <datalist id="org-unit-types">
                {unitTypes.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Name</label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Cherry Hill" />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateParent(null)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={submitting || !newUnitType.trim() || !newName.trim()}>
              {submitting ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete &quot;{pendingDelete?.name}&quot;?</DialogTitle>
            <DialogDescription>
              This only works if the unit has no children. Move or delete its children first.
            </DialogDescription>
          </DialogHeader>
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)} disabled={deleteSubmitting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleteSubmitting}>
              {deleteSubmitting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
