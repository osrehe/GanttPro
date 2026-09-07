import type { Metadata } from "next";
import { GanttView } from "@/components/gantt/gantt-view";

export const metadata: Metadata = { title: "Gantt · GanttPro" };

export default function GanttPage() {
  return <GanttView />;
}
