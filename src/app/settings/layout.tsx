import { SettingsHeader } from "@/components/views/section-headers";

export default function Layout({ children }: LayoutProps<"/settings">) {
  return (
    <>
      <SettingsHeader />
      {children}
    </>
  );
}
