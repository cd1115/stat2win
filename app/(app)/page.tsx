import AuthButton from "@/components/AuthButton";
import Link from "next/link";
import { redirect } from "next/navigation";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#05070B] text-white">
      <div className="relative">
        {/* Hero */}
        <section className="mx-auto flex max-w-6xl flex-col items-center px-6 py-20 text-center">
          <h1 className="text-5xl font-bold tracking-tight sm:text-6xl">
            Stat<span className="text-blue-500">2</span>Win
          </h1>

          <p className="mt-6 max-w-2xl text-lg text-white/70">
            Skill-based sports competition.
            <br />
            Turn data into winning decisions.
          </p>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <a
              href="#pricing"
              className="rounded-lg bg-blue-600 px-6 py-3 font-semibold hover:bg-blue-700"
            >
              View Plans
            </a>
            <a
              href="#how"
              className="rounded-lg border border-white/15 px-6 py-3 hover:bg-white/5"
            >
              How it Works
            </a>
          </div>

          <p className="mt-6 text-xs text-white/50">
            No gambling • No odds • Skill-based competition
          </p>
        </section>

        {/* How it works */}
        <section id="how" className="mx-auto max-w-6xl px-6 py-14">
          <h2 className="text-3xl font-semibold tracking-tight">
            How it Works
          </h2>
          <p className="mt-3 max-w-2xl text-white/70">
            Simple weekly tournaments. Pick winners, earn points, climb the
            leaderboard, win prizes.
          </p>

          <div className="mt-10 grid gap-5 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-[#121418] p-6">
              <div className="text-xs text-white/60">Step 1</div>
              <div className="mt-2 text-lg font-semibold">Subscribe</div>
              <p className="mt-2 text-white/70">
                Get access to all tournaments with a single monthly plan.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#121418] p-6">
              <div className="text-xs text-white/60">Step 2</div>
              <div className="mt-2 text-lg font-semibold">Pick Games</div>
              <p className="mt-2 text-white/70">
                Choose winners daily. Picks lock shortly before game time.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#121418] p-6">
              <div className="text-xs text-white/60">Step 3</div>
              <div className="mt-2 text-lg font-semibold">Win Weekly</div>
              <p className="mt-2 text-white/70">
                Earn points and compete for Top 5 prizes every week.
              </p>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="mx-auto max-w-6xl px-6 py-14">
          <h2 className="text-3xl font-semibold tracking-tight">Pricing</h2>
          <p className="mt-3 max-w-2xl text-white/70">
            One plan. Full access. Weekly competition.
          </p>

          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-[#121418] p-7">
              <div className="flex items-center justify-between">
                <div className="text-xl font-semibold">Monthly</div>
                <span className="rounded-full border border-white/15 bg-[#1A1F29] px-3 py-1 text-xs text-white/70">
                  Most popular
                </span>
              </div>

              <div className="mt-4 flex items-end gap-2">
                <div className="text-5xl font-bold">$9.99</div>
                <div className="pb-1 text-white/60">/ month</div>
              </div>

              <ul className="mt-6 space-y-3 text-white/70">
                <li>• Access to all active tournaments</li>
                <li>• Weekly leaderboard & prizes</li>
                <li>• Picks lock before games</li>
                <li>• Stats-focused experience</li>
              </ul>

              <a
                href="#"
                className="mt-8 inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-6 py-3 font-semibold hover:bg-blue-700"
              >
                Subscribe
              </a>

              <p className="mt-3 text-center text-xs text-white/50">
                Cancel anytime.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#121418] p-7">
              <div className="text-xl font-semibold">What you win</div>
              <p className="mt-3 text-white/70">
                Top performers earn real rewards—built to keep competition fun
                and fair.
              </p>

              <div className="mt-6 space-y-3 text-white/70">
                <div className="rounded-xl border border-white/10 bg-[#1A1F29] p-4">
                  🎁 Gift cards & store credits
                </div>
                <div className="rounded-xl border border-white/10 bg-[#1A1F29] p-4">
                  🧢 Jerseys, hats, and merch
                </div>
                <div className="rounded-xl border border-white/10 bg-[#1A1F29] p-4">
                  🏆 VIP tournaments & badges
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="mx-auto max-w-6xl px-6 py-14">
          <h2 className="text-3xl font-semibold tracking-tight">FAQ</h2>

          <div className="mt-10 grid gap-5 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-[#121418] p-6">
              <div className="font-semibold">Is this gambling?</div>
              <p className="mt-2 text-white/70">
                No. Stat2Win is a skill-based competition. No odds, no betting
                against the house.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#121418] p-6">
              <div className="font-semibold">How are points calculated?</div>
              <p className="mt-2 text-white/70">
                Correct picks earn points. Points add up weekly and determine
                leaderboard ranking.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#121418] p-6">
              <div className="font-semibold">Can I cancel anytime?</div>
              <p className="mt-2 text-white/70">
                Yes. Subscription can be canceled at any time and access ends at
                the period end.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#121418] p-6">
              <div className="font-semibold">Which sports are included?</div>
              <p className="mt-2 text-white/70">
                We support NFL, NBA, and MLB tournaments (starting with one
                league for MVP).
              </p>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-white/10 py-10">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 text-sm text-white/60 md:flex-row md:items-center md:justify-between">
            <div>
              © {new Date().getFullYear()} Stat2Win. All rights reserved.
            </div>
            <div className="flex gap-5">
              <a href="#" className="hover:text-white">
                Terms
              </a>
              <a href="#" className="hover:text-white">
                Privacy
              </a>
              <a href="#" className="hover:text-white">
                Contact
              </a>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}