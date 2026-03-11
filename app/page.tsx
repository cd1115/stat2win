"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import StorePreviewSection from "@/components/store/StorePreviewSection";
import { useUserEntitlements } from "@/lib/useUserEntitlements";
import { STORE_PRODUCTS } from "@/lib/store-catalog";
import { getApp } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";

export default function HomePage() {
  const router = useRouter();
  const { isAuthed, plan, points, loading } = useUserEntitlements();

  return (
    <main className="min-h-screen relative overflow-hidden text-white">
      {/* Background EXACTLY like Login */}
      <div className="absolute inset-0 bg-[#05070B] from-[#070A12] via-[#090B18] to-[#1B1230]" />
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[520px] w-[820px] rounded-full bg-blue-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-56 left-20 h-[520px] w-[520px] rounded-full bg-fuchsia-500/15 blur-3xl" />

      <div className="relative mx-auto max-w-6xl px-6 py-14">
        {/* ... tu contenido */}

        <div className="relative mx-auto max-w-6xl px-6 py-14">
          {/* Top bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-xl font-bold tracking-tight text-white">
                Stat<span className="text-blue-400">2</span>Win
              </div>

              <div>
                <div className="text-sm text-white/70">Stat2Win</div>
                <div className="text-xs text-white/45">
                  Skill-based tournaments
                </div>
              </div>

              <div className="ml-3 hidden sm:flex items-center gap-2">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/75">
                  {loading ? "Loading..." : `Plan: ${plan.toUpperCase()}`}
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/75">
                  {loading ? "..." : `${points.toLocaleString()} pts`}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!isAuthed ? (
                <>
                  <Link
                    href="/login"
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/85 hover:border-white/20 hover:bg-white/10 transition"
                  >
                    Login
                  </Link>
                  <Link
                    href="/signup"
                    className="rounded-xl bg-blue-600/90 px-4 py-2 text-sm font-semibold hover:bg-blue-600 transition"
                  >
                    Create account
                  </Link>
                </>
              ) : (
                <Link
                  href="/overview"
                  className="rounded-xl bg-blue-600/90 px-4 py-2 text-sm font-semibold hover:bg-blue-600 transition"
                >
                  Go to app
                </Link>
              )}
            </div>
          </div>

          {/* Hero */}
          <section className="mt-12 grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
            <div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80 backdrop-blur">
                  No gambling
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80 backdrop-blur">
                  Weekly prizes
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80 backdrop-blur">
                  NBA • NFL • MLB (soon)
                </span>
              </div>

              <h1 className="mt-5 text-5xl font-extrabold tracking-tight">
                Pick winners. Earn points.{" "}
                <span className="text-blue-400">Win weekly prizes.</span>
              </h1>

              <p className="mt-5 max-w-xl text-white/70">
                Stat2Win is a skill-based sports competition. You make picks, we
                lock them before game time, and your points climb the weekly
                leaderboard. No odds. No gambling. Just strategy.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/login"
                  className="rounded-xl bg-blue-600/90 px-5 py-3 font-semibold hover:bg-blue-600 transition"
                >
                  Get started
                </Link>
                <a
                  href="#plans"
                  className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-white/85 hover:border-white/20 hover:bg-white/10 transition"
                >
                  See plans
                </a>
              </div>

              <p className="mt-4 text-xs text-white/45">
                Free plan includes ads. Premium removes ads and unlocks premium
                tournaments.
              </p>
            </div>

            {/* Right card */}
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl shadow-[0_0_0_1px_rgba(255,255,255,0.04)]">
              <div className="text-sm text-white/70">How prizes work</div>
              <div className="mt-3 space-y-3 text-sm text-white/75">
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="font-semibold text-white">
                    Weekly leaderboard
                  </div>
                  <div className="mt-1 text-white/65">
                    Earn points for correct picks. The Top players rank every
                    week.
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="font-semibold text-white">Rewards</div>
                  <div className="mt-1 text-white/65">
                    Gift cards, merch, and special rewards for Top finishers
                    (weekly).
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="font-semibold text-white">Fair play</div>
                  <div className="mt-1 text-white/65">
                    Picks lock automatically before game start time.
                  </div>
                </div>
              </div>
            </div>
          </section>

          <StorePreviewSection
            userPlan={plan}
            userPoints={points}
            onOpenStore={() => router.push("/store-app")}
            onOpenProduct={(productId) =>
              router.push(`/store-app?product=${productId}`)
            }
            onUpgrade={() => router.push("#plans")}
            onRedeem={async (id) => {
              try {
                const p = STORE_PRODUCTS.find((x) => x.id === id);
                if (!p?.pointsCost) {
                  alert("This item is not redeemable.");
                  return;
                }
                const fn = httpsCallable(
                  getFunctions(getApp()),
                  "redeemProduct",
                );
                await fn({ productId: id, pointsCost: p.pointsCost });
                alert("Redeemed ✅ (points updated)");
              } catch (e: any) {
                alert(e?.message || "Redeem failed");
              }
            }}
            onBuy={(id) => router.push(`/store-app?product=${id}`)}
          />
        </div>

        {/* Plans */}
        <section id="plans" className="mt-20">
          <h2 className="text-3xl font-semibold">Plans</h2>
          <p className="mt-3 text-white/70">
            Choose Free to start. Upgrade to Premium for no ads and premium
            tournaments.
          </p>
        </section>
      </div>
    </main>
  );
}
