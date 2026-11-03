import type { Metadata } from "next";
import { EngineSettings } from "@/components/views/settings";

export const metadata: Metadata = { title: "Engine settings" };

export default function Page() {
  return <EngineSettings />;
}
