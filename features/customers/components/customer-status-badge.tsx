"use client";

import { Badge } from "@/components/ui/badge";

export function CustomerStatusBadge({ status }: { status: "ACTIVE" | "INACTIVE" }) {
  return <Badge variant={status === "ACTIVE" ? "success" : "secondary"}>{status === "ACTIVE" ? "Active" : "Inactive"}</Badge>;
}
