import AsyncStorage from "@react-native-async-storage/async-storage";
import { extractPairSessionShort, isPairScorecardId } from "./pair-id";
import { FinishedRound } from "./storage";

/** A single row from `?action=history&member_id=X`. Union with `FinishedRound`
 *  where possible so the summary screen can render either source uniformly. */
export type PlayerRound = {
  id: string;                       // scorecard_id (may include -2B[-hash]) OR local Date.now()
  scorecard_id: string;
  member_id: string;
  marker_id: string;
  date: string;                     // ISO — either full local ISO or synthesised from YYYY-MM-DD tab
  course_id: string;
  course_name: string;
  gross_score: number;
  handicap: number | null;
  net_score: number | null;
  total_putts: number;
  holes: { number: number; score: number | null; putts: number | null }[];
  source: "cloud" | "local";
  is_pair: boolean;                 // -2B suffix present
};

export type HistoryResult =
  | { ok: true; rounds: PlayerRound[] }
  | { ok: false; status: number; message: string };

const K_CLOUD_HISTORY = "gs.cloudRoundHistory";

/** Fetch the identified player's rounds from Google Sheets across ALL date
 *  tabs. Requires the Apps Script `doGet(?action=history&member_id=X)` branch.
 *  Silent on network / non-JSON errors; surfaces a helpful message when the
 *  script hasn't been updated yet. */
export async function fetchPlayerHistory(
  webhookUrl: string,
  memberId: string,
): Promise<HistoryResult> {
  const url =
    `${webhookUrl}${webhookUrl.includes("?") ? "&" : "?"}` +
    `action=history&member_id=${encodeURIComponent(memberId)}`;
  try {
    const res = await fetch(url, { method: "GET", redirect: "follow" as RequestRedirect });
    const text = await res.text().catch(() => "");
    if (!res.ok) return { ok: false, status: res.status, message: text.slice(0, 200) };
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      return {
        ok: false,
        status: res.status,
        message:
          "History endpoint not deployed yet. Add the `history` branch to your Apps Script and redeploy. Got: " +
          text.slice(0, 140),
      };
    }
    if (data && data.error) return { ok: false, status: res.status, message: String(data.error) };
    const raw: any[] = Array.isArray(data?.rounds) ? data.rounds : Array.isArray(data) ? data : [];
    const rounds = raw.map(normaliseRound).filter((r) => !!r.scorecard_id);
    return { ok: true, rounds };
  } catch (e: any) {
    return { ok: false, status: 0, message: String(e?.message || e) };
  }
}

/** Save the cloud rounds to AsyncStorage so summary.tsx can look them up
 *  hole-by-hole after tap-through. */
export async function cacheCloudRounds(rounds: PlayerRound[]) {
  await AsyncStorage.setItem(K_CLOUD_HISTORY, JSON.stringify(rounds));
}

