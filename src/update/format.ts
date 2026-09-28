const BYTE_UNITS = ["B", "KB", "MB", "GB"] as const;

/** Human-readable byte size, e.g. `12.4 MB`. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";

  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    BYTE_UNITS.length - 1,
  );
  const value = bytes / 1024 ** exponent;

  return `${exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${BYTE_UNITS[exponent]}`;
}

/** Formats an RFC 3339 release date, or `null` when absent/unparseable. */
export function formatReleaseDate(date: string | null): string | null {
  if (!date) return null;

  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return null;

  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Turns an unknown thrown value into a short, safe one-line message. */
export function describeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return "Unexpected error";
}

/** `1.2 MB / 30.1 MB`, or just the downloaded size when the total is unknown. */
export function formatProgressSize(
  downloaded: number,
  total: number | null,
): string {
  const done = formatBytes(downloaded);
  return total && total > 0 ? `${done} / ${formatBytes(total)}` : done;
}

/** `0` – `100`, clamped to whole percent. */
export function toPercent(
  downloaded: number,
  total: number | null,
): number {
  if (!total || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((downloaded / total) * 100)));
}
