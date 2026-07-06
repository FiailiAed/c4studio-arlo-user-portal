"use client";

import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { ArloLoader } from "@/components/ui/arlo-loader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useActiveOrg } from "@/components/active-org-provider";
import { cn } from "@/lib/utils";
import { hasAnyRole } from "@/lib/roles";
import type { Doc, Id } from "../../../convex/_generated/dataModel";

type OrgUnit = Doc<"orgUnits">;

const SELECT_CLASSNAME =
  "rounded-md border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50";

/**
 * league_admin builder for the arbitrary-depth org hierarchy (e.g. SJYLAX's
 * League -> Township -> Program -> Division -> Team). `unitType` is free
 * text by design (see convex/schema.ts) so this UI never needs to know the
 * shape ahead of time.
 */
export default function OrgUnitsPage() {
  const { activeOrgId, activeOrg, memberships } = useActiveOrg();

  if (memberships === undefined || (activeOrgId && memberships.length > 0 && !activeOrg)) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <ArloLoader />
      </div>
    );
  }

  if (!activeOrgId) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center py-12 px-4">
        <p className="text-sm text-muted-foreground">
          Select an organization above to manage its hierarchy.
        </p>
      </main>
    );
  }

  return <OrgUnitsGate orgId={activeOrgId} orgName={activeOrg?.name} />;
}

/**
 * Gate on the caller's own role before ever calling the league_admin-gated
 * orgUnits queries — those throw "Forbidden" for non-admins (rather than
 * returning null), which would otherwise leave useQuery stuck in a
 * permanent error state now that middleware no longer keeps non-admins out
 * of /admin/* routes.
 */
function OrgUnitsGate({ orgId, orgName }: { orgId: Id<"organizations">; orgName?: string }) {
  const myRoles = useQuery(api.orgMemberships.getMyRoles, { orgId });

  if (myRoles === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <ArloLoader />
      </div>
    );
  }

  if (!hasAnyRole(myRoles ?? undefined, ["league_admin", "super_admin"])) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center py-12 px-4">
        <p className="text-sm text-muted-foreground">You don&apos;t have access to this organization&apos;s settings.</p>
      </main>
    );
  }

  return <OrgUnitsBuilder orgId={orgId} orgName={orgName} />;
}

type TreeNode = OrgUnit & { children: TreeNode[] };

