"use client";

import { useQuery, useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export default function EditProfilePage() {
  const router = useRouter();
  const profile = useQuery(api.users.getCurrentUser);
  const updateProfile = useMutation(api.users.updateProfile);

  const [form, setForm] = useState({
    phone: "",
    dateOfBirth: "",
    street: "",
    city: "",
    state: "",
    zip: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setForm({
        phone: profile.phone ?? "",
        dateOfBirth: profile.dateOfBirth ?? "",
        street: profile.address?.street ?? "",
        city: profile.address?.city ?? "",
        state: profile.address?.state ?? "",
        zip: profile.address?.zip ?? "",
      });
    }
  }, [profile]);

  const set = (field: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const hasAddress = form.street || form.city || form.state || form.zip;
      await updateProfile({
        phone: form.phone || undefined,
        dateOfBirth: form.dateOfBirth || undefined,
        address: hasAddress
          ? {
              street: form.street,
              city: form.city,
              state: form.state,
              zip: form.zip,
            }
          : undefined,
      });
      router.push("/user");
    } finally {
      setSaving(false);
    }
  };

  if (profile === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center py-12 px-4">
      <div className="w-full max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Edit Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Contact */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={form.phone}
                    onChange={set("phone")}
                    placeholder="(555) 000-0000"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dateOfBirth">Date of birth</Label>
                  <Input
                    id="dateOfBirth"
                    type="date"
                    value={form.dateOfBirth}
                    onChange={set("dateOfBirth")}
                  />
                </div>
              </div>

              <Separator />

              {/* Address */}
              <p className="text-sm font-medium">Address</p>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="street">Street</Label>
                  <Input
                    id="street"
                    value={form.street}
                    onChange={set("street")}
                    placeholder="123 Main St"
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2 col-span-1">
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      value={form.city}
                      onChange={set("city")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">State</Label>
                    <Input
                      id="state"
                      value={form.state}
                      onChange={set("state")}
                      maxLength={2}
                      placeholder="CA"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="zip">Zip</Label>
                    <Input
                      id="zip"
                      value={form.zip}
                      onChange={set("zip")}
                      placeholder="90210"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving…" : "Save changes"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => router.push("/user")}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
