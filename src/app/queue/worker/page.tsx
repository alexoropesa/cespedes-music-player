import type { Metadata } from "next";
import { WorkerView } from "@/components/views/queue";

export const metadata: Metadata = { title: "Worker & sandbox" };

export default function Page() {
  return <WorkerView />;
}
