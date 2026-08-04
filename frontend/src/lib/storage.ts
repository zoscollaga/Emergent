import AsyncStorage from '@react-native-async-storage/async-storage';

export type StoredHole = {
  number: number;
  par: number;
  distance: number; // metres
  index: number;
};

export type StoredCourse = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  distance_km?: number;
  holes: StoredHole[];
};

export type HoleEntry = {
  number: number;
  score: number | null;
  putts: number | null;
};

export type ActiveRound = {
  course: StoredCourse;
  entries: HoleEntry[];
  currentHole: number;
  startedAt: string;
};

const K_SELECTED_COURSE = 'gs.selectedCourse';
const K_ACTIVE_ROUND = 'gs.activeRound';
const K_ROUND_HISTORY = 'gs.roundHistory';
const K_COURSE_OVERRIDES = 'gs.courseOverrides'; // per-course edited hole info

export async function getSelectedCourse(): Promise<StoredCourse | null> {
  const raw = await AsyncStorage.getItem(K_SELECTED_COURSE);
  return raw ? JSON.parse(raw) : null;
}
export async function setSelectedCourse(c: StoredCourse) {
  await AsyncStorage.setItem(K_SELECTED_COURSE, JSON.stringify(c));
}

export async function getActiveRound(): Promise<ActiveRound | null> {
  const raw = await AsyncStorage.getItem(K_ACTIVE_ROUND);
  return raw ? JSON.parse(raw) : null;
}
export async function setActiveRound(r: ActiveRound) {
  await AsyncStorage.setItem(K_ACTIVE_ROUND, JSON.stringify(r));
}
export async function clearActiveRound() {
  await AsyncStorage.removeItem(K_ACTIVE_ROUND);
}

export type FinishedRound = {
  id: string;
  date: string;
  course_id: string;
  course_name: string;
  holes: HoleEntry[];
  total_score: number;
  total_putts: number;
};

export async function getRoundHistory(): Promise<FinishedRound[]> {
  const raw = await AsyncStorage.getItem(K_ROUND_HISTORY);
  return raw ? JSON.parse(raw) : [];
}
export async function pushRoundHistory(r: FinishedRound) {
  const list = await getRoundHistory();
  list.unshift(r);
  await AsyncStorage.setItem(K_ROUND_HISTORY, JSON.stringify(list.slice(0, 100)));
}

export async function getCourseOverride(id: string): Promise<StoredHole[] | null> {
  const raw = await AsyncStorage.getItem(K_COURSE_OVERRIDES);
  const map = raw ? JSON.parse(raw) : {};
  return map[id] || null;
}
export async function setCourseOverride(id: string, holes: StoredHole[]) {
  const raw = await AsyncStorage.getItem(K_COURSE_OVERRIDES);
  const map = raw ? JSON.parse(raw) : {};
  map[id] = holes;
  await AsyncStorage.setItem(K_COURSE_OVERRIDES, JSON.stringify(map));
}