/** Load the last cached cloud rounds. Empty array when never fetched. */
export async function getCachedCloudRounds(): Promise<PlayerRound[]> {
  const raw = await AsyncStorage.getItem(K_CLOUD_HISTORY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/** Merge cloud + local rounds. Cloud is authoritative when both hold a copy of
 *  the same scorecard (matched via cached local `scId::solo::<localId>` mapping
 *  or by direct id equality). Local-only rounds (never uploaded) still appear. */
export function mergeRounds(
  cloudRounds: PlayerRound[],
  localRounds: FinishedRound[],
  localToScId: Record<string, string>,
): PlayerRound[] {
  const cloudBySc = new Map(cloudRounds.map((r) => [String(r.scorecard_id).trim(), r]));
  const localOnly: PlayerRound[] = [];
  for (const l of localRounds) {
    const mappedSc = localToScId[l.id];
    if (mappedSc && cloudBySc.has(mappedSc)) continue; // already reflected in cloud
    // Not yet in cloud → show local copy tagged as local
    localOnly.push({
      id: l.id,
      scorecard_id: mappedSc || "",
      member_id: "",
      marker_id: "",
      date: l.date,
      course_id: l.course_id,
      course_name: l.course_name,
      gross_score: l.total_score,
      handicap: null,
      net_score: null,
      total_putts: l.total_putts,
      holes: l.holes,
      source: "local",
      is_pair: isPairScorecardId(mappedSc || ""),
    });
  }
  const merged = [...cloudRounds, ...localOnly];
  // Newest first
  merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return merged;
}

/** Cross-course stats card values. */
export type HistoryStats = {
  total_rounds: number;
  avg_gross: number | null;
  best_gross: number | null;
  worst_gross: number | null;
  avg_putts: number | null;
  rounds_this_month: number;
  favourite_course: { name: string; count: number } | null;
};

/** Compute glanceable stats from the merged rounds list. Considers only rounds
 *  with a positive gross score (skips zero-score placeholders). */
export function computeStats(rounds: PlayerRound[]): HistoryStats {
  const played = rounds.filter((r) => r.gross_score > 0);
  const total = played.length;
  if (total === 0) {
    return {
      total_rounds: 0,
      avg_gross: null,
      best_gross: null,
      worst_gross: null,
      avg_putts: null,
      rounds_this_month: 0,
      favourite_course: null,
    };
  }
  const sumGross = played.reduce((s, r) => s + r.gross_score, 0);
  const sumPutts = played.reduce((s, r) => s + (r.total_putts || 0), 0);
  const grosses = played.map((r) => r.gross_score);
  const now = new Date();
  const thisMonth = played.filter((r) => {
    const d = new Date(r.date);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;
  const courseCount = new Map<string, number>();
  for (const r of played) {
    const name = (r.course_name || "").trim();
    if (!name) continue;
    courseCount.set(name, (courseCount.get(name) || 0) + 1);
  }
  let favourite: { name: string; count: number } | null = null;
  for (const [name, count] of courseCount) {
    if (!favourite || count > favourite.count) favourite = { name, count };
  }
  return {
    total_rounds: total,
    avg_gross: Math.round(sumGross / total),
    best_gross: Math.min(...grosses),
    worst_gross: Math.max(...grosses),
    avg_putts: Math.round(sumPutts / total),
    rounds_this_month: thisMonth,
    favourite_course: favourite,
  };
}

/* -------------------- Internal -------------------- */

function normaliseRound(r: any): PlayerRound {
  const holes: { number: number; score: number | null; putts: number | null }[] = [];
  for (let i = 1; i <= 18; i++) {
    const s = pickNum(r?.[`h${i}_score`] ?? r?.[`H${i} Score`]);
    const p = pickNum(r?.[`h${i}_putts`] ?? r?.[`H${i} Putts`]);
    holes.push({ number: i, score: s, putts: p });
  }
  const scId = String(r?.scorecard_id ?? r?.["Scorecard ID"] ?? "").trim();
  const dateRaw = String(r?.date ?? r?.Date ?? "").trim();
  const iso = parseHistoryDate(dateRaw);
  const gross = numOrZero(r?.gross_score ?? r?.["Gross Score"]);
  const handicap = optionalNum(r?.handicap ?? r?.Handicap);
  const net = optionalNum(r?.net_score ?? r?.["Net Score"]);
  return {
    id: scId,
    scorecard_id: scId,
    member_id: String(r?.member_id ?? r?.["Member ID"] ?? "").trim(),
    marker_id: String(r?.marker_id ?? r?.["Marker ID"] ?? "").trim(),
    date: iso,
    course_id: String(r?.course_id ?? r?.["Course ID"] ?? "").trim(),
    course_name: String(r?.course ?? r?.Course ?? r?.course_name ?? "").trim(),
    gross_score: gross,
    handicap,
    net_score: net != null ? net : handicap != null ? gross - handicap : null,
    total_putts: numOrZero(r?.total_putts ?? r?.["Total Putts"]),
    holes,
    source: "cloud",
    is_pair: isPairScorecardId(scId) || !!extractPairSessionShort(scId),
  };
}

/** Accepts either ISO ("2026-08-17T...") or the sheet's DD/MM/YYYY. */
function parseHistoryDate(v: string): string {
  if (!v) return new Date().toISOString();
  // ISO passthrough
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return new Date(v).toISOString();
  // DD/MM/YYYY (sheet local format)
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
  if (m) {
    const [, d, mo, y] = m;
    return new Date(Number(y), Number(mo) - 1, Number(d)).toISOString();
  }
  return new Date(v).toISOString();
}

function pickNum(v: any): number | null {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function numOrZero(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function optionalNum(v: any): number | null {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
