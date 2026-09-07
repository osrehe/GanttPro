import type { Metadata } from "next";
import { TaskTable } from "@/components/table/task-table";

export const metadata: Metadata = { title: "Tabla · GanttPro" };

export default function TablePage() {
  return <TaskTable />;
}
