import type { Metadata } from "next";
import { ProjectsPage } from "@/components/projects/projects-page";

export const metadata: Metadata = { title: "Proyectos · GanttPro" };

export default function Page() {
  return <ProjectsPage />;
}
