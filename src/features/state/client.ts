import type { Reply, Request } from "../../shared/types";
export async function send<T>(message: Request): Promise<T> {
  const reply = (await chrome.runtime.sendMessage(message)) as Reply<T>;
  if (!reply?.ok)
    throw new Error(
      reply?.error.message ?? "Extension connection lost. Reload Chess.com.",
    );
  return reply.data;
}
