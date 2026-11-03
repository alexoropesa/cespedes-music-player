import { QueueHeader } from "@/components/views/section-headers";

export default function Layout({ children }: LayoutProps<"/queue">) {
  return (
    <>
      <QueueHeader />
      {children}
    </>
  );
}
