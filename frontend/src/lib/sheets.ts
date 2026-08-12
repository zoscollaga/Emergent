import { FinishedRound, StoredCourse } from "./storage";

/**
 * Build a scorecard CSV with a header row and a single row per round.
 * Columns: Date, Course, Total Score, Total Putts, H1 Par, H1 Score, H1 Putts, ... H18 Par, H18 Score, H18 Putts
 */
export function buildScorecardCsv(
  round: FinishedRound,
  course: StoredCourse | null,
): string {
  const header: string[] = ["Date", "Course", "Total Score", "Total Putts"];
  for (let i = 1; i <= 18; i++) {
    header.push(`H${i} Par`, `H${i} Score`, `H${i} Putts`);
  }

  const row: string[] = [
    round.date,
    round.course_name,
    String(round.total_score),
    String(round.total_putts),
  ];
  for (let i = 1; i <= 18; i++) {
    const par = course?.holes.find((h) => h.number === i)?.par ?? "";
    const entry = round.holes.find((h) => h.number === i);
    row.push(String(par), String(entry?.score ?? ""), String(entry?.putts ?? ""));
  }

  return [header, row].map(csvLine).join("\n");
}

function csvLine(cells: (string | number)[]): string {
  return cells
    .map((c) => {
      const s = String(c ?? "");
      // Escape if contains comma, quote, or newline
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    })
    .join(",");
}

/** POSTs the CSV to the Apps Script Web App. Returns true on success. */
export async function exportToGoogleSheet(
  webhookUrl: string,
  round: FinishedRound,
  course: StoredCourse | null,
): Promise<{ ok: boolean; status: number; message?: string }> {
  const csv = buildScorecardCsv(round, course);
  const payload = {
    csv,
    filename: `round-${round.id}.csv`,
    round: {
      id: round.id,
      date: round.date,
      course_id: round.course_id,
      course_name: round.course_name,
      total_score: round.total_score,
      total_putts: round.total_putts,
      holes: round.holes,
    },
  };

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // avoids CORS preflight to Apps Script
      body: JSON.stringify(payload),
      // Apps Script sometimes redirects — follow it
      redirect: "follow" as RequestRedirect,
    });
    const text = await res.text().catch(() => "");
    return { ok: res.ok, status: res.status, message: text.slice(0, 200) };
  } catch (e: any) {
    return { ok: false, status: 0, message: String(e?.message || e) };
  }
}

/** Format the pair-scoring export sheet name: `YYYY-MM-DD` (local time).
 *  All scorecards played on the same date land as rows in this one tab. */
export function formatFilename(
  _memberId: string,
  startedAtIso: string,
  _courseShortId: string,
): string {
  const d = new Date(startedAtIso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** CSV for a single verified player card (used by pair-scoring export).
 * Column order matches the Scorecards spec exactly. Scorecard ID is left blank
 * on first send — the Apps Script assigns it (SC-YYYYMMDD-NNN) and returns it. */
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
  const header: string[] = [
    "Scorecard ID",
    "Player Name",
    "Member ID",
    "Date",
    "Course",
    "Gross Score",
    "Handicap",
    "Total Putts",
  ];
  for (let i = 1; i <= 18; i++) header.push(`H${i} Score`, `H${i} Putts`);

  const d = new Date(payload.startedAt);
  const pad = (n: number) => String(n).padStart(2, "0");
  const dateStr = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;

  const row: (string | number)[] = [
    payload.scorecardId ?? "",
    payload.playerName,
    payload.memberId,
    dateStr,
    payload.courseName,
    payload.grossScore,
    payload.handicap ?? "",
    payload.totalPutts,
  ];
  for (let i = 1; i <= 18; i++) {
    const h = payload.holes.find((x) => x.number === i);
    row.push(h?.score ?? "", h?.putts ?? "");
  }
  return [header, row].map(csvLine).join("\n");
}

/** POST a single-player CSV to the Apps Script web app. Response includes the
 *  assigned Scorecard ID which callers should persist for future edits. */
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
      // non-JSON is fine; still surface as success/failure by HTTP status
    }
    return { ok: res.ok, status: res.status, scorecard_id, message: text.slice(0, 200) };
  } catch (e: any) {
    return { ok: false, status: 0, message: String(e?.message || e) };
  }
}
