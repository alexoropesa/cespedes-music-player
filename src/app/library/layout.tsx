import { LibraryHeader } from "@/components/views/section-headers";

export default function Layout({ children }: LayoutProps<"/library">) {
  return (
    <>
      <LibraryHeader />
      {children}
    </>
  );
}
