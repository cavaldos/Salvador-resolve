import { UPDATE_COPY, format } from "./copy";
import { formatProgressSize } from "./format";
import type { UpdaterState } from "./useUpdater";

interface UpdateBannerProps {
  state: UpdaterState;
  onInstall: () => void;
  onDismiss: () => void;
}

/**
 * Non-intrusive, corner-anchored notification shown only when a new version is
 * available (or while that update is being installed).
 *
 * Purely presentational: it renders nothing for the `idle` phase, which is why
 * running in a plain browser — where the updater plugin throws — shows no UI at
 * all without any special-casing here.
 */
export function UpdateBanner({ state, onInstall, onDismiss }: UpdateBannerProps) {
  if (state.phase === "idle" || !state.version) return null;

  const { phase, version, currentVersion, notes, releaseDate, progress } = state;
  const isBusy = phase === "downloading" || phase === "installing";
  const isError = phase === "error";

  const title = isError
    ? UPDATE_COPY.errorTitle
    : phase === "installing"
      ? format(UPDATE_COPY.installingTitle, { version })
      : phase === "downloading"
        ? format(UPDATE_COPY.downloadingTitle, { version })
        : format(UPDATE_COPY.availableTitle, { version });

  const subtitle = isError
    ? format(UPDATE_COPY.errorBody, { error: state.error ?? "" })
    : phase === "installing"
      ? UPDATE_COPY.installingBody
      : phase === "downloading"
        ? format(UPDATE_COPY.downloadingBody, {
            size: formatProgressSize(state.downloadedBytes, state.totalBytes),
            percent: progress,
          })
        : UPDATE_COPY.availableBody;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy={isBusy}
      aria-label={UPDATE_COPY.region}
      class="fixed inset-x-4 bottom-4 z-50 mx-auto w-auto max-w-sm
             rounded-xl border border-line bg-raised p-4 shadow-lg
             text-left text-ink sm:inset-x-auto sm:right-6 sm:bottom-6 sm:mx-0"
    >
      {phase === "downloading" && (
        <div
          class="mb-3 h-1 w-full overflow-hidden rounded-full bg-line"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <div
            class="h-full rounded-full bg-accent transition-[width] duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="text-sm font-semibold">{title}</p>
          <p class="mt-1 text-xs text-muted">{subtitle}</p>
        </div>

        {!isBusy && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label={UPDATE_COPY.dismissAriaLabel}
            class="shrink-0 rounded-md px-1.5 py-0.5 text-sm leading-none text-muted
                   transition-colors hover:bg-line hover:text-ink"
          >
            &times;
          </button>
        )}
      </div>

      {releaseDate && phase === "available" && (
        <p class="mt-2 text-xs text-muted">
          {format(UPDATE_COPY.availableDateLine, { date: releaseDate })}
          {currentVersion && format(UPDATE_COPY.fromVersion, { current: currentVersion })}
        </p>
      )}

      {notes && phase === "available" && (
        <details class="mt-2 group">
          <summary class="cursor-pointer select-none text-xs font-medium text-accent">
            {UPDATE_COPY.notesToggle}
          </summary>
          <div class="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md bg-surface p-2 text-xs text-muted">
            {notes}
          </div>
        </details>
      )}

      <div class="mt-3 flex items-center justify-end gap-2">
        {!isBusy && (
          <button
            type="button"
            onClick={onDismiss}
            class="rounded-md px-3 py-1.5 text-xs font-medium text-muted
                   transition-colors hover:bg-line hover:text-ink"
          >
            {UPDATE_COPY.dismissAction}
          </button>
        )}

        <button
          type="button"
          onClick={onInstall}
          disabled={isBusy}
          aria-label={format(UPDATE_COPY.installAriaLabel, { version })}
          class="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white
                 transition-opacity hover:opacity-90
                 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isBusy
            ? UPDATE_COPY.installInProgressAction
            : isError
              ? UPDATE_COPY.retryAction
              : UPDATE_COPY.installAction}
        </button>
      </div>
    </div>
  );
}
