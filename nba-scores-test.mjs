import axios from "axios";

const apiKey = process.env.ODDS_API_KEY;

const url = "https://api.the-odds-api.com/v4/sports/basketball_nba/scores";
const res = await axios.get(url, {
  params: { apiKey, daysFrom: 2 },
  timeout: 20000,
});

console.log(res.data.slice(0, 3));
