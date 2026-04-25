import axios from "axios";
import * as cheerio from "cheerio";

async function run() {
  const url = "https://example.com"; // pon tu URL real
  const { data: html } = await axios.get(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    timeout: 15000,
  });

  const $ = cheerio.load(html);

  const items = [];
  $("a").each((_, el) => {
    const text = $(el).text().trim();
    const href = $(el).attr("href");
    if (text && href) items.push({ text, href });
  });

  console.log(items.slice(0, 20));
}

run().catch(console.error);
