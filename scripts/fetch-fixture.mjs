import { mkdir, writeFile } from "node:fs/promises";
const username = process.argv[2] ?? "erik";
if (!/^[a-z0-9_-]{2,30}$/i.test(username)) throw new Error("Invalid username");
const get = async (path) => {
  const response = await fetch(
    `https://api.chess.com/pub/player/${username}${path}`,
    { signal: AbortSignal.timeout(30000) },
  );
  if (!response.ok) throw new Error(`Chess.com ${response.status}`);
  return response.json();
};
const profile = await get("");
const { archives } = await get("/games/archives");
const latest = archives.at(-1);
const year = latest.split("/").at(-2);
const selected = archives.filter((url) => url.split("/").at(-2) === year);
const games = [];
for (const url of selected) {
  const suffix = url.split(`/player/${username}`)[1];
  const month = await get(suffix);
  games.push(...month.games);
  console.log(`Fetched ${suffix}: ${month.games.length} public games`);
}
await mkdir("src/dev/data", { recursive: true });
await writeFile(
  "src/dev/data/public-games.json",
  JSON.stringify(
    { username, profile, archives, games, fetchedAt: Date.now() },
    null,
    2,
  ),
);
console.log(`Saved ${games.length} unmodified public games from ${year}`);
