import {
  Activity,
  Download,
  LayoutDashboard,
  Library,
  ListMusic,
  Plug,
  ScrollText,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: "reviews" | "queue" | "rights";
}

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Operate",
    items: [
      { href: "/", label: "Overview", icon: LayoutDashboard },
      { href: "/ingest", label: "Import track", icon: Download },
      { href: "/queue", label: "Queue monitor", icon: Activity, badge: "queue" },
      { href: "/library", label: "Library", icon: Library },
      { href: "/playlists", label: "Playlists", icon: ListMusic },
    ],
  },
  {
    label: "Assure",
    items: [
      { href: "/rights", label: "Rights & provenance", icon: ShieldCheck, badge: "rights" },
      { href: "/audit", label: "Audit log", icon: ScrollText },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/connections", label: "Connections", icon: Plug },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

export function isActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}
