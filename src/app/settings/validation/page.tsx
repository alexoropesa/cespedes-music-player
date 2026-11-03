import type { Metadata } from "next";
import { ValidationSettings } from "@/components/views/settings";

export const metadata: Metadata = { title: "Validation & storage" };

export default function Page() {
  return <ValidationSettings />;
}
