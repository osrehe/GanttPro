import type { ReactNode } from "react";
import { ProjectLoader } from "@/components/shell/project-loader";
import { auth } from "@/lib/auth";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // El id de la sesión llega al cliente para que el polling ignore los cambios propios (UC-34).
  const session = await auth();
  return (
    <ProjectLoader projectId={id} currentUserId={session?.user?.id ?? null}>
      {children}
    </ProjectLoader>
  );
}
