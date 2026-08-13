/**
 * Live leaderboard: reads a single date-tab from the Google Sheet via the
 * merged Apps Script's `doGet(?action=leaderboard&date=YYYY-MM-DD)` branch and
 * returns a ranked list.
 */

export type LeaderboardRow = {
  scorecard_id: string;
  player_name: string;
  member_id: string;
  marker_id: string;
  course: string;
  gross_score: number;
  handicap: number | null;
  net_score: number | null;
  total_putts: number;
  holes_played: number;   // number of hole-score cells that are non-empty
  hole_scores: (number | null)[]; // length 18
};

export type LeaderboardResult =
  | { ok: true; date: string; rows: LeaderboardRow[] }
  | { ok: false; status: number; message: string };

export async function fetchLeaderboard(
  webhookUrl: string,
  isoDate: string, // YYYY-MM-DD
): Promise<LeaderboardResult> {
  const url = `${webhookUrl}${webhookUrl.includes("?") ? "&" : "?"}action=leaderboard&date=${encodeURIComponent(isoDate)}`;
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow" as RequestRedirect,
    });
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
          "Response wasn't valid JSON. Update your Apps Script to include the `leaderboard` doGet branch. Got: " +
          text.slice(0, 160),
      };
    }
    if (data && data.error) {
      return { ok: false, status: res.status, message: String(data.error) };
    }
    const raw: any[] = Array.isArray(data?.rows) ? data.rows : Array.isArray(data) ? data : [];
    const rows: LeaderboardRow[] = raw.map((r) => normaliseRow(r));
    return { ok: true, date: isoDate, rows };
  } catch (e: any) {
    return { ok: false, status: 0, message: String(e?.message || e) };
  }
}

function normaliseRow(r: any): LeaderboardRow {
  const holes: (number | null)[] = [];
  for (let i = 1; i <= 18; i++) {
    const raw = r?.[`h${i}_score`] ?? r?.[`H${i} Score`] ?? r?.hole_scores?.[i - 1];
    holes.push(raw === "" || raw == null ? null : Number(raw));
  }
  const gross = numOrZero(r?.gross_score ?? r?.["Gross Score"]);
  const handicap = optionalNum(r?.handicap ?? r?.Handicap);
  const netFromSheet = optionalNum(r?.net_score ?? r?.["Net Score"]);
  const net = netFromSheet != null
    ? netFromSheet
    : handicap != null
    ? gross - handicap
    : null;
  const played = holes.filter((h) => h != null).length;
  return {
    scorecard_id: String(r?.scorecard_id ?? r?.["Scorecard ID"] ?? "").trim(),
    player_name: String(r?.player_name ?? r?.["Player Name"] ?? "").trim(),
    member_id: String(r?.member_id ?? r?.["Member ID"] ?? "").trim(),
    marker_id: String(r?.marker_id ?? r?.["Marker ID"] ?? "").trim(),
    course: String(r?.course ?? r?.Course ?? "").trim(),
    gross_score: gross,
    handicap,
    net_score: net,
    total_putts: numOrZero(r?.total_putts ?? r?.["Total Putts"]),
    holes_played: played,
    hole_scores: holes,
  };
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
