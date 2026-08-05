export type Member = {
  member_id: string;
  first_name: string;
  last_name: string;
  handicap: number | null;
  status: string; // "Current" | "Non-Active" (case-insensitive)
  mobile: string;
};

/** Fetch member roster from a user-owned Google Apps Script Web app.
 *  The script must expose `doGet` returning `{ members: Member[] }` as JSON. */
export async function fetchMembers(webhookUrl: string): Promise<{
  ok: boolean;
  status: number;
  members: Member[];
  message?: string;
}> {
  try {
    const res = await fetch(webhookUrl, {
      method: "GET",
      redirect: "follow" as RequestRedirect,
    });
    const text = await res.text().catch(() => "");
    if (!res.ok) {
      return { ok: false, status: res.status, members: [], message: text.slice(0, 200) };
    }
    try {
      const data = JSON.parse(text);
      const raw: any[] = Array.isArray(data) ? data : data.members || [];
      const members: Member[] = raw.map((r) => ({
        member_id: String(r.member_id ?? r.memberId ?? r.id ?? "").trim(),
        first_name: String(r.first_name ?? r.firstName ?? ""),
        last_name: String(r.last_name ?? r.lastName ?? ""),
        handicap:
          r.handicap === "" || r.handicap == null
            ? null
            : Number(r.handicap),
        status: String(r.status ?? ""),
        mobile: String(r.mobile ?? r.phone ?? ""),
      }));
      return { ok: true, status: res.status, members };
    } catch {
      return {
        ok: false,
        status: res.status,
        members: [],
        message: `Response wasn't valid JSON. ${text.slice(0, 120)}`,
      };
    }
  } catch (e: any) {
    return { ok: false, status: 0, members: [], message: String(e?.message || e) };
  }
}
