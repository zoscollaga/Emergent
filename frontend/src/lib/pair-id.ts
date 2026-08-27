/**
 * Helpers for the pair (2BBB) scorecard-id convention:
 *
 *     SC<yyyyMMdd>-2B-<joinCode>-<targetMemberId>
 *
 * Example: SC20260827-2B-170932-2327
 *
 * The 6-digit join code is shared across both devices, so both devices agree
 * on the id for a given partner's card without any coordination. The trailing
 * member id makes each of the two partner cards unique within the session.
 *
 * Legacy formats also parsed for backwards compatibility:
 *   - `SCyyyyMMDDNNN-2B-<hash>[-memberId]` (session-hash form)
 *   - `SCyyyyMMDDNNN-2B`                    (earliest tag-only form)
 */

/** Extract the "pair session key" from a scorecard id — this is either the
 *  6-digit join code (current format) or the 8-char legacy session hash. Two
 *  scorecards sharing the same key are pair partners.
 *  Returns null when the id isn't a pair-2B id. */
export function extractPairSessionShort(scorecardId: string | null | undefined): string | null {
  const s = String(scorecardId ?? "").trim();
  // Current form:  ...-2B-<digits>-<memberId>     (join code + member id)
  // Legacy hash:   ...-2B-<hex4+>[-memberId]
  const m = /-2B-([0-9a-f]{4,})(?:-\w+)?$/i.exec(s);
  return m ? m[1].toLowerCase() : null;
}

/** True when a scorecard id looks like a 2BBB pair scorecard. */
export function isPairScorecardId(scorecardId: string | null | undefined): boolean {
  return /-2B(-[0-9a-f]+(?:-\w+)?)?$/i.test(String(scorecardId ?? "").trim());
}

/** Deterministic Scorecard ID for a 2BBB pair round:
 *
 *     SC<yyyyMMdd>-2B-<joinCode>-<targetMemberId>
 *
 *  Same across both devices publishing the same target player's card
 *  (idempotent upsert), unique across different targets in the same session.
 */
export function buildPairScorecardId(
  startedAtIso: string,
  joinCode: string,
  targetMemberId: string,
): string {
  const d = new Date(startedAtIso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const datePart = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const code = String(joinCode || "").trim() || "000000";
  const mid = String(targetMemberId || "").trim() || "unknown";
  return `SC${datePart}-2B-${code}-${mid}`;
}
