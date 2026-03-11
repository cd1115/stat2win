import axios from "axios";

/**
 * Devuelve: { spreadHome, spreadAway, total }
 * - spreadHome: número (ej: -5.5) para el home team
 * - spreadAway: número (ej: +5.5) para el away team
 * - total: número (ej: 221.5)
 */
function extractLinesFromEvent(ev) {
  const dk = (ev.bookmakers || []).find((b) => b.key === "draftkings");
  if (!dk) return null;

  const spreads = (dk.markets || []).find((m) => m.key === "spreads");
  const totals = (dk.markets || []).find((m) => m.key === "totals");

  // spreads: outcomes [{ name: teamName, point: number, price: ... }, ...]
  let spreadHome = null;
  let spreadAway = null;
  if (spreads?.outcomes?.length) {
    const home = spreads.outcomes.find((o) => o.name === ev.home_team);
    const away = spreads.outcomes.find((o) => o.name === ev.away_team);
    spreadHome = typeof home?.point === "number" ? home.point : null;
    spreadAway = typeof away?.point === "number" ? away.point : null;
  }

  // totals: normalmente outcomes [{ name: "Over", point: number }, { name:"Under", point:number }]
  let total = null;
  if (totals?.outcomes?.length) {
    const over = totals.outcomes.find(
      (o) => String(o.name).toLowerCase() === "over",
    );
    // casi siempre Over/Under comparten el mismo point
    total = typeof over?.point === "number" ? over.point : null;
    if (total === null) {
      const any = totals.outcomes.find((o) => typeof o.point === "number");
      total = any?.point ?? null;
    }
  }

  if (spreadHome === null && spreadAway === null && total === null) return null;

  return { spreadHome, spreadAway, total };
}

async function fetchDraftKingsLines({ apiKey, sportKey }) {
  const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds`;
  const res = await axios.get(url, {
    params: {
      apiKey,
      bookmakers: "draftkings",
      markets: "spreads,totals",
      oddsFormat: "american",
      dateFormat: "iso",
    },
    timeout: 20000,
  });

  return res.data
    .map((ev) => {
      const lines = extractLinesFromEvent(ev);
      return {
        id: ev.id,
        sport_key: ev.sport_key,
        commence_time: ev.commence_time,
        home_team: ev.home_team,
        away_team: ev.away_team,
        lines,
      };
    })
    .filter((x) => x.lines);
}

// Ejemplo de uso
const API_KEY = process.env.ODDS_API_KEY;

const nba = await fetchDraftKingsLines({
  apiKey: API_KEY,
  sportKey: "basketball_nba",
});
const mlb = await fetchDraftKingsLines({
  apiKey: API_KEY,
  sportKey: "baseball_mlb",
});

console.log("NBA lines:", nba.slice(0, 3));
console.log("MLB lines:", mlb.slice(0, 3));
