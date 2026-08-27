/**
 * Stableford scoring — standard WHS-style points per hole.
 *
 * Formula:
 *   handicap_strokes_on_hole = floor(H / 18) + (1 if stroke_index <= H mod 18 else 0)
 *   net = gross - handicap_strokes_on_hole
 *   points = max(0, 2 - (net - par))
 *
 * Points chart (relative to net par):
 *   Net eagle or better  → 4+ pts (5 for net double-eagle, 6 for triple, etc.)
 *   Net birdie           → 3 pts
 *   Net par              → 2 pts
 *   Net bogey            → 1 pt
 *   Net double or worse  → 0 pts
 *
 * Notes:
 *  - Handicap is rounded to the nearest integer (real Playing Handicap rounding
 *    should be done upstream; this keeps the on-hole maths simple).
 *  - Plus handicaps (H < 0) are treated as 0 strokes — a future improvement can
 *    add "gives back a stroke on the easiest hole".
 */

export type StablefordHole = {
  number: number;         // 1..18
  par: number;
  stroke_index: number;   // 1..18
};

export type PerHolePoints = {
  hole_number: number;
  strokes_received: number;
  net: number | null;
  points: number;
};

/** Compute points for a single hole. Returns 0 when gross is missing/zero. */
export function stablefordPoints(
  gross: number | null | undefined,
  par: number,
  strokeIndex: number,
  handicap: number | null | undefined,
): PerHolePoints {
  const hole_number = 0; // caller sets — this fn is a pure computation
  if (!Number.isFinite(par) || par <= 0 || gross == null || gross === 0) {
    return { hole_number, strokes_received: 0, net: null, points: 0 };
  }
  const h = handicap == null || !Number.isFinite(handicap) ? 0 : Math.round(handicap);
  const strokes = handicapStrokesOnHole(h, strokeIndex);
  const net = gross - strokes;
  const netVsPar = net - par;
  const points = Math.max(0, 2 - netVsPar);
  return { hole_number, strokes_received: strokes, net, points };
}

/** Handicap strokes received on a given hole. Non-negative handicaps only —
 *  plus-handicap logic is stubbed to 0 for now. */
export function handicapStrokesOnHole(handicap: number, strokeIndex: number): number {
  if (!Number.isFinite(handicap) || handicap <= 0) return 0;
  if (!Number.isFinite(strokeIndex) || strokeIndex <= 0) return 0;
  const base = Math.floor(handicap / 18);
  const extra = strokeIndex <= handicap % 18 ? 1 : 0;
  return base + extra;
}

/** Compute per-hole points and a total for a whole round. */
export function stablefordForRound(
  holes: { number: number; gross: number | null; par: number; stroke_index: number }[],
  handicap: number | null | undefined,
): { per_hole: PerHolePoints[]; total: number; holes_scored: number } {
  const per_hole: PerHolePoints[] = holes.map((h) => {
    const r = stablefordPoints(h.gross, h.par, h.stroke_index, handicap);
    return { ...r, hole_number: h.number };
  });
  const total = per_hole.reduce((s, r) => s + r.points, 0);
  const holes_scored = holes.filter((h) => h.gross != null && h.gross > 0).length;
  return { per_hole, total, holes_scored };
}
