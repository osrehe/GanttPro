import type { Metadata } from "next";
import { BaselinesView } from "@/components/tracking/baselines-view";

export const metadata: Metadata = { title: "Líneas base · GanttPro" };

export default function Page() {
  return <BaselinesView />;
}
