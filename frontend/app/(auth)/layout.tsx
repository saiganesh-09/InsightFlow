"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (ready && user) router.replace("/overview");
  }, [ready, user, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-ink-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-accent grid place-items-center font-bold text-white">I</div>
            <span className="text-xl font-bold text-white">InsightFlow</span>
          </div>
          <p className="text-sm text-muted">Real-time product analytics &amp; intelligence</p>
        </div>
        {children}
      </div>
    </div>
  );
}
