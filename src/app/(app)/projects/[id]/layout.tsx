import type { ReactNode } from "react";
import { ProjectLoader } from "@/components/shell/project-loader";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProjectLoader projectId={id}>{children}</ProjectLoader>;
}
