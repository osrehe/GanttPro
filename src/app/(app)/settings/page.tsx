import type { Metadata } from "next";
import { SettingsView } from "@/components/settings/settings-view";

export const metadata: Metadata = { title: "Configuración · GanttPro" };

/** Preferencias globales (UC-37) y calendario laboral por proyecto (UC-04). */
export default function SettingsPage() {
  return <SettingsView />;
}
