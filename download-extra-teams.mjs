import fs from "fs";
import path from "path";
import https from "https";

const OUT_DIR = "public/teams/soccer";

const TEAMS = [
  { slug: "fc-koln", query: "FC Koln" },
  { slug: "tsg-hoffenheim", query: "Hoffenheim" },
  { slug: "union-berlin", query: "Union Berlin" },
  { slug: "fc-augsburg", query: "Augsburg" },
  { slug: "parma-calcio-1913", query: "Parma" },
  { slug: "leeds-united", query: "Leeds United" },
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function download(url, file) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode}`));
        }

        const stream = fs.createWriteStream(file);
        res.pipe(stream);

        stream.on("finish", () => {
          stream.close();
          resolve();
        });
      })
      .on("error", reject);
  });
}

async function getLogo(query) {
  const url = `https://www.thesportsdb.com/api/v1/json/123/searchteams.php?t=${encodeURIComponent(query)}`;

  return new Promise((resolve) => {
    https.get(url, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          const team = json?.teams?.[0];
          resolve(team?.strBadge || null);
        } catch {
          resolve(null);
        }
      });
    });
  });
}

async function main() {
  for (const t of TEAMS) {
    const file = path.join(OUT_DIR, `${t.slug}.png`);

    if (fs.existsSync(file)) {
      console.log(`- ${t.slug} ya existe`);
      continue;
    }

    const logo = await getLogo(t.query);

    if (!logo) {
      console.log(`✗ ${t.slug}`);
      continue;
    }

    await download(logo, file);
    console.log(`✓ ${t.slug}`);

    await sleep(2000);
  }
}

main();
