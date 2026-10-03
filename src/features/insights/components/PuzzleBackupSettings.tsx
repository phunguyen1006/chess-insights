import { useEffect, useRef, useState } from "react";
import {
  MAX_PUZZLE_BACKUP_BYTES,
  parsePuzzleBackup,
  serializePuzzleBackup,
} from "../../../shared/puzzleBackup";
import type {
  PuzzleBackup,
  PuzzleImportResult,
} from "../../../shared/puzzleBackup";
import { downloadText } from "../../../shared/download";
import { localDate } from "../../../shared/dates";
import { send } from "../../state/client";
import { Panel } from "./Common";

export function PuzzleBackupSettings({
  username,
  onImported,
}: {
  username: string;
  onImported: () => Promise<void>;
}) {
  const [preview, setPreview] = useState<{
    text: string;
    backup: PuzzleBackup;
    filename: string;
  } | null>(null);
  const [busy, setBusy] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const inFlight = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(
    () => () => {
      sequence.current++;
    },
    [],
  );

  const run = async (
    label: string,
    task: (current: () => boolean) => Promise<void>,
  ) => {
    if (inFlight.current) return;
    inFlight.current = true;
    const ticket = ++sequence.current;
    const current = () => sequence.current === ticket;
    setBusy(label);
    setError("");
    setStatus("");
    try {
      await task(current);
    } catch (reason) {
      if (current())
        setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      inFlight.current = false;
      if (current()) setBusy("");
    }
  };
  const chooseFile = (file?: File) => {
    setPreview(null);
    if (!file) return;
    void run("Checking backup…", async (current) => {
      if (file.size > MAX_PUZZLE_BACKUP_BYTES)
        throw new Error("Choose a puzzle backup smaller than 20 MB.");
      const text = await file.text();
      if (!current()) return;
      const backup = parsePuzzleBackup(text, username);
      setPreview({ text, backup, filename: file.name });
    });
  };
  const download = () =>
    void run("Preparing backup…", async (current) => {
      const backup = await send<PuzzleBackup>({
        type: "ci:puzzle-export",
        username,
      });
      if (!current()) return;
      downloadText(
        `chess-insights-puzzles-${username}-${localDate(new Date())}.json`,
        serializePuzzleBackup(backup),
        "application/json;charset=utf-8",
      );
      setStatus(
        "Puzzle backup download started. Keep the file in a safe place.",
      );
    });
  const restore = () => {
    if (!preview) return;
    void run("Merging puzzle history…", async (current) => {
      const result = await send<PuzzleImportResult>({
        type: "ci:puzzle-import",
        username,
        text: preview.text,
      });
      if (!current()) return;
      setPreview(null);
      if (input.current) input.current.value = "";
      await onImported();
      if (current())
        setStatus(
          `Added ${result.imported.toLocaleString()} attempts; kept ${result.skipped.toLocaleString()} existing attempts. ${result.total.toLocaleString()} attempts saved for ${username}.`,
        );
    });
  };
  const dates = preview?.backup.attempts
    .map((attempt) => attempt.localDate)
    .sort();
  return (
    <Panel title="Puzzle history backup">
      <div className="ci-backup" aria-busy={!!busy}>
        <p>
          Save the puzzle history recorded for <strong>{username}</strong> to a
          file. You can merge it back into the same account on another browser
          or after reinstalling.
        </p>
        <div className="ci-backup-actions">
          <button disabled={!!busy} onClick={download}>
            Download puzzle backup
          </button>
          <label className="ci-field">
            Choose puzzle backup
            <input
              ref={input}
              type="file"
              accept=".json,application/json"
              disabled={!!busy}
              onChange={(event) => chooseFile(event.target.files?.[0])}
            />
          </label>
        </div>
        <p className="ci-note">
          Puzzle history only. Games, engine analyses, review schedules and
          settings are not included. Files stay on your device. Maximum size: 20
          MB.
        </p>
        {preview && (
          <div
            className="ci-backup-preview"
            role="region"
            aria-label="Puzzle backup preview"
          >
            <p>
              <strong>
                {preview.backup.attempts.length.toLocaleString()} attempts
              </strong>{" "}
              for {preview.backup.username}
            </p>
            <p className="ci-note">
              {preview.filename} · Saved{" "}
              {new Date(preview.backup.exportedAt).toLocaleString()}
              {!!dates?.length && (
                <>
                  {" "}
                  · {dates[0]} – {dates.at(-1)}
                </>
              )}
            </p>
            <p>
              Existing attempts are kept. New attempts are added once. Tracking
              stays at its current setting.
            </p>
            <div className="ci-backup-actions">
              <button
                className="ci-primary"
                disabled={!!busy}
                onClick={restore}
              >
                Merge puzzle history
              </button>
              <button
                disabled={!!busy}
                onClick={() => {
                  setPreview(null);
                  if (input.current) input.current.value = "";
                }}
              >
                Cancel import
              </button>
            </div>
          </div>
        )}
        <p role="status" aria-live="polite">
          {busy || status}
        </p>
        {error && <p role="alert">{error}</p>}
      </div>
    </Panel>
  );
}
