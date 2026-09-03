"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";

export default function HomePage() {
  const router = useRouter();
  const session = useAuthStore((s) => s.session);

  useEffect(() => {
    router.replace(session ? "/schedule" : "/login");
  }, [session, router]);

  return (
    <main className="flex min-h-[100dvh] items-center justify-center">
      <p className="font-mono text-xs tracking-wide text-muted">Загрузка…</p>
    </main>
  );
}
