import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { isTauri } from "@tauri-apps/api/core";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { describeError, formatReleaseDate, toPercent } from "./format";

/**
 * Where the update flow currently is. `idle` covers "nothing to report", which is
 * also the state the app stays in when running in a plain browser.
 */
export type UpdatePhase =
  | "idle"
  | "available"
  | "downloading"
  | "installing"
  | "error";

export interface UpdaterState {
  phase: UpdatePhase;
  /** New version offered by the update server. */
  version: string | null;
  /** Version currently running. */
  currentVersion: string | null;
  /** Release notes, as plain text. */
  notes: string | null;
  /** Release date, already formatted for display. */
  releaseDate: string | null;
  /** 0 – 100. */
  progress: number;
  downloadedBytes: number;
  totalBytes: number | null;
  /** Short, human-readable failure reason; only set in the `error` phase. */
  error: string | null;
}

const INITIAL_STATE: UpdaterState = {
  phase: "idle",
  version: null,
  currentVersion: null,
  notes: null,
  releaseDate: null,
  progress: 0,
  downloadedBytes: 0,
  totalBytes: null,
  error: null,
};

/**
 * Checks for a new release once on mount and exposes the update + install
 * actions.
 *
 * Safety rails:
 *  - `isTauri()` is checked before anything else, so `vite dev` in a normal
 *    browser never touches the updater plugin (which throws there). The banner
 *    simply stays hidden.
 *  - A failed *check* (offline, no permission, bad endpoint) is swallowed: the
 *    user is only ever told about a genuinely newer version.
 *  - A failed *download/install* is surfaced in the banner with a retry, since
 *    the user explicitly asked for it.
 *  - The `Update` resource is always released, including on unmount.
 */
export function useUpdater(): {
  state: UpdaterState;
  install: () => Promise<void>;
  dismiss: () => void;
} {
  const [state, setState] = useState<UpdaterState>(INITIAL_STATE);

  // The Update object holds a Rust-side resource, so it is kept out of state
  // (it is not plain data and would trigger needless re-renders).
  const updateRef = useRef<Update | null>(null);
  const mountedRef = useRef(true);
  // Guards against a second concurrent check (e.g. React/Preact StrictMode
  // double-invoking effects) leaking a resource.
  const checkingRef = useRef(false);

  const patch = useCallback((next: Partial<UpdaterState>) => {
    if (!mountedRef.current) return;
    setState((prev) => ({ ...prev, ...next }));
  }, []);

  const releaseUpdate = useCallback(() => {
    const pending = updateRef.current;
    updateRef.current = null;
    // Fire-and-forget: a failure to release must never surface to the user.
    void pending?.close().catch(() => {});
  }, []);

  // Startup check.
  useEffect(() => {
    mountedRef.current = true;

    async function runCheck() {
      if (!isTauri()) return;
      if (checkingRef.current) return;
      checkingRef.current = true;

      try {
        const update = await check();

        if (!update) return; // Up to date — stay silent.
        if (!mountedRef.current) {
          void update.close().catch(() => {});
          return;
        }

        updateRef.current = update;
        setState({
          ...INITIAL_STATE,
          phase: "available",
          version: update.version,
          currentVersion: update.currentVersion,
          notes: update.body ?? null,
          releaseDate: formatReleaseDate(update.date ?? null),
        });
      } catch {
        // Offline / no permission / misconfigured endpoint: never a popup.
        patch({ phase: "idle" });
      } finally {
        checkingRef.current = false;
      }
    }

    void runCheck();

    return () => {
      mountedRef.current = false;
    };
  }, [patch]);

  // Release the resource if the banner goes away (unmount or route change).
  useEffect(() => releaseUpdate, [releaseUpdate]);

  const install = useCallback(async () => {
    const update = updateRef.current;
    if (!update) return;

    let downloaded = 0;
    let total: number | null = null;

    try {
      patch({ phase: "downloading", error: null, progress: 0, downloadedBytes: 0, totalBytes: null });

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            total = event.data.contentLength ?? null;
            patch({ totalBytes: total });
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            patch({
              downloadedBytes: downloaded,
              progress: toPercent(downloaded, total),
            });
            break;
          case "Finished":
            patch({ phase: "installing", progress: 100, downloadedBytes: total ?? downloaded });
            break;
        }
      });

      // macOS / Linux: relaunch to run the freshly installed version.
      // On Windows `downloadAndInstall` already exits the app.
      patch({ phase: "installing", progress: 100 });
      await relaunch();
    } catch (error) {
      // The Update is intentionally kept alive so the user can retry without
      // another network round-trip; it is released on dismiss/unmount.
      patch({
        phase: "error",
        error: describeError(error),
        progress: 0,
        downloadedBytes: 0,
        totalBytes: null,
      });
    }
  }, [patch]);

  const dismiss = useCallback(() => {
    releaseUpdate();
    patch({ ...INITIAL_STATE, phase: "idle" });
  }, [patch, releaseUpdate]);

  return { state, install, dismiss };
}
