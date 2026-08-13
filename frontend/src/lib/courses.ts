import { StoredCourse, StoredHole } from "./storage";

export type CourseRow = StoredCourse & {
  status?: string;
  added_by?: string;
};

export type FetchCoursesResult =
  | { ok: true; courses: CourseRow[] }
  | { ok: false; status: number; message: string };

export async function fetchCourses(webhookUrl: string): Promise<FetchCoursesResult> {
  const url = `${webhookUrl}${webhookUrl.includes("?") ? "&" : "?"}action=courses`;
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
          "Response wasn't valid JSON. Update your Apps Script to include the `courses` doGet branch.",
      };
    }
    if (data && data.error) return { ok: false, status: res.status, message: String(data.error) };
    const raw: any[] = Array.isArray(data?.courses) ? data.courses : [];
    const courses: CourseRow[] = raw
      .map(normaliseCourse)
      .filter((c): c is CourseRow => !!c && c.holes.length === 18);
    return { ok: true, courses };
  } catch (e: any) {
    return { ok: false, status: 0, message: String(e?.message || e) };
  }
}

export type AddCourseInput = {
  name: string;
  latitude?: number | null;
  longitude?: number | null;
  holes: StoredHole[]; // 18 holes required
  added_by?: string;
};

export type AddCourseResult =
  | { ok: true; course: CourseRow }
  | { ok: false; status: number; message: string };

export async function addCourse(
  webhookUrl: string,
  input: AddCourseInput,
): Promise<AddCourseResult> {
  const body = {
    action: "add_course",
    name: input.name.trim(),
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    holes: input.holes.map((h) => ({
      number: h.number,
      par: h.par,
      distance: h.distance,
      index: h.index,
    })),
    added_by: input.added_by || "",
  };
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
      redirect: "follow" as RequestRedirect,
    });
    const text = await res.text().catch(() => "");
    if (!res.ok) return { ok: false, status: res.status, message: text.slice(0, 200) };
    let data: any = {};
    try {
      data = JSON.parse(text);
    } catch {
      return { ok: false, status: res.status, message: "Web App did not return JSON." };
    }
    if (data && data.error)
      return { ok: false, status: res.status, message: String(data.error) };
    if (data && data.duplicate)
      return {
        ok: false,
        status: res.status,
        message: `A course named "${data.match_name || input.name}" already exists.`,
      };

    // Prefer the full course object echoed by the server. If the server only
    // returns an id / ok:true (older Apps Script versions), rebuild the
    // CourseRow from what we just posted so the app still moves forward.
    const serverCourse = normaliseCourse(data.course);
    if (serverCourse) return { ok: true, course: serverCourse };

    const echoedId = String(
      data?.course_id ?? data?.id ?? data?.["Course ID"] ?? "",
    ).trim();
    const savedByServer =
      data?.ok === true ||
      data?.success === true ||
      data?.saved === true ||
      !!echoedId;
    if (savedByServer) {
      const fallback: CourseRow = {
        id: echoedId || `course-${Date.now()}`,
        name: input.name.trim(),
        latitude: input.latitude ?? 0,
        longitude: input.longitude ?? 0,
        holes: input.holes.map((h) => ({
          number: h.number,
          par: h.par,
          distance: h.distance,
          index: h.index,
        })),
        status: "Active",
      };
      return { ok: true, course: fallback };
    }

    return {
      ok: false,
      status: res.status,
      message:
        "Web App did not confirm the save. Check the Courses tab in your Google Sheet — the course may still have been added. Reply from server: " +
        text.slice(0, 160),
    };
  } catch (e: any) {
    return { ok: false, status: 0, message: String(e?.message || e) };
  }
}

function normaliseCourse(raw: any): CourseRow | null {
  if (!raw) return null;
  const id = String(raw.id ?? raw.course_id ?? raw["Course ID"] ?? "").trim();
  const name = String(raw.name ?? raw["Name"] ?? "").trim();
  if (!id || !name) return null;
  const lat = numOrNull(raw.latitude ?? raw["Latitude"]);
  const lng = numOrNull(raw.longitude ?? raw["Longitude"]);
  const holes: StoredHole[] = [];
  if (Array.isArray(raw.holes)) {
    for (let i = 1; i <= 18; i++) {
      const h = raw.holes[i - 1];
      if (!h) break;
      holes.push({
        number: Number(h.number ?? i),
        par: numOrZero(h.par),
        distance: numOrZero(h.distance),
        index: numOrZero(h.index),
      });
    }
  } else {
    for (let i = 1; i <= 18; i++) {
      const par = raw[`H${i} Par`] ?? raw[`h${i}_par`];
      if (par == null || par === "") break;
      holes.push({
        number: i,
        par: numOrZero(par),
        distance: numOrZero(raw[`H${i} Distance`] ?? raw[`h${i}_distance`]),
        index: numOrZero(raw[`H${i} Index`] ?? raw[`h${i}_index`]),
      });
    }
  }
  return {
    id,
    name,
    latitude: lat ?? 0,
    longitude: lng ?? 0,
    holes,
    status: String(raw.status ?? raw["Status"] ?? "").trim() || undefined,
    added_by: String(raw.added_by ?? raw["Added By"] ?? "").trim() || undefined,
  };
}

function numOrZero(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function numOrNull(v: any): number | null {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
