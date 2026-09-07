import type { Metadata } from "next";
import { AuditView } from "@/components/tracking/audit-view";

export const metadata: Metadata = { title: "Auditoría · GanttPro" };

export default function Page() {
  return <AuditView />;
}
