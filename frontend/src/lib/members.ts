export type Member = {
  member_id: string;
  first_name: string;
  last_name: string;
  handicap: number | null;
  status: string; // "Current" | "Non-Active" (case-insensitive)
  mobile: string;
  email: string;
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
        email: String(r.email ?? "").trim(),
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

export type SignUpPayload = {
  first_name: string;
  last_name: string;
  email: string;
  mobile: string;
  handicap: number;
};

export type SignUpStartResult =
  | { ok: true; pending: true; email: string; expires_at: number }
  | { ok: false; duplicate: true; match_field: "email" | "mobile"; member: Member }
  | { ok: false; duplicate: false; status: number; message?: string };

export type SignUpVerifyResult =
  | { ok: true; member: Member }
  | { ok: false; status: number; message: string };

/** Start signup: server sends an email verification code and stores the pending signup. */
export async function signUpStart(
  webhookUrl: string,
  payload: SignUpPayload,
): Promise<SignUpStartResult> {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "signup_start", ...payload }),
      redirect: "follow" as RequestRedirect,
    });
    const text = await res.text().catch(() => "");
    if (!res.ok) return { ok: false, duplicate: false, status: res.status, message: text.slice(0, 200) };
    const data = JSON.parse(text);
    if (data.duplicate) {
      const m = data.member || {};
      return {
        ok: false,
        duplicate: true,
        match_field: (data.match_field as "email" | "mobile") || "email",
        member: normaliseMember(m),
      };
    }
    if (data.pending) {
      return { ok: true, pending: true, email: String(data.email || payload.email), expires_at: Number(data.expires_at || 0) };
    }
    return { ok: false, duplicate: false, status: res.status, message: text.slice(0, 200) };
  } catch (e: any) {
    return { ok: false, duplicate: false, status: 0, message: String(e?.message || e) };
  }
}

/** Verify the email code. On success the server appends the row (Status: Pending Approval)
 *  and emails the admin. Returns the newly created member. */
export async function signUpVerify(
  webhookUrl: string,
  email: string,
  code: string,
): Promise<SignUpVerifyResult> {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "signup_verify", email, code }),
      redirect: "follow" as RequestRedirect,
    });
    const text = await res.text().catch(() => "");
    if (!res.ok) return { ok: false, status: res.status, message: text.slice(0, 200) };
    const data = JSON.parse(text);
    if (data.member) return { ok: true, member: normaliseMember(data.member) };
    return {
      ok: false,
      status: res.status,
      message: data.message || "Verification failed. Check the code and try again.",
    };
  } catch (e: any) {
    return { ok: false, status: 0, message: String(e?.message || e) };
  }
}

function normaliseMember(m: any): Member {
  return {
    member_id: String(m.member_id ?? "").trim(),
    first_name: String(m.first_name ?? ""),
    last_name: String(m.last_name ?? ""),
    handicap: m.handicap == null || m.handicap === "" ? null : Number(m.handicap),
    status: String(m.status ?? ""),
    mobile: String(m.mobile ?? ""),
    email: String(m.email ?? "").trim(),
  };
}
