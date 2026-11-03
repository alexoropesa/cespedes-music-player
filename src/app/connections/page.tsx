import type { Metadata } from "next";
import { ConnectionsView } from "@/components/views/connections";

export const metadata: Metadata = { title: "Connections" };

export default function Page() {
  return <ConnectionsView />;
}
