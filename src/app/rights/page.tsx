import type { Metadata } from "next";
import { AuthorizationsView } from "@/components/views/rights";

export const metadata: Metadata = { title: "Authorizations" };

export default function Page() {
  return <AuthorizationsView />;
}
