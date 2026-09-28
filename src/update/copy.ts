/**
 * All user-facing strings for the auto-update UI live here.
 *
 * USAGE NOTE — to change the wording of the update banner, edit the values in
 * `UPDATE_COPY` below. Nothing else needs to be touched: components read their
 * labels from this object only.
 *
 * Supported placeholders (see `format`):
 *   {version}  -> the new version, e.g. "1.4.0"
 *   {current}  -> the running version, e.g. "1.3.2"
 *   {date}     -> formatted release date, e.g. "4 Mar 2025"
 *   {percent}  -> download progress, e.g. "42"
 *   {size}     -> downloaded / total size, e.g. "12.4 MB / 30.1 MB"
 *   {error}    -> a short, human-readable failure reason
 */
export const UPDATE_COPY = {
  /** Accessible label for the whole banner. */
  region: "Application update",

  /** Shown as soon as a newer version is detected. */
  availableTitle: "Version {version} is available",
  availableBody: "Download and restart to update.",
  availableDateLine: "Released {date}",

  /** Shown while an update is being fetched / installed. */
  downloadingTitle: "Downloading version {version}",
  downloadingBody: "{size} — {percent}%",
  installingTitle: "Installing version {version}",
  installingBody: "This may take a moment. The app will restart automatically.",

  /** Shown when the download or install step failed. */
  errorTitle: "Update failed",
  errorBody: "{error}",

  /** Primary action. */
  installAction: "Download & restart",
  /** Shown on the action button while downloading. */
  installInProgressAction: "Downloading…",
  /** Action offered after a failure. */
  retryAction: "Try again",
  /** Secondary, dismisses the banner. */
  dismissAction: "Later",
  /** Screen-reader label for the dismiss button. */
  dismissAriaLabel: "Dismiss update notification",
  /** Screen-reader label for the install button. */
  installAriaLabel: "Download version {version} and restart the app",

  /** Small print under the release notes. */
  fromVersion: "You are running version {current}.",
  /** Toggles the release notes panel. */
  notesToggle: "Release notes",
} as const;

export type CopyTemplate = (typeof UPDATE_COPY)[keyof typeof UPDATE_COPY];

/**
 * Replaces `{placeholder}` tokens in a copy template with the given values.
 * Unknown placeholders are left untouched so a typo is visible, not silent.
 */
export function format(
  template: string,
  values: Record<string, string | number | null | undefined>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key];
    return value === null || value === undefined ? match : String(value);
  });
}
