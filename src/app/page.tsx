"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { readLastTab, useAuthHydrated, useAuthStore } from "@/lib/auth-store";

export default function HomePage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const session = useAuthStore((s) => s.session);

  useEffect(() => {
    if (!hydrated) return;
    router.replace(session ? readLastTab() : "/login");
  }, [hydrated, session, router]);

  return (
    <main className="flex min-h-[100dvh] items-center justify-center">
      <p className="font-mono text-xs tracking-wide text-muted">Загрузка…</p>
    </main>
  );
}
