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
