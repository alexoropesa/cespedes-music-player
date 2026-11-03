import { IngestHeader } from "@/components/views/section-headers";

export default function Layout({ children }: LayoutProps<"/ingest">) {
  return (
    <>
      <IngestHeader />
      {children}
    </>
  );
}
