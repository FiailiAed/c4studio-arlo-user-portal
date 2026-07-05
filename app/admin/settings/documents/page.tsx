"use client";

import { useMutation, useQuery } from "convex/react";
import { useRef, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import { ArloLoader } from "@/components/ui/arlo-loader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getRoleConfig, type AppRole } from "@/lib/roles";
import type { Doc } from "../../../../convex/_generated/dataModel";

const ROLES: AppRole[] = ["family", "referee", "program_admin", "coach", "league_admin", "super_admin"];

type DocumentRow = Doc<"documents"> & { url: string | null; acknowledgmentCount: number };

export default function AdminDocumentsPage() {
  const documents = useQuery(api.documents.listDocuments);
  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const saveDocumentMetadata = useMutation(api.documents.saveDocumentMetadata);
  const deleteDocument = useMutation(api.documents.deleteDocument);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [requiredForRoles, setRequiredForRoles] = useState<AppRole[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [pendingDelete, setPendingDelete] = useState<DocumentRow | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  if (documents === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <ArloLoader />
      </div>
    );
  }

  function toggleRole(role: AppRole, checked: boolean) {
    setRequiredForRoles((prev) => (checked ? [...prev, role] : prev.filter((r) => r !== role)));
  }

  async function handleUpload() {
    const file = fileInputRef.current?.files?.[0];
    if (!title.trim() || !file) return;

    setUploading(true);
    setUploadError(null);
    try {
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) throw new Error("File upload failed");
      const { storageId } = await res.json();

      await saveDocumentMetadata({
        title: title.trim(),
        storageId,
        category: category.trim() || undefined,
        requiredForRoles,
      });

      setTitle("");
      setCategory("");
      setRequiredForRoles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Failed to upload document");
    } finally {
      setUploading(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleteSubmitting(true);
    try {
      await deleteDocument({ documentId: pendingDelete._id });
      setPendingDelete(null);
    } finally {
      setDeleteSubmitting(false);
    }
  }

  const columns: DataTableColumn<DocumentRow>[] = [
    {
      key: "title",
      header: "Title",
      render: (d) =>
        d.url ? (
          <a href={d.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
            {d.title}
          </a>
        ) : (
          d.title
        ),
    },
    { key: "category", header: "Category", render: (d) => d.category ?? <span className="text-muted-foreground">—</span> },
    {
      key: "required",
      header: "Required For",
      render: (d) =>
        d.requiredForRoles.length === 0 ? (
          <span className="text-muted-foreground">Informational only</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {d.requiredForRoles.map((r) => (
              <Badge key={r} variant="secondary">{getRoleConfig(r)?.label ?? r}</Badge>
            ))}
          </div>
        ),
    },
    { key: "acks", header: "Acknowledged By", render: (d) => d.acknowledgmentCount },
  ];

  return (
    <main className="flex flex-1 flex-col items-center py-12 px-4">
      <div className="w-full max-w-4xl space-y-6">
        <h1 className="text-2xl font-semibold">Documents</h1>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upload a Document</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. League Rules of Play" />
            </div>
            <div className="space-y-1">
              <Label>Category (optional)</Label>
              <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Bylaws, Waiver" />
            </div>
            <div className="space-y-1">
              <Label>Required acknowledgment for</Label>
              <div className="flex flex-col gap-2">
                {ROLES.map((r) => (
                  <label key={r} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={requiredForRoles.includes(r)}
                      onChange={(e) => toggleRole(r, e.target.checked)}
                    />
                    {getRoleConfig(r)?.label ?? r}
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Leave all unchecked for an informational document that no one is required to acknowledge.
              </p>
            </div>
            <div className="space-y-1">
              <Label>File</Label>
              <input ref={fileInputRef} type="file" className="block text-sm" />
            </div>
            {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}
            <Button onClick={handleUpload} disabled={uploading || !title.trim()}>
              {uploading ? "Uploading…" : "Upload"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">All Documents</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              columns={columns}
              rows={(documents as DocumentRow[]) ?? []}
              getRowKey={(d) => d._id}
              emptyMessage="No documents uploaded yet."
              renderActions={(d) => (
                <Button size="sm" variant="destructive" onClick={() => setPendingDelete(d)}>
                  Delete
                </Button>
              )}
            />
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete &quot;{pendingDelete?.title}&quot;?</DialogTitle>
            <DialogDescription>
              This permanently removes the file and everyone&apos;s acknowledgment record for it.
            </DialogDescription>
          </DialogHeader>
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
