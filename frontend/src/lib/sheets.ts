import { FinishedRound, IdentifiedMember, StoredCourse } from "./storage";

/**
 * Canonical Scorecards column order (spec):
 *   Scorecard ID, Player Name, Member ID, Date, Course, Gross Score,
 *   Handicap, Net Score, Total Putts, H1 Score, H1 Putts, ... H18 Score, H18 Putts
 */
export function buildScorecardsHeader(): string[] {
  const header: string[] = [
    "Scorecard ID",
    "Player Name",
    "Member ID",
    "Date",
    "Course",
    "Gross Score",
    "Handicap",
    "Net Score",
    "Total Putts",
  ];
  for (let i = 1; i <= 18; i++) header.push(`H${i} Score`, `H${i} Putts`);
  return header;
}

function csvLine(cells: (string | number)[]): string {
  return cells
    .map((c) => {
      const s = String(c ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    })
    .join(",");
}

/** DD/MM/YYYY (local) date string for a given ISO timestamp. */
export function formatLocalDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** YYYY-MM-DD (local) — used as the sheet tab name so one tab per date. */
export function formatFilename(
  _memberId: string,
  startedAtIso: string,
  _courseShortId: string,
): string {
  const d = new Date(startedAtIso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** CSV for a single player's scorecard row (used by both solo and pair export).
 *  Column order matches the Scorecards spec exactly. Scorecard ID is left blank
 *  on first send — the Apps Script assigns it (SC-YYYYMMDD-NNN) and returns it. */
export function buildPlayerCsv(payload: {
  scorecardId?: string;
  playerName: string;
  memberId: string;
  startedAt: string;
  courseName: string;
  grossScore: number;
  handicap: number | null;
  totalPutts: number;
  holes: { number: number; score: number | null; putts: number | null }[];
}): string {
  const header = buildScorecardsHeader();
  const netScore =
    payload.handicap == null ? "" : payload.grossScore - payload.handicap;
  const row: (string | number)[] = [
    payload.scorecardId ?? "",
    payload.playerName,
    payload.memberId,
    formatLocalDate(payload.startedAt),
    payload.courseName,
    payload.grossScore,
    payload.handicap ?? "",
    netScore,
    payload.totalPutts,
  ];
  for (let i = 1; i <= 18; i++) {
    const h = payload.holes.find((x) => x.number === i);
    row.push(h?.score ?? "", h?.putts ?? "");
  }
  return [header, row].map(csvLine).join("\n");
}

/** POSTs a scorecard CSV to the Apps Script Web App. Returns success + assigned
 *  scorecard_id when the script echoes JSON. */
export async function exportPlayerCardToSheet(
  webhookUrl: string,
  csv: string,
  filename: string,
  meta: Record<string, string>,
): Promise<{ ok: boolean; status: number; scorecard_id?: string; message?: string }> {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ csv, filename, meta }),
      redirect: "follow" as RequestRedirect,
    });
    const text = await res.text().catch(() => "");
    let scorecard_id: string | undefined;
    try {
      const data = JSON.parse(text);
      if (data && data.scorecard_id) scorecard_id = String(data.scorecard_id);
    } catch {
      // non-JSON is fine
    }
    return { ok: res.ok, status: res.status, scorecard_id, message: text.slice(0, 200) };
  } catch (e: any) {
    return { ok: false, status: 0, message: String(e?.message || e) };
  }
}

/**
 * Solo scorecard export. Builds a single-player CSV row using the
 * currently-identified member (name / handicap). Falls back to a generic
 * "Player" name when no member is identified on the device.
 */
export async function exportSoloRoundToSheet(
  webhookUrl: string,
  round: FinishedRound,
  _course: StoredCourse | null,
  identified: IdentifiedMember | null,
  scorecardId?: string,
): Promise<{ ok: boolean; status: number; scorecard_id?: string; message?: string }> {
  const playerName = identified
    ? `${identified.first_name} ${identified.last_name}`.trim() || identified.member_id
    : "Player";
  const memberId = identified?.member_id || "";
  const handicap = identified?.handicap ?? null;

  const csv = buildPlayerCsv({
    scorecardId,
    playerName,
    memberId,
    startedAt: round.date,
    courseName: round.course_name,
    grossScore: round.total_score,
    handicap,
    totalPutts: round.total_putts,
    holes: round.holes.map((h) => ({ number: h.number, score: h.score, putts: h.putts })),
  });

  const filename = formatFilename(memberId, round.date, round.course_id);
  return exportPlayerCardToSheet(webhookUrl, csv, filename, {
    round_id: round.id,
    player_member_id: memberId,
    course_short_id: round.course_id,
    scorecard_id: scorecardId || "",
  });
}

/**
 * @deprecated Legacy helper kept only to avoid breaking older imports.
 * New callers should use {@link exportSoloRoundToSheet}.
 */
export async function exportToGoogleSheet(
  webhookUrl: string,
  round: FinishedRound,
  course: StoredCourse | null,
): Promise<{ ok: boolean; status: number; message?: string }> {
  return exportSoloRoundToSheet(webhookUrl, round, course, null);
}
