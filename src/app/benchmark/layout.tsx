import { BenchmarkHeader } from "@/components/views/section-headers";

export default function Layout({ children }: LayoutProps<"/benchmark">) {
  return (
    <>
      <BenchmarkHeader />
      {children}
    </>
  );
}
