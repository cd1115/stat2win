import Link from "next/link";
import AuthButton from "@/components/AuthButton";

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-black/70 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-bold tracking-tight">
          Stat2Win
        </Link>

        <nav className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="rounded-lg px-3 py-2 text-sm hover:bg-white/10"
          >
            Dashboard
          </Link>

          <AuthButton />
        </nav>
      </div>
    </header>
  );
}
