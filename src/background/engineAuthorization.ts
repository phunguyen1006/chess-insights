import type { Request } from "../shared/types";
import { cleanUsername } from "../data/api/chessComApi";
import { analysisState } from "../data/storage/analysisRepository";
import { historicalInsightsUrl } from "../analysis/safety";
const LEASE_KEY = "ci-engine-authorization";
export async function isEngineActive(username: string) {
  const lease = (await chrome.storage.session.get(LEASE_KEY))[LEASE_KEY] as
    Lease | undefined;
  return !!lease && lease.username === username && lease.expires > Date.now();
}
export async function ownsEngine(tabId: number, username: string) {
  const lease = (await chrome.storage.session.get(LEASE_KEY))[LEASE_KEY] as
    Lease | undefined;
  return lease?.tabId === tabId && lease.username === username;
}
interface Lease {
  token: string;
  username: string;
  tabId: number;
  expires: number;
  heartbeat: number;
  claimed: boolean;
}
export function releaseEngine(username: string, token?: string) {
  const next = authorizationQueue.then(async () => {
    const lease = (await chrome.storage.session.get(LEASE_KEY))[LEASE_KEY] as
      Lease | undefined;
    if (lease?.username === username && (!token || lease.token === token))
      await chrome.storage.session.remove(LEASE_KEY);
  });
  authorizationQueue = next.catch(() => undefined);
  return next;
}
type EngineRequest = Extract<
  Request,
  {
    type:
      | "ci:engine-open"
      | "ci:engine-claim"
      | "ci:engine-guard"
      | "ci:engine-release";
  }
>;
let authorizationQueue: Promise<unknown> = Promise.resolve();
export function engineAuthorization(
  message: EngineRequest,
  sender: chrome.runtime.MessageSender,
) {
  const next = authorizationQueue.then(() => authorize(message, sender));
  authorizationQueue = next.catch(() => undefined);
  return next;
}
async function authorize(
  message: EngineRequest,
  sender: chrome.runtime.MessageSender,
) {
  const now = Date.now(),
    lease = (await chrome.storage.session.get(LEASE_KEY))[LEASE_KEY] as
      Lease | undefined;
  if (message.type === "ci:engine-open") {
    const tab =
      sender.tab?.id === undefined
        ? null
        : await chrome.tabs.get(sender.tab.id);
    if (
      sender.tab?.id === undefined ||
      !sender.url?.startsWith("https://www.chess.com/") ||
      tab?.active === false ||
      !historicalInsightsUrl(tab?.url ?? "")
    )
      throw new Error("Historical Mistakes content page required.");
    if (lease && lease.expires > now)
      throw new Error(
        lease.tabId === sender.tab.id
          ? "Analysis is already running in this Chess.com tab. Pause it before restarting."
          : "Analysis is already running in another Chess.com tab. Pause it there first.",
      );
    const username = cleanUsername(message.username),
      state = await analysisState(username);
    if (!state.queue?.ids.length)
      throw new Error("No completed games are queued.");
    const next: Lease = {
      token: crypto.randomUUID(),
      username,
      tabId: sender.tab.id,
      expires: now + 60000,
      heartbeat: now,
      claimed: false,
    };
    await chrome.storage.session.set({ [LEASE_KEY]: next });
    return { token: next.token };
  }
  if (
    !lease ||
    lease.token !== message.token ||
    lease.expires < now ||
    !sender.url?.startsWith(chrome.runtime.getURL("engine-host.html")) ||
    (sender.tab?.id !== undefined && sender.tab.id !== lease.tabId)
  )
    throw new Error("Historical engine authorization expired.");
  if (message.type === "ci:engine-release") {
    await chrome.storage.session.remove(LEASE_KEY);
    return true;
  }
  const tab = await chrome.tabs.get(lease.tabId);
  if (tab.active === false || !historicalInsightsUrl(tab.url ?? "")) {
    await chrome.storage.session.remove(LEASE_KEY);
    throw new Error("Engine is restricted to historical Mistakes.");
  }
  if (message.type === "ci:engine-claim" && lease.claimed)
    throw new Error("Engine authorization has already been used.");
  if (message.type === "ci:engine-guard" && !lease.claimed)
    throw new Error("Engine authorization must be claimed first.");
  await chrome.storage.session.set({
    [LEASE_KEY]: {
      ...lease,
      claimed: true,
      expires: now + 60000,
      heartbeat: now,
    },
  });
  return message.type === "ci:engine-claim" ? lease.username : true;
}
