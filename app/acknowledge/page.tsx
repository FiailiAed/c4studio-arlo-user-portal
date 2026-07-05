"use client";

import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import { ArloLoader } from "@/components/ui/arlo-loader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Id } from "../../convex/_generated/dataModel";

export default function AcknowledgePage() {
  const required = useQuery(api.documents.getMyRequiredDocuments);
  const acknowledgeDocument = useMutation(api.documents.acknowledgeDocument);
  const router = useRouter();
  const [acknowledgingId, setAcknowledgingId] = useState<Id<"documents"> | null>(null);

  const outstanding = (required ?? []).filter((r) => !r.acknowledged);

  useEffect(() => {
    if (required !== undefined && outstanding.length === 0) {
      router.replace("/dashboard");
    }
  }, [required, outstanding.length, router]);

  if (required === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <ArloLoader />
      </div>
    );
  }

  async function handleAcknowledge(documentId: Id<"documents">) {
    setAcknowledgingId(documentId);
    try {
      await acknowledgeDocument({ documentId });
    } finally {
      setAcknowledgingId(null);
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center py-12 px-4">
      <div className="w-full max-w-md space-y-4">
        <h1 className="text-2xl font-semibold">Acknowledgment Required</h1>
        <p className="text-sm text-muted-foreground">
          Please review and acknowledge the following before continuing.
        </p>

        {outstanding.map(({ document, url }) => (
          <Card key={document._id}>
            <CardHeader>
              <CardTitle className="text-base">{document.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {url && (
                <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm underline underline-offset-4">
                  View document
                </a>
              )}
              <Button
                className="w-full mt-4"
                onClick={() => handleAcknowledge(document._id)}
                disabled={acknowledgingId === document._id}
              >
                {acknowledgingId === document._id ? "Acknowledging…" : "Acknowledge"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
