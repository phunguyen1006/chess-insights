import { database, idbResult, transactionDone } from "./database";
import type { Archive, NormalizedGame, UserRecord } from "../../shared/types";
import { fromUnixLocal } from "../../shared/dates";
export async function getGames(username: string): Promise<NormalizedGame[]> {
  const db = await database();
  const games = await idbResult(
    db
      .transaction("games")
      .objectStore("games")
      .index("username")
      .getAll(username),
  );
  return (games as NormalizedGame[])
    .map((g) => ({ ...g, localDate: fromUnixLocal(g.endTime) }))
    .sort((a, b) => a.endTime - b.endTime || a.id.localeCompare(b.id));
}
export async function getUser(
  username: string,
): Promise<UserRecord | undefined> {
  return idbResult(
    (await database()).transaction("users").objectStore("users").get(username),
  );
}
export async function saveUser(user: UserRecord) {
  const tx = (await database()).transaction("users", "readwrite");
  tx.objectStore("users").put(user);
  await transactionDone(tx);
}
export async function getArchive(id: string): Promise<Archive | undefined> {
  return idbResult(
    (await database()).transaction("archives").objectStore("archives").get(id),
  );
}
export async function upsertArchive(
  games: NormalizedGame[],
  archive: Archive,
  user: UserRecord,
) {
  const tx = (await database()).transaction(
    ["games", "archives", "users"],
    "readwrite",
  );
  for (const game of games) tx.objectStore("games").put(game);
  tx.objectStore("archives").put(archive);
  tx.objectStore("users").put(user);
  await transactionDone(tx);
}
