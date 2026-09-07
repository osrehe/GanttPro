"use client";

import {
  Download,
  FolderKanban,
  LogOut,
  Redo2,
  Settings,
  Undo2,
  Upload,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/stores/project-store";

interface AppShellProps {
  user: { name: string; email: string };
  children: ReactNode;
}

const VIEWS = [
  { key: "table", label: "Tabla" },
  { key: "gantt", label: "Gantt" },
  { key: "resources", label: "Recursos" },
] as const;

export function AppShell({ user, children }: AppShellProps) {
  const pathname = usePathname();
  const match = /^\/projects\/([^/]+)(?:\/([^/]+))?/.exec(pathname);
  const projectId = match?.[1] ?? null;
  const view = match?.[2] ?? null;
  const project = useProjectStore((s) => s.project);
  const historyState = useProjectStore((s) => s.historyState);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  useShortcuts();

  const nav = [
    {
      href: "/projects",
      label: "Proyectos",
      icon: FolderKanban,
      active: pathname.startsWith("/projects") && !view,
    },
    {
      href: projectId ? `/projects/${projectId}/resources` : "/projects",
      label: "Recursos",
      icon: Users,
      active: view === "resources",
      disabled: !projectId,
    },
    {
      href: "/settings",
      label: "Configuración",
      icon: Settings,
      active: pathname.startsWith("/settings"),
    },
  ];

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="bg-sidebar text-sidebar-foreground flex w-56 shrink-0 flex-col border-r">
        <div className="flex h-14 items-center px-4">
          <Link href="/projects" className="text-lg font-semibold tracking-tight">
            GanttPro
          </Link>
        </div>
        <Separator />
        <nav className="flex flex-1 flex-col gap-1 p-2" aria-label="Principal">
          {nav.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              aria-disabled={item.disabled}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm",
                item.active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "hover:bg-sidebar-accent/60",
                item.disabled && "pointer-events-none opacity-50",
              )}
            >
              <item.icon className="size-4" aria-hidden />
              {item.label}
            </Link>
          ))}
        </nav>
        <Separator />
        <div className="flex items-center justify-between gap-2 p-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium" data-testid="user-name">
              {user.name}
            </p>
            <p className="text-muted-foreground truncate text-xs">{user.email}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            <LogOut className="size-4" />
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
          <h1 className="min-w-0 truncate text-base font-semibold" data-testid="project-title">
            {projectId ? (project?.name ?? "Cargando proyecto…") : "Proyectos"}
          </h1>
          {projectId ? (
            <div
              className="ml-2 flex items-center rounded-md border p-0.5"
              role="tablist"
              aria-label="Vista"
            >
              {VIEWS.map((v) => (
                <Link
                  key={v.key}
                  role="tab"
                  aria-selected={view === v.key}
                  href={`/projects/${projectId}/${v.key}`}
                  className={cn(
                    "rounded px-3 py-1 text-sm",
                    view === v.key ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                  )}
                >
                  {v.label}
                </Link>
              ))}
            </div>
          ) : null}
          <div className="ml-auto flex items-center gap-1">
            {projectId ? (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Deshacer"
                      disabled={!historyState.canUndo || historyState.busy}
                      onClick={() => void undo()}
                    >
                      <Undo2 className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {historyState.undoLabel
                      ? `Deshacer ${historyState.undoLabel} (Ctrl+Z)`
                      : "Nada que deshacer"}
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Rehacer"
                      disabled={!historyState.canRedo || historyState.busy}
                      onClick={() => void redo()}
                    >
                      <Redo2 className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {historyState.redoLabel
                      ? `Rehacer ${historyState.redoLabel} (Ctrl+Y)`
                      : "Nada que rehacer"}
                  </TooltipContent>
                </Tooltip>
                <Separator orientation="vertical" className="mx-1 h-6" />
              </>
            ) : null}
            <Button variant="outline" size="sm" disabled title="Disponible en el Paso 9">
              <Download className="size-4" />
              Exportar
            </Button>
            <Button variant="outline" size="sm" disabled title="Disponible en el Paso 9">
              <Upload className="size-4" />
              Importar
            </Button>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
