"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useMounted } from "@/hooks/use-mounted";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const OPTIONS = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Oscuro", icon: Moon },
  { value: "system", label: "Automático", icon: Monitor },
] as const;

/** Selector de tema claro / oscuro / automático (UC-23, pulido del Paso 10). */
export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  // El tema real solo se conoce en el cliente y los ids de Radix se generan con `useId`: hasta
  // montar se dibuja un botón equivalente sin menú, así el HTML del servidor siempre coincide.
  const mounted = useMounted();
  const Icon = mounted && resolvedTheme === "dark" ? Moon : Sun;

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" aria-label="Tema" data-testid="theme-toggle" disabled>
        <Icon className="size-4" />
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Tema" data-testid="theme-toggle">
          <Icon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.value}
            data-testid={`theme-${option.value}`}
            aria-current={mounted && theme === option.value}
            onSelect={() => setTheme(option.value)}
          >
            <option.icon className="size-4" />
            {option.label}
            {mounted && theme === option.value ? (
              <span className="text-muted-foreground ml-auto text-xs">actual</span>
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
