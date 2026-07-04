"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface PlayerFormValues {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender?: string;
  school?: string;
  grade?: string;
}

interface PlayerFormProps {
  mode: "create" | "edit";
  initialValues?: PlayerFormValues;
  onSubmit: (values: PlayerFormValues) => Promise<void>;
}

const EMPTY_FORM: PlayerFormValues = {
  firstName: "",
  lastName: "",
  dateOfBirth: "",
  gender: "",
  school: "",
  grade: "",
};

export function PlayerForm({ mode, initialValues, onSubmit }: PlayerFormProps) {
  const [form, setForm] = useState<PlayerFormValues>(initialValues ?? EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const set = (field: keyof PlayerFormValues) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit({
        firstName: form.firstName,
        lastName: form.lastName,
        dateOfBirth: form.dateOfBirth,
        gender: form.gender || undefined,
        school: form.school || undefined,
        grade: form.grade || undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{mode === "create" ? "Add Player" : "Edit Player"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First name</Label>
              <Input
                id="firstName"
                value={form.firstName}
                onChange={set("firstName")}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last name</Label>
              <Input
                id="lastName"
                value={form.lastName}
                onChange={set("lastName")}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dateOfBirth">Date of birth</Label>
              <Input
                id="dateOfBirth"
                type="date"
                value={form.dateOfBirth}
                onChange={set("dateOfBirth")}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gender">Gender</Label>
              <select
                id="gender"
                value={form.gender}
                onChange={set("gender")}
                className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
              >
                <option value="">Unspecified</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="school">School</Label>
              <Input id="school" value={form.school} onChange={set("school")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="grade">Grade</Label>
              <Input id="grade" value={form.grade} onChange={set("grade")} />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={submitting}>
              {submitting
                ? mode === "create"
                  ? "Adding…"
                  : "Saving…"
                : mode === "create"
                  ? "Add Player"
                  : "Save Changes"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
