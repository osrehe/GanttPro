import type { Metadata } from "next";
import { DashboardView } from "@/components/tracking/dashboard-view";

export const metadata: Metadata = { title: "Dashboard · GanttPro" };

export default function Page() {
  return <DashboardView />;
}
