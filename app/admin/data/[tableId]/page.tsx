"use client";

import { useMutation, useQuery } from "convex/react";
import { use, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import { ArloLoader } from "@/components/ui/arlo-loader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { Id } from "../../../../convex/_generated/dataModel";

type ColumnType = "text" | "number" | "date" | "boolean" | "select";
type FieldValue = string | number | boolean | undefined;

interface Column {
  key: string;
  label: string;
  type: ColumnType;
  options?: string[];
}

const COLUMN_TYPES: ColumnType[] = ["text", "number", "date", "boolean", "select"];

const SELECT_CLASSNAME =
  "rounded-md border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50";

type PendingDelete =
  | { kind: "column"; key: string; label: string }
  | { kind: "record"; recordId: Id<"customRecords">; label: string };

/** Coerce a raw form input value into the FieldValue the given column type expects. */
function coerceForSubmit(type: ColumnType, raw: FieldValue): FieldValue {
  switch (type) {
    case "text":
    case "date":
    case "select":
      return raw as string;
    case "number":
      return raw === "" || raw === undefined ? undefined : Number(raw);
    case "boolean":
      return Boolean(raw);
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

/** Defensively coerce a loosely-typed stored value into a FieldValue for form state. */
function coerceForForm(type: ColumnType, value: unknown): FieldValue {
  if (value === undefined || value === null) {
    return type === "boolean" ? false : "";
  }
  switch (type) {
    case "text":
    case "date":
    case "select":
      return String(value);
    case "number":
      return Number(value);
    case "boolean":
      return Boolean(value);
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

function buildEmptyForm(columns: Column[]): Record<string, FieldValue> {
  const form: Record<string, FieldValue> = {};
  for (const col of columns) {
    form[col.key] = col.type === "boolean" ? false : "";
  }
  return form;
}

function buildFormFromRecord(columns: Column[], data: Record<string, unknown>): Record<string, FieldValue> {
  const form: Record<string, FieldValue> = {};
  for (const col of columns) {
    form[col.key] = coerceForForm(col.type, data[col.key]);
  }
  return form;
}

function FieldInput({
  column,
  value,
  onChange,
}: {
  column: Column;
  value: FieldValue;
  onChange: (value: FieldValue) => void;
}) {
  switch (column.type) {
    case "text":
      return (
        <Input
          type="text"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "number":
      return (
        <Input
          type="number"
          value={value === undefined ? "" : (value as number)}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "date":
      return (
        <Input
          type="date"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "boolean":
      return (
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
      );
    case "select":
      return (
        <select
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className={SELECT_CLASSNAME}
        >
          <option value="" disabled>
            Select…
          </option>
          {(column.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    default: {
      const _exhaustive: never = column.type;
      return _exhaustive;
    }
  }
}

function renderCellValue(column: Column, value: unknown) {
  if (value === undefined || value === null || value === "") {
    return <span className="text-muted-foreground">—</span>;
  }
  switch (column.type) {
    case "boolean":
      return value ? "Yes" : "No";
    case "text":
    case "date":
    case "select":
    case "number":
      return String(value);
    default: {
      const _exhaustive: never = column.type;
      return _exhaustive;
    }
  }
}

export default function AdminDataTablePage({
  params,
}: {
  params: Promise<{ tableId: string }>;
}) {
  const { tableId } = use(params);
  const id = tableId as Id<"tableDefinitions">;

  const result = useQuery(api.customTables.getTable, { tableId: id });
  const addColumn = useMutation(api.customTables.addColumn);
  const renameColumn = useMutation(api.customTables.renameColumn);
  const deleteColumn = useMutation(api.customTables.deleteColumn);
  const addRecord = useMutation(api.customTables.addRecord);
  const updateRecord = useMutation(api.customTables.updateRecord);
  const deleteRecord = useMutation(api.customTables.deleteRecord);

  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const [renameDrafts, setRenameDrafts] = useState<Record<string, string>>({});

  const [newColumnLabel, setNewColumnLabel] = useState("");
  const [newColumnType, setNewColumnType] = useState<ColumnType>("text");
  const [newColumnOptions, setNewColumnOptions] = useState("");
  const [addingColumn, setAddingColumn] = useState(false);

  const [recordDialogOpen, setRecordDialogOpen] = useState(false);
  const [editingRecordId, setEditingRecordId] = useState<Id<"customRecords"> | null>(null);
  const [recordForm, setRecordForm] = useState<Record<string, FieldValue>>({});
  const [recordSubmitting, setRecordSubmitting] = useState(false);

  if (result === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <ArloLoader />
      </div>
    );
  }

  if (result === null) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground text-sm">Table not found.</p>
      </div>
    );
  }

  const { table, records } = result;
  const columns = table.columns as Column[];

  function handleRenameChange(key: string, label: string) {
    setRenameDrafts((prev) => ({ ...prev, [key]: label }));
  }

  async function commitRename(key: string) {
    const label = renameDrafts[key];
    if (label === undefined) return;
    const trimmed = label.trim();
    const current = columns.find((c) => c.key === key);
    if (!trimmed || trimmed === current?.label) return;
    await renameColumn({ tableId: id, key, label: trimmed });
  }

  async function handleAddColumn() {
    if (!newColumnLabel.trim()) return;
    setAddingColumn(true);
    try {
      await addColumn({
        tableId: id,
        label: newColumnLabel.trim(),
        type: newColumnType,
        options:
          newColumnType === "select"
            ? newColumnOptions
                .split(",")
                .map((opt) => opt.trim())
                .filter(Boolean)
            : undefined,
      });
      setNewColumnLabel("");
      setNewColumnType("text");
      setNewColumnOptions("");
    } finally {
      setAddingColumn(false);
    }
  }

  function openAddRecord() {
    setEditingRecordId(null);
    setRecordForm(buildEmptyForm(columns));
    setRecordDialogOpen(true);
  }

  function openEditRecord(recordId: Id<"customRecords">, data: Record<string, unknown>) {
    setEditingRecordId(recordId);
    setRecordForm(buildFormFromRecord(columns, data));
    setRecordDialogOpen(true);
  }

  async function submitRecord() {
    setRecordSubmitting(true);
    try {
      const data: Record<string, FieldValue> = {};
      for (const col of columns) {
        data[col.key] = coerceForSubmit(col.type, recordForm[col.key]);
      }

      if (editingRecordId) {
        await updateRecord({ recordId: editingRecordId, data });
      } else {
        await addRecord({ tableId: id, data });
      }
      setRecordDialogOpen(false);
    } finally {
      setRecordSubmitting(false);
    }
  }

  async function confirmPendingDelete() {
    if (!pendingDelete) return;
    setDeleteSubmitting(true);
    try {
      if (pendingDelete.kind === "column") {
        await deleteColumn({ tableId: id, key: pendingDelete.key });
      } else {
        await deleteRecord({ recordId: pendingDelete.recordId });
      }
      setPendingDelete(null);
    } finally {
      setDeleteSubmitting(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center py-12 px-4">
      <div className="w-full max-w-5xl space-y-6">
        <h1 className="text-2xl font-semibold">{table.name}</h1>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Manage Columns</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              {columns.map((col) => (
                <div key={col.key} className="flex items-center gap-2">
                  <Input
                    value={renameDrafts[col.key] ?? col.label}
                    onChange={(e) => handleRenameChange(col.key, e.target.value)}
                    onBlur={() => commitRename(col.key)}
                    className="flex-1"
                  />
                  <span className="w-20 text-xs text-muted-foreground">{col.type}</span>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setPendingDelete({ kind: "column", key: col.key, label: col.label })}
                  >
                    Delete
                  </Button>
                </div>
              ))}
              {columns.length === 0 && (
                <p className="text-sm text-muted-foreground">No columns yet.</p>
              )}
            </div>

            <div className="space-y-2 border-t pt-4">
              <p className="text-xs text-muted-foreground">
                Heads up: removing a column can hide data that&apos;s already been entered for it,
                and this tool won&apos;t catch typos or wrong-looking entries the way a spreadsheet
                formula would.
              </p>
              <div className="flex items-center gap-2">
                <Input
                  value={newColumnLabel}
                  onChange={(e) => setNewColumnLabel(e.target.value)}
                  placeholder="New column label"
                  className="flex-1"
                />
                <select
                  value={newColumnType}
                  onChange={(e) => setNewColumnType(e.target.value as ColumnType)}
                  className={SELECT_CLASSNAME}
                >
                  {COLUMN_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                {newColumnType === "select" && (
                  <Input
                    value={newColumnOptions}
                    onChange={(e) => setNewColumnOptions(e.target.value)}
                    placeholder="opt1, opt2, opt3"
                    className="flex-1"
                  />
                )}
                <Button size="sm" onClick={handleAddColumn} disabled={addingColumn || !newColumnLabel.trim()}>
                  {addingColumn ? "Adding…" : "Add Column"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Records</CardTitle>
            <Button size="sm" onClick={openAddRecord} disabled={columns.length === 0}>
              Add Record
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  {columns.map((col) => (
                    <th key={col.key} className="px-6 py-3 font-medium">
                      {col.label}
                    </th>
                  ))}
                  <th className="px-6 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record._id} className="border-b last:border-0">
                    {columns.map((col) => (
                      <td key={col.key} className="px-6 py-3">
                        {renderCellValue(col, (record.data as Record<string, unknown>)[col.key])}
                      </td>
                    ))}
                    <td className="px-6 py-3 space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEditRecord(record._id, record.data as Record<string, unknown>)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() =>
                          setPendingDelete({ kind: "record", recordId: record._id, label: `record ${record._id}` })
                        }
                      >
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
                {records.length === 0 && (
                  <tr>
                    <td colSpan={columns.length + 1} className="px-6 py-6 text-center text-muted-foreground">
                      No records yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={recordDialogOpen} onOpenChange={setRecordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingRecordId ? "Edit Record" : "Add Record"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {columns.map((col) => (
              <div key={col.key} className="space-y-1">
                <label className="text-sm font-medium">{col.label}</label>
                <FieldInput
                  column={col}
                  value={recordForm[col.key]}
                  onChange={(value) => setRecordForm((prev) => ({ ...prev, [col.key]: value }))}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecordDialogOpen(false)} disabled={recordSubmitting}>
              Cancel
            </Button>
            <Button onClick={submitRecord} disabled={recordSubmitting}>
              {recordSubmitting ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete {pendingDelete?.kind === "column" ? `column "${pendingDelete.label}"` : "this record"}?
            </DialogTitle>
            <DialogDescription>
              {pendingDelete?.kind === "column"
                ? "This removes the column from the table. Data already saved under it won't be deleted, but it will no longer be visible."
                : "This will permanently remove this record. This can't be undone."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)} disabled={deleteSubmitting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmPendingDelete} disabled={deleteSubmitting}>
              {deleteSubmitting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
