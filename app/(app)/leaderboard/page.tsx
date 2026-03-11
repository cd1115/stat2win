import { redirect } from "next/navigation";

export default function LeaderboardIndexPage() {
  // Keep the root route clean: send users to NBA leaderboard.
  // Later you can add /leaderboard/nfl, /leaderboard/mlb, /leaderboard/futbol, etc.
  redirect("/leaderboard/nba");
}
