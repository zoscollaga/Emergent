const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

export type ApiCourse = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  distance_km?: number;
};

export type ApiHole = {
  number: number;
  par: number;
  distance: number;
  index: number;
};

export async function fetchNearbyCourses(lat: number, lng: number): Promise<ApiCourse[]> {
  const url = `${BASE}/api/courses/nearby?lat=${lat}&lng=${lng}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Nearby courses failed ${res.status}`);
  const data = await res.json();
  return data.courses || [];
}

export async function fetchCourseDetail(
  id: string,
  name?: string,
  lat?: number,
  lng?: number,
): Promise<{ id: string; name: string; latitude: number; longitude: number; holes: ApiHole[] }> {
  const params = new URLSearchParams();
  if (name) params.set('name', name);
  if (lat != null) params.set('lat', String(lat));
  if (lng != null) params.set('lng', String(lng));
  const url = `${BASE}/api/courses/${encodeURIComponent(id)}?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Course detail failed ${res.status}`);
  return res.json();
}

export type ApiHoleEntry = { number: number; score: number | null; putts: number | null };

export async function saveRound(payload: {
  course_id: string;
  course_name: string;
  latitude?: number;
  longitude?: number;
  holes: ApiHoleEntry[];
}) {
  const url = `${BASE}/api/rounds`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Save round failed ${res.status}`);
  return res.json();
}

// ---------- Pair session API ----------
export type ApiSessionPlayer = { device_id: string; member_id: string; role: 'host' | 'guest' };
export type ApiHoleSubmission = {
  hole_number: number;
  device_id: string;
  player_score: number | null;
  player_putts: number | null;
  marker_score: number | null;
  marker_putts: number | null;
  submitted_at: string;
};
export type ApiSession = {
  id: string;
  join_code: string;
  course_id: string;
  course_short_id: string;
  course_name: string;
  holes: ApiHole[];
  started_at: string;
  players: ApiSessionPlayer[];
  hole_entries: ApiHoleSubmission[];
  hole_status: Record<string, 'pending' | 'verified' | 'mismatch'>;
  finished_at: string | null;
};

export async function createSession(payload: {
  device_id: string;
  member_id: string;
  course_id: string;
  course_name: string;
}): Promise<ApiSession> {
  const res = await fetch(`${BASE}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Create session failed ${res.status}`);
  return res.json();
}

export async function joinSession(
  joinCode: string,
  payload: { device_id: string; member_id: string },
): Promise<ApiSession> {
  const res = await fetch(`${BASE}/api/sessions/join/${encodeURIComponent(joinCode)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Join session failed ${res.status}`);
  return res.json();
}

export async function getSession(sessionId: string): Promise<ApiSession> {
  const res = await fetch(`${BASE}/api/sessions/${encodeURIComponent(sessionId)}`);
  if (!res.ok) throw new Error(`Get session failed ${res.status}`);
  return res.json();
}

export async function submitHole(
  sessionId: string,
  holeNumber: number,
  payload: {
    device_id: string;
    player_score: number | null;
    player_putts: number | null;
    marker_score: number | null;
    marker_putts: number | null;
  },
): Promise<ApiSession> {
  const res = await fetch(
    `${BASE}/api/sessions/${encodeURIComponent(sessionId)}/holes/${holeNumber}/submit`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
  if (!res.ok) throw new Error(`Submit hole failed ${res.status}`);
  return res.json();
}

export async function finishSession(sessionId: string): Promise<ApiSession> {
  const res = await fetch(
    `${BASE}/api/sessions/${encodeURIComponent(sessionId)}/finish`,
    { method: 'POST' },
  );
  if (!res.ok) throw new Error(`Finish session failed ${res.status}`);
  return res.json();
}
