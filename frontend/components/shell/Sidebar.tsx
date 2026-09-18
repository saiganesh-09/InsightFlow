"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/overview", label: "Overview", icon: "◈" },
  { href: "/realtime", label: "Realtime", icon: "●" },
  { href: "/events", label: "Events", icon: "≡" },
  { href: "/users", label: "Users", icon: "◉" },
  { href: "/funnels", label: "Funnels", icon: "▽" },
  { href: "/insights", label: "AI Insights", icon: "✦" },
  { href: "/reports", label: "Reports", icon: "▤" },
  { href: "/integration", label: "API / Integration", icon: "⚿" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  return (
    <>
      {/* mobile scrim */}
      {open && (
        <div className="fixed inset-0 bg-black/60 z-30 lg:hidden" onClick={onClose} />
      )}
      <aside
        className={cn(
          "fixed z-40 inset-y-0 left-0 w-60 bg-ink-950 border-r border-ink-600 flex flex-col transition-transform lg:translate-x-0 lg:static",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center gap-2 px-5 h-14 border-b border-ink-600">
          <div className="w-7 h-7 rounded-lg bg-accent grid place-items-center text-sm font-bold text-white">I</div>
          <span className="font-bold text-white">InsightFlow</span>
        </div>
        <nav className="flex-1 overflow-y-auto py-3 px-2">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm mb-0.5 transition-colors",
                  active
                    ? "bg-ink-700 text-white font-semibold"
                    : "text-muted hover:text-slate-200 hover:bg-ink-800"
                )}
              >
                <span className={cn("w-4 text-center", item.href === "/realtime" && "text-emerald-400 live-dot")}>
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-4 py-3 border-t border-ink-600 text-[11px] text-subtle">
          InsightFlow v1.0 · self-hosted analytics
        </div>
      </aside>
    </>
  );
}
