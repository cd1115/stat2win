// /lib/ids.ts
export type Sport = "NBA";

export function leaderboardDocId(weekId: string, sport: Sport) {
  // ✅ ÚNICO formato permitido
  return `${weekId}_${sport}`;
}

export function leaderboardUserDocPath(weekId: string, sport: Sport, uid: string) {
  // leaderboards/{weekId_sport}/users/{uid}
  return { lbId: leaderboardDocId(weekId, sport), userId: uid };
}

// Si sigues usando leaderboardsEntries (flat), usa SOLO este:
export function leaderboardEntryDocId(weekId: string, sport: Sport, uid: string) {
  return `${weekId}_${sport}_${uid}`;
}
