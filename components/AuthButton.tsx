"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";

export default function AuthButton() {
  const { user, loading } = useAuth();
  const router = useRouter();

  if (loading) {
    return (
      <div className="rounded-lg border border-white/15 px-4 py-2 text-sm opacity-60">
        ...
      </div>
    );
  }

  if (!user) {
    return (
      <Link
        href="/login"
        className="rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/10"
      >
        Login
      </Link>
    );
  }

  return (
    <button
      onClick={async () => {
        await signOut(auth);
        router.push("/");
      }}
      className="rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/10"
    >
      Logout
    </button>
  );
}
