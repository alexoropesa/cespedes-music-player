import { RightsHeader } from "@/components/views/section-headers";

export default function Layout({ children }: LayoutProps<"/rights">) {
  return (
    <>
      <RightsHeader />
      {children}
    </>
  );
}
