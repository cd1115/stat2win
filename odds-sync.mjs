import axios from "axios";

/**
 * Devuelve:
 * {
 *   spreadHome,
 *   spreadAway,
 *   total,
 *   moneylineHome,
 *   moneylineAway
 * }
 */
function extractLinesFromEvent(ev) {
  const dk = (ev.bookmakers || []).find((b) => b.key === "draftkings");
  if (!dk) return null;

  const spreads = (dk.markets || []).find((m) => m.key === "spreads");
  const totals = (dk.markets || []).find((m) => m.key === "totals");
  const h2h = (dk.markets || []).find((m) => m.key === "h2h");

  let spreadHome = null;
  let spreadAway = null;
  if (spreads?.outcomes?.length) {
    const home = spreads.outcomes.find((o) => o.name === ev.home_team);
    const away = spreads.outcomes.find((o) => o.name === ev.away_team);
    spreadHome = typeof home?.point === "number" ? home.point : null;
    spreadAway = typeof away?.point === "number" ? away.point : null;
  }

  let total = null;
  if (totals?.outcomes?.length) {
    const over = totals.outcomes.find(
      (o) => String(o.name).toLowerCase() === "over",
    );
    total = typeof over?.point === "number" ? over.point : null;

    if (total === null) {
      const any = totals.outcomes.find((o) => typeof o.point === "number");
      total = any?.point ?? null;
    }
  }

  let moneylineHome = null;
  let moneylineAway = null;
  if (h2h?.outcomes?.length) {
    const home = h2h.outcomes.find((o) => o.name === ev.home_team);
    const away = h2h.outcomes.find((o) => o.name === ev.away_team);
    moneylineHome = typeof home?.price === "number" ? home.price : null;
    moneylineAway = typeof away?.price === "number" ? away.price : null;
  }

  if (
    spreadHome === null &&
    spreadAway === null &&
    total === null &&
    moneylineHome === null &&
    moneylineAway === null
  ) {
    return null;
  }

  return {
    spreadHome,
    spreadAway,
    total,
    moneylineHome,
    moneylineAway,
  };
}

async function fetchDraftKingsLines({ apiKey, sportKey }) {
  const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds`;

  const res = await axios.get(url, {
    params: {
      apiKey,
      bookmakers: "draftkings",
      markets: "h2h,spreads,totals",
      oddsFormat: "american",
      dateFormat: "iso",
    },
    timeout: 20000,
  });

  const remaining =
    res.headers["x-requests-remaining"] ?? res.headers["X-Requests-Remaining"];
  const used = res.headers["x-requests-used"] ?? res.headers["X-Requests-Used"];

  console.log(
    `[${sportKey}] used=${used ?? "?"} remaining=${remaining ?? "?"}`,
  );

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

const API_KEY = process.env.ODDS_API_KEY;

if (!API_KEY) {
  console.error("Missing ODDS_API_KEY");
  process.exit(1);
}

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
