"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center text-sm text-white/60">
        Loading...
      </div>
    );
  }

  if (!user) return null;

  return <>{children}</>;
}
