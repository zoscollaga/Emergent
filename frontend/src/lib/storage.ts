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
const K_SHEETS_WEBHOOK = 'gs.sheetsWebhook';
const K_EXPORTED_ROUNDS = 'gs.exportedRounds';
const K_DEVICE_ID = 'gs.deviceId';
const K_MEMBER_ID = 'gs.memberId';
const K_ACTIVE_SESSION = 'gs.activeSession';
const K_MEMBERS_WEBHOOK = 'gs.membersWebhook';
const K_IDENTIFIED_MEMBER = 'gs.identifiedMember';

export type IdentifiedMember = {
  member_id: string;
  first_name: string;
  last_name: string;
  handicap: number | null;
  status: string;
  mobile: string;
};

export async function getIdentifiedMember(): Promise<IdentifiedMember | null> {
  const raw = await AsyncStorage.getItem(K_IDENTIFIED_MEMBER);
  return raw ? JSON.parse(raw) : null;
}
export async function setIdentifiedMember(m: IdentifiedMember) {
  await AsyncStorage.setItem(K_IDENTIFIED_MEMBER, JSON.stringify(m));
  await AsyncStorage.setItem(K_MEMBER_ID, m.member_id);
}
export async function clearIdentifiedMember() {
  await AsyncStorage.removeItem(K_IDENTIFIED_MEMBER);
}

export async function getMembersWebhook(): Promise<string | null> {
  const v = await AsyncStorage.getItem(K_MEMBERS_WEBHOOK);
  return v && v.trim() ? v.trim() : null;
}
export async function setMembersWebhook(url: string) {
  await AsyncStorage.setItem(K_MEMBERS_WEBHOOK, url.trim());
}

export async function getDeviceId(): Promise<string> {
  let id = await AsyncStorage.getItem(K_DEVICE_ID);
  if (!id) {
    id = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await AsyncStorage.setItem(K_DEVICE_ID, id);
  }
  return id;
}

export async function getMemberId(): Promise<string> {
  let id = await AsyncStorage.getItem(K_MEMBER_ID);
  if (!id) {
    id = String(Math.floor(1000 + Math.random() * 9000));
    await AsyncStorage.setItem(K_MEMBER_ID, id);
  }
  return id;
}

export async function setMemberId(id: string) {
  await AsyncStorage.setItem(K_MEMBER_ID, id);
}

export async function getActiveSessionId(): Promise<string | null> {
  return AsyncStorage.getItem(K_ACTIVE_SESSION);
}
export async function setActiveSessionId(id: string) {
  await AsyncStorage.setItem(K_ACTIVE_SESSION, id);
}
export async function clearActiveSessionId() {
  await AsyncStorage.removeItem(K_ACTIVE_SESSION);
}

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

export async function getSheetsWebhook(): Promise<string | null> {
  const v = await AsyncStorage.getItem(K_SHEETS_WEBHOOK);
  return v && v.trim() ? v.trim() : null;
}
export async function setSheetsWebhook(url: string) {
  await AsyncStorage.setItem(K_SHEETS_WEBHOOK, url.trim());
}
export async function clearSheetsWebhook() {
  await AsyncStorage.removeItem(K_SHEETS_WEBHOOK);
}

export async function markRoundExported(roundId: string) {
  const raw = await AsyncStorage.getItem(K_EXPORTED_ROUNDS);
  const arr: string[] = raw ? JSON.parse(raw) : [];
  if (!arr.includes(roundId)) arr.push(roundId);
  await AsyncStorage.setItem(K_EXPORTED_ROUNDS, JSON.stringify(arr));
}
export async function isRoundExported(roundId: string): Promise<boolean> {
  const raw = await AsyncStorage.getItem(K_EXPORTED_ROUNDS);
  const arr: string[] = raw ? JSON.parse(raw) : [];
  return arr.includes(roundId);
}
