"use client";

import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
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

type ColumnType = "text" | "number" | "date" | "boolean" | "select";

const COLUMN_TYPES: ColumnType[] = ["text", "number", "date", "boolean", "select"];

interface ColumnDraft {
  label: string;
  type: ColumnType;
  optionsText: string;
}

const SELECT_CLASSNAME =
  "rounded-md border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50";

function emptyColumnDraft(): ColumnDraft {
  return { label: "", type: "text", optionsText: "" };
}

export default function AdminDataPage() {
  const { activeOrgId } = useActiveOrg();
  const tables = useQuery(api.customTables.listTables, activeOrgId ? { orgId: activeOrgId } : "skip");
  const createTable = useMutation(api.customTables.createTable);
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [columns, setColumns] = useState<ColumnDraft[]>([emptyColumnDraft()]);
  const [submitting, setSubmitting] = useState(false);

  function resetForm() {
    setName("");
    setColumns([emptyColumnDraft()]);
  }

  function updateColumn(index: number, patch: Partial<ColumnDraft>) {
    setColumns((prev) => prev.map((col, i) => (i === index ? { ...col, ...patch } : col)));
  }

  function addColumnRow() {
    setColumns((prev) => [...prev, emptyColumnDraft()]);
  }

  function removeColumnRow(index: number) {
    setColumns((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    if (!name.trim() || columns.length === 0 || !activeOrgId) return;
    setSubmitting(true);
    try {
      const tableId = await createTable({
        orgId: activeOrgId,
        name: name.trim(),
        columns: columns
          .filter((col) => col.label.trim())
          .map((col) => ({
            label: col.label.trim(),
            type: col.type,
            options:
              col.type === "select"
                ? col.optionsText
                    .split(",")
                    .map((opt) => opt.trim())
                    .filter(Boolean)
                : undefined,
          })),
      });
      setOpen(false);
      resetForm();
      router.push(`/admin/data/${tableId}`);
    } finally {
      setSubmitting(false);
    }
  }

  if (tables === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <ArloLoader />
      </div>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center py-12 px-4">
      <div className="w-full max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Custom Data Tables</h1>
          <Button size="sm" onClick={() => setOpen(true)}>
            New Table
          </Button>
        </div>

        {tables === null || tables.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-muted-foreground">
              No custom tables yet.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {tables.map((table) => (
              <Link key={table._id} href={`/admin/data/${table._id}`}>
                <Card className="transition-colors hover:bg-muted/50">
                  <CardHeader>
                    <CardTitle className="text-base">{table.name}</CardTitle>
                    <CardDescription>
                      {table.columns.length} column{table.columns.length === 1 ? "" : "s"}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Table</DialogTitle>
            <DialogDescription>
              This tool doesn&apos;t check your work the way a spreadsheet formula might — it
              won&apos;t catch typos, and it will let you type &quot;banana&quot; into a Quantity
              field without complaint. If you rename or remove a column later, any data already
              saved under the old column may become invisible or hard to find, even though it
              isn&apos;t actually deleted. Take a moment to get your column names and types right
              before you start entering real data.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Table name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Equipment" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Columns</label>
              {columns.map((col, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={col.label}
                    onChange={(e) => updateColumn(i, { label: e.target.value })}
                    placeholder="Column label"
                    className="flex-1"
                  />
                  <select
                    value={col.type}
                    onChange={(e) => updateColumn(i, { type: e.target.value as ColumnType })}
                    className={SELECT_CLASSNAME}
                  >
                    {COLUMN_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  {col.type === "select" && (
                    <Input
                      value={col.optionsText}
                      onChange={(e) => updateColumn(i, { optionsText: e.target.value })}
                      placeholder="opt1, opt2, opt3"
                      className="flex-1"
                    />
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => removeColumnRow(i)}
                    disabled={columns.length === 1}
                  >
                    Remove
                  </Button>
                </div>
              ))}
              <Button type="button" size="sm" variant="outline" onClick={addColumnRow}>
                Add Column
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting || !name.trim()}>
              {submitting ? "Creating…" : "Create Table"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
