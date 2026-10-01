import type {
  PuzzleAttempt,
  PuzzleSnapshot,
  Settings,
} from "../../shared/types";
import { localDate } from "../../shared/dates";
import { send } from "../../features/state/client";
import { detectUsername } from "../dom/chessDom";
import { puzzleResults } from "../../analytics/puzzles";

export interface PuzzleObservation {
  puzzleId: string | null;
  result: PuzzleAttempt["result"] | null;
  ratingAfter: number | null;
  ratingChange: number | null;
  puzzleRating: number | null;
}
const visible = (e: Element) =>
  !e.closest('[hidden],[aria-hidden="true"]') &&
  (e as HTMLElement).style.display !== "none";
export function ratedPuzzleRoot(
  doc: Document = document,
  path = location.pathname,
): HTMLElement | null {
  if (!/^\/puzzles\/(rated|training)\/?$/.test(path)) return null;
  const root = doc.querySelector<HTMLElement>(
    '#board-layout-sidebar,[data-puzzle-mode="rated"]',
  );
  if (
    !root ||
    root.querySelector(
      '[data-puzzle-mode="daily"],[data-puzzle-mode="rush"],[data-puzzle-mode="battle"]',
    )
  )
    return null;
  return root.matches('[data-puzzle-mode="rated"]') ||
    root.querySelector('.rated-sidebar-component,[data-puzzle-mode="rated"]')
    ? root
    : null;
}
export function isRatedPuzzlePage(doc = document, path = location.pathname) {
  return !!ratedPuzzleRoot(doc, path);
}
function numeric(root: Element, selector: string): number | null {
  const e = root.querySelector(selector);
  if (!e || !visible(e)) return null;
  const text = (e.getAttribute("data-value") ?? e.textContent ?? "")
    .trim()
    .replace(/,/g, "");
  return /^[+−-]?\d+$/.test(text) ? Number(text.replace("−", "-")) : null;
}
export function readPuzzleObservation(root: HTMLElement): PuzzleObservation {
  const identity = root.matches("[data-puzzle-id]")
    ? root
    : root.querySelector("[data-puzzle-id]");
  const link = root.querySelector<HTMLAnchorElement>(
    'a[href*="/puzzles/problem/"]',
  );
  const puzzleId =
    identity?.getAttribute("data-puzzle-id") ??
    link?.getAttribute("href")?.match(/\/puzzles\/problem\/(\d+)/)?.[1] ??
    null;
  const resultNode =
    [
      ...root.querySelectorAll(
        '[data-puzzle-result],[data-puzzle-state],[role="status"],.coach-feedback-detail-text,.puzzle-result,.rated-sidebar-result',
      ),
    ].find(
      (e) =>
        visible(e) &&
        /^(solved|failed|complete|completed|success|failure)$/.test(
          e.getAttribute("data-puzzle-result") ??
            e.getAttribute("data-puzzle-state") ??
            "",
        ),
    ) ?? null;
  const explicit =
    resultNode?.getAttribute("data-puzzle-result") ??
    resultNode?.getAttribute("data-puzzle-state");
  const next = [...root.querySelectorAll('button,a[role="button"]')].some(
    (e) =>
      visible(e) &&
      !e.matches('[disabled],[aria-disabled="true"]') &&
      /^(next puzzle|next|continue)$/i.test(
        (e.getAttribute("aria-label") ?? e.textContent ?? "").trim(),
      ),
  );
  const ratingChange = numeric(
    root,
    "[data-rating-change],.rating-change-component,.rated-sidebar-rating-change",
  );
  const feedback = [
    ...root.querySelectorAll(
      '[role="status"],.coach-feedback-detail-text,.puzzle-result,.rated-sidebar-result',
    ),
  ]
    .filter(visible)
    .map((e) => e.textContent?.trim() ?? "")
    .join(" ");
  let result: PuzzleObservation["result"] = null;
  if (explicit)
    result = /solved|success/.test(explicit)
      ? "solved"
      : /failed|failure/.test(explicit)
        ? "failed"
        : "unknown";
  else if (next || (ratingChange !== null && ratingChange !== 0)) {
    if (/\b(puzzle solved|solved|success|correct!)\b/i.test(feedback))
      result = "solved";
    else if (
      /\b(puzzle failed|failed|incorrect|wrong|try again)\b/i.test(feedback)
    )
      result = "failed";
    else if (ratingChange !== null)
      result =
        ratingChange > 0 ? "solved" : ratingChange < 0 ? "failed" : "unknown";
  }
  return {
    puzzleId,
    result,
    ratingChange,
    ratingAfter: result
      ? numeric(
          root,
          "[data-player-rating],.rating-score-rating,.rated-sidebar-rating-value",
        )
      : null,
    puzzleRating: result
      ? numeric(root, "[data-puzzle-rating],.puzzle-rating")
      : null,
  };
}
interface Session {
  username: string;
  key: string;
  puzzleId: string | null;
  state: "active" | "result" | "saved" | "waiting";
  attempt?: PuzzleAttempt;
  nextRequested?: boolean;
  pending?: PuzzleAttempt[];
}
export class PuzzleTrackerMachine {
  session: Session | null;
  private saving = new Set<string>();
  private pending = new Map<string, PuzzleAttempt>();
  state = "idle";
  constructor(
    private save: (a: PuzzleAttempt) => Promise<unknown>,
    private persist: (s: Session | null) => void = () => undefined,
    restored: Session | null = null,
  ) {
    this.session = restored;
    for (const a of restored?.pending ?? []) this.pending.set(a.id, a);
    if (restored?.state === "result" && restored.attempt)
      this.pending.set(restored.attempt.id, restored.attempt);
  }
  private remember() {
    this.persist(
      this.session
        ? { ...this.session, pending: [...this.pending.values()] }
        : null,
    );
  }
  reset() {
    this.session = null;
    this.pending.clear();
    this.state = "idle";
    this.persist(null);
  }
  nextPuzzle() {
    if (
      this.session &&
      ["result", "saved", "waiting"].includes(this.session.state)
    ) {
      this.session.nextRequested = true;
      if (this.session.state !== "result") this.session.state = "waiting";
      this.state = this.session.state;
      this.remember();
    }
  }
  async observe(username: string, o: PuzzleObservation) {
    if (!username) {
      this.reset();
      return;
    }
    let s = this.session;
    if (s?.username !== username) s = null;
    // A result visible on first load is never a new attempt. Observe an active puzzle first.
    if (!s && o.result) return;
    if (
      !o.result &&
      (!s ||
        s.nextRequested ||
        (o.puzzleId && s.puzzleId && o.puzzleId !== s.puzzleId))
    ) {
      s = {
        username,
        key: crypto.randomUUID(),
        puzzleId: o.puzzleId,
        state: "active",
      };
      this.session = s;
      this.remember();
    }
    if (!s) return;
    if (o.puzzleId && !s.puzzleId) s.puzzleId = o.puzzleId;
    if (o.result && !s.attempt && s.state === "active") {
      const now = Date.now();
      s.attempt = {
        id: `${username}:${s.puzzleId ?? "session"}:${s.key}`,
        username,
        puzzleId: s.puzzleId,
        attemptedAt: now,
        localDate: localDate(new Date(now)),
        result: o.result,
        ratingAfter: o.ratingAfter,
        ratingChange: o.ratingChange,
        ratingBefore:
          o.ratingAfter !== null && o.ratingChange !== null
            ? o.ratingAfter - o.ratingChange
            : null,
        puzzleRating: o.puzzleRating,
        source: "live_tracker",
        createdAt: now,
      };
      s.state = "result";
      this.pending.set(s.attempt.id, s.attempt);
      this.remember();
    }
    this.state = s.state;
    await Promise.all(
      [...this.pending.values()].map(async (a) => {
        if (this.saving.has(a.id)) return;
        this.saving.add(a.id);
        try {
          await this.save(a);
          this.pending.delete(a.id);
          if (this.session?.attempt?.id === a.id) {
            this.session.state = "saved";
            this.state = "saved";
          }
          this.remember();
        } finally {
          this.saving.delete(a.id);
        }
      }),
    );
  }
}
export function installPuzzleTracker() {
  let root: HTMLElement | null = null,
    observer: MutationObserver | null = null,
    timer: ReturnType<typeof setTimeout> | undefined;
  let username = "",
    enabled = true,
    lastSavedAttempt: PuzzleAttempt | null = null,
    generation = 0,
    initialized = "";
  let settings: Settings | null = null,
    retries = 0;
  let snapshot: PuzzleSnapshot = { attempts: [], tracking: null };
  const storageKey = "chessInsights.ratedPuzzleSession";
  let restored: Session | null = null;
  try {
    restored = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
  } catch {
    /* unavailable tab storage */
  }
  const log = (message: string) => {
    if (import.meta.env.DEV)
      console.debug(`[Chess Insights puzzles] ${message}`);
  };
  const machine = new PuzzleTrackerMachine(
    async (a) => {
      const saved = await send<boolean>({ type: "ci:puzzle-save", attempt: a });
      if (saved) {
        lastSavedAttempt = a;
        log(`saved ${a.result}; activity invalidated`);
      }
      snapshot = await send<PuzzleSnapshot>({
        type: "ci:puzzles",
        username: a.username,
      });
    },
    (s) => {
      try {
        if (s) sessionStorage.setItem(storageKey, JSON.stringify(s));
        else sessionStorage.removeItem(storageKey);
      } catch {
        /* Repository dedup remains authoritative. */
      }
    },
    restored,
  );
  const scan = () => {
    if (
      !root ||
      !enabled ||
      !username ||
      detectUsername() !== username ||
      !isRatedPuzzlePage()
    )
      return;
    void machine
      .observe(username, readPuzzleObservation(root))
      .then(() => {
        retries = 0;
      })
      .catch((e) => {
        log(`save pending: ${String(e)}`);
        if (retries < 3) {
          retries++;
          timer = setTimeout(() => {
            timer = undefined;
            scan();
          }, retries * 1000);
        }
      });
  };
  const schedule = () => {
    if (!timer)
      timer = setTimeout(() => {
        timer = undefined;
        scan();
      }, 80);
  };
  const update = async () => {
    const gen = ++generation,
      detected = detectUsername();
    settings ??= await send<Settings>({ type: "ci:settings" });
    if (gen !== generation) return;
    const nextEnabled = settings.trackPuzzleActivity !== false;
    if (enabled && !nextEnabled) {
      machine.reset();
      initialized = "";
    }
    enabled = nextEnabled;
    if (detected !== username) {
      if (machine.session?.username !== detected) machine.reset();
      username = detected ?? "";
      snapshot = { attempts: [], tracking: null };
    }
    if (username && enabled && initialized !== username) {
      await send({ type: "ci:puzzle-start", username });
      if (gen !== generation) return;
      initialized = username;
    }
    const next = enabled && username ? ratedPuzzleRoot() : null;
    if (next !== root) {
      observer?.disconnect();
      root = next;
      if (root) {
        observer = new MutationObserver(schedule);
        observer.observe(root, {
          subtree: true,
          childList: true,
          characterData: true,
          attributes: true,
          attributeFilter: [
            "data-puzzle-id",
            "data-puzzle-state",
            "data-puzzle-result",
            "data-rating-change",
            "data-value",
            "hidden",
            "aria-hidden",
            "class",
          ],
        });
        log("rated page detected");
      }
    }
    if (root) scan();
  };
  const domUpdate = () => {
    void update().catch(() => undefined);
  };
  window.addEventListener("ci:dom-update", domUpdate);
  const click = (e: Event) => {
    const target =
      e.target instanceof Element
        ? e.target.closest('button,a[role="button"]')
        : null;
    if (
      target &&
      root?.contains(target) &&
      /^(next puzzle|next)$/i.test(
        (target.getAttribute("aria-label") ?? target.textContent ?? "").trim(),
      )
    )
      machine.nextPuzzle();
  };
  document.addEventListener("click", click, true);
  const changes = (changes: Record<string, chrome.storage.StorageChange>) => {
    if (changes["chessInsights.settings"]) {
      settings = changes["chessInsights.settings"].newValue ?? null;
      void update().catch(() => undefined);
    }
    if (
      (
        changes["chessInsights.puzzleChange"]?.newValue as
          { username?: string } | undefined
      )?.username === username
    ) {
      void send<PuzzleSnapshot>({ type: "ci:puzzles", username })
        .then((s) => {
          snapshot = s;
        })
        .catch(() => undefined);
    }
  };
  chrome.storage.onChanged.addListener(changes);
  void update().catch(() => undefined);
  return {
    dispose: () => {
      generation++;
      observer?.disconnect();
      if (timer) clearTimeout(timer);
      window.removeEventListener("ci:dom-update", domUpdate);
      document.removeEventListener("click", click, true);
      chrome.storage.onChanged.removeListener(changes);
    },
    getPuzzleTrackingStatus: async () => {
      if (username)
        snapshot = await send<PuzzleSnapshot>({ type: "ci:puzzles", username });
      return {
        username,
        enabled,
        isPuzzlePage: isRatedPuzzlePage(),
        currentPuzzleId: machine.session?.puzzleId ?? null,
        trackerState: machine.state,
        trackingStartDate:
          snapshot.tracking?.puzzleTrackingStartedLocalDate ?? null,
        totalAttempts: snapshot.attempts.length,
        todayAttempts: snapshot.attempts.filter(
          (a) => a.localDate === localDate(new Date()),
        ).length,
        todayResults: puzzleResults(
          snapshot.attempts.filter(
            (a) => a.localDate === localDate(new Date()),
          ),
        ),
        lastSavedAttempt: lastSavedAttempt ?? machine.session?.attempt ?? null,
      };
    },
  };
}
