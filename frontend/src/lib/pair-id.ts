/**
 * Helpers for the "-2B-<sessionShort>" scorecard-id convention used by pair
 * (2BBB) rounds. The short session hash is embedded in the scorecard id so the
 * leaderboard can group the two partner rows into a team without depending on
 * a Marker ID column being projected by the Google Apps Script.
 */

/** Deterministic short session key: 8 hex chars taken from a UUID. Falls back
 *  to a simple djb2 hash for non-UUID session ids. */
export function pairSessionShort(sessionId: string | null | undefined): string {
  const s = String(sessionId ?? "").trim();
  if (!s) return "0";
  // UUIDs contain hyphens — pick the leading hex block, which is unique enough
  // for grouping within a single day.
  const hexPart = s.replace(/-/g, "").slice(0, 8).toLowerCase();
  if (/^[a-f0-9]{4,}$/.test(hexPart)) return hexPart;
  // Fallback djb2 for non-hex ids
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0").slice(0, 8);
}

/** Extract the session-short hash from a scorecard id (returns null when the
 *  id isn't a pair-2B id). */
export function extractPairSessionShort(scorecardId: string | null | undefined): string | null {
  const s = String(scorecardId ?? "").trim();
  const m = /-2B-([a-f0-9]{4,})$/i.exec(s);
  return m ? m[1].toLowerCase() : null;
}

/** True when a scorecard id looks like a 2BBB pair scorecard. */
export function isPairScorecardId(scorecardId: string | null | undefined): boolean {
  return /-2B(-[a-f0-9]+)?$/i.test(String(scorecardId ?? "").trim());
}