function buildTree(units: OrgUnit[]): TreeNode[] {
  const byId = new Map<Id<"orgUnits">, TreeNode>();
  for (const unit of units) byId.set(unit._id, { ...unit, children: [] });

  const roots: TreeNode[] = [];
  for (const unit of units) {
    const node = byId.get(unit._id)!;
    if (unit.parentUnitId && byId.has(unit.parentUnitId)) {
      byId.get(unit.parentUnitId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const byOrder = (a: TreeNode, b: TreeNode) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name);
  const sortRec = (nodes: TreeNode[]) => {
    nodes.sort(byOrder);
    for (const n of nodes) sortRec(n.children);
  };
  sortRec(roots);
  return roots;
}

function OrgUnitsBuilder({ orgId, orgName }: { orgId: Id<"organizations">; orgName?: string }) {
  const units = useQuery(api.orgUnits.listOrgUnits, { orgId });
  const createOrgUnit = useMutation(api.orgUnits.createOrgUnit);
  const renameOrgUnit = useMutation(api.orgUnits.renameOrgUnit);
  const moveOrgUnit = useMutation(api.orgUnits.moveOrgUnit);
  const deleteOrgUnit = useMutation(api.orgUnits.deleteOrgUnit);

  const [addParent, setAddParent] = useState<OrgUnit | null | "root">(null);
  const [newUnitType, setNewUnitType] = useState("");
  const [newName, setNewName] = useState("");
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [renameDrafts, setRenameDrafts] = useState<Record<string, string>>({});
  const [pendingDelete, setPendingDelete] = useState<OrgUnit | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [moveError, setMoveError] = useState<Record<string, string>>({});

  const tree = useMemo(() => buildTree(units ?? []), [units]);

  if (units === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <ArloLoader />
      </div>
    );
  }
  if (units === null) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center py-12 px-4">
        <p className="text-sm text-muted-foreground">You don&apos;t have access to this organization.</p>
      </main>
    );
  }

  function openAdd(parent: OrgUnit | "root") {
    setAddParent(parent);
    setNewUnitType("");
    setNewName("");
    setAddError(null);
  }

  async function handleAdd() {
    if (!newUnitType.trim() || !newName.trim() || addParent === null) return;
    setAddSubmitting(true);
    setAddError(null);
    try {
      await createOrgUnit({
        orgId,
        parentUnitId: addParent === "root" ? undefined : addParent._id,
        unitType: newUnitType.trim(),
        name: newName.trim(),
      });
      setAddParent(null);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Failed to create unit");
    } finally {
      setAddSubmitting(false);
    }
  }

  async function commitRename(unit: OrgUnit) {
    const draft = renameDrafts[unit._id];
    if (draft === undefined) return;
    const trimmed = draft.trim();
    if (!trimmed || trimmed === unit.name) return;
    await renameOrgUnit({ orgUnitId: unit._id, name: trimmed });
  }

  async function handleMove(unit: OrgUnit, newParentUnitId: string) {
    setMoveError((prev) => {
      const next = { ...prev };
      delete next[unit._id];
      return next;
    });
    try {
      await moveOrgUnit({
        orgUnitId: unit._id,
        newParentUnitId: newParentUnitId ? (newParentUnitId as Id<"orgUnits">) : undefined,
      });
    } catch (e) {
      setMoveError((prev) => ({
        ...prev,
        [unit._id]: e instanceof Error ? e.message : "Failed to move unit",
      }));
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleteSubmitting(true);
    setDeleteError(null);
    try {
      await deleteOrgUnit({ orgUnitId: pendingDelete._id });
      setPendingDelete(null);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Failed to delete unit");
    } finally {
      setDeleteSubmitting(false);
    }
  }

  function renderNode(node: TreeNode, depth: number) {
    return (
      <div key={node._id} className="space-y-2">
        <div
          className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2"
          style={{ marginLeft: depth * 24 }}
        >
          <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">{node.unitType}</span>
          <Input
            value={renameDrafts[node._id] ?? node.name}
            onChange={(e) => setRenameDrafts((prev) => ({ ...prev, [node._id]: e.target.value }))}
            onBlur={() => commitRename(node)}
            className="max-w-xs"
          />
          <select
            value={node.parentUnitId ?? ""}
            onChange={(e) => handleMove(node, e.target.value)}
            className={SELECT_CLASSNAME}
            aria-label={`Move ${node.name}`}
          >
            <option value="">No parent (root)</option>
            {(units ?? [])
              .filter((u) => u._id !== node._id)
              .map((u) => (
                <option key={u._id} value={u._id}>
                  {u.name}
                </option>
              ))}
          </select>
          <Button size="sm" variant="outline" onClick={() => openAdd(node)}>
            Add Child
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={node.children.length > 0}
            title={node.children.length > 0 ? "Delete children first" : undefined}
            onClick={() => {
              setPendingDelete(node);
              setDeleteError(null);
            }}
          >
            Delete
          </Button>
          {moveError[node._id] && <p className="w-full text-xs text-destructive">{moveError[node._id]}</p>}
        </div>
        {node.children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center py-12 px-4">
      <div className="w-full max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Org Hierarchy</h1>
            <p className="text-sm text-muted-foreground">{orgName ?? "Current organization"}</p>
          </div>
          <Button size="sm" onClick={() => openAdd("root")}>
            Add Top-Level Unit
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Structure</CardTitle>
            <CardDescription>
              Any depth, any shape — unit types are free text (e.g. Township, Program, Division, Team).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {tree.length === 0 ? (
              <p className="text-sm text-muted-foreground">No org units yet.</p>
            ) : (
              tree.map((node) => renderNode(node, 0))
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={addParent !== null} onOpenChange={(open) => !open && setAddParent(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {addParent === "root"
                ? "Add Top-Level Unit"
                : `Add Child Under ${addParent ? addParent.name : ""}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Unit type</label>
              <Input
                value={newUnitType}
                onChange={(e) => setNewUnitType(e.target.value)}
                placeholder="e.g. Township, Program, Division, Team"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Name</label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Cherry Hill" />
            </div>
          </div>
          {addError && <p className="text-sm text-destructive">{addError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddParent(null)} disabled={addSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={addSubmitting || !newUnitType.trim() || !newName.trim()}>
              {addSubmitting ? "Adding…" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete &quot;{pendingDelete?.name}&quot;?</DialogTitle>
            <DialogDescription>This can&apos;t be undone.</DialogDescription>
          </DialogHeader>
          {deleteError && <p className={cn("text-sm text-destructive")}>{deleteError}</p>}
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
