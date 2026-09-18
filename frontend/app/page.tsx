"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export default function Home() {
  const { user, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    router.replace(user ? "/overview" : "/login");
  }, [ready, user, router]);

  return (
    <div className="min-h-screen grid place-items-center">
      <div className="skeleton h-8 w-40" />
    </div>
  );
}
