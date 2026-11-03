import type { Metadata } from "next";
import { WorkspaceSettings } from "@/components/views/settings";

export const metadata: Metadata = { title: "Workspace" };

export default function Page() {
  return <WorkspaceSettings />;
}
