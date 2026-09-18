"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { RangeProvider } from "@/lib/range";
import { Sidebar } from "@/components/shell/Sidebar";
import { Topbar } from "@/components/shell/Topbar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (ready && !user) router.replace("/login");
  }, [ready, user, router]);

  if (!ready || !user) {
    return (
      <div className="min-h-screen grid place-items-center bg-ink-950">
        <div className="space-y-3 w-64">
          <div className="skeleton h-8 w-full" />
          <div className="skeleton h-8 w-3/4" />
          <div className="skeleton h-8 w-1/2" />
        </div>
      </div>
    );
  }

  return (
    <RangeProvider>
      <div className="flex h-screen overflow-hidden bg-ink-900">
        <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
        <div className="flex-1 flex flex-col min-w-0">
          <Topbar onMenu={() => setMenuOpen(true)} />
          <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
        </div>
      </div>
    </RangeProvider>
  );
}
