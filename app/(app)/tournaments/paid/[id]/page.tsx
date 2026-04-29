/**
 * Legacy [id] route — kept to satisfy Next.js static export requirement.
 * All real functionality lives at /tournaments/paid/detail?id=xxx
 * generateStaticParams returns [] so no pages are pre-rendered here.
 */

export function generateStaticParams() {
  return [];
}

export default function PaidTournamentLegacyPage() {
  return null;
}
