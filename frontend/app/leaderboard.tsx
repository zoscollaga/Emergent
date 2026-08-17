import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";

import { colors, radius, spacing, typography } from "@/src/theme";
import { getSelectedCourse, getWebhookUrl, StoredCourse } from "@/src/lib/storage";
import { fetchLeaderboard, LeaderboardRow } from "@/src/lib/leaderboard";

const REFRESH_MS = 15_000;
const ALL_COURSES = "__ALL__";

type Mode = "individual" | "2bbb";
type SortKey = "handicap" | "gross" | "net" | "putts";
type SortDir = "asc" | "desc";

// A 2BBB team is the union of a mutually-marking pair. Each team has ONE row.
type TeamRow = {
  key: string;
  playerA: LeaderboardRow;
  playerB: LeaderboardRow;
  course: string;
  gross_score: number;
  net_score: number | null;
  handicap: number | null;   // combined avg for display
  total_putts: number;
  holes_played: number;
  complete: boolean;
};

export default function LeaderboardScreen() {
  const router = useRouter();
  const [date, setDate] = useState<Date>(startOfDay(new Date()));
  const [webhookMissing, setWebhookMissing] = useState(false);
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [course, setCourse] = useState<StoredCourse | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number>(0);
  const [mode, setMode] = useState<Mode>("individual");
  const [courseFilter, setCourseFilter] = useState<string>(ALL_COURSES);
  const [sortKey, setSortKey] = useState<SortKey>("gross");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const abortRef = useRef<AbortController | null>(null);

  const isoDate = useMemo(() => toISODate(date), [date]);

  useEffect(() => {
    (async () => setCourse(await getSelectedCourse()))();
  }, []);

  const load = useCallback(
    async (silent = false) => {
      const url = await getWebhookUrl();
      if (!url) {
        setWebhookMissing(true);
        setLoading(false);
        return;
      }
      setWebhookMissing(false);
      if (!silent) setLoading(true);
      const res = await fetchLeaderboard(url, isoDate);
      if (res.ok) {
        setRows(res.rows);
        setError(null);
        setLastUpdated(Date.now());
      } else {
        if (res.status === 404) {
          setRows([]);
          setError(null);
          setLastUpdated(Date.now());
        } else {
          setError(res.message || "Couldn't load the leaderboard.");
        }
      }
      setLoading(false);
      setRefreshing(false);
    },
    [isoDate],
  );

  useEffect(() => {
    load();
    const t = setInterval(() => load(true), REFRESH_MS);
    const abort = abortRef.current;
    return () => {
      clearInterval(t);
      abort?.abort();
    };
  }, [load]);

  const onRefresh = () => {
    Haptics.selectionAsync().catch(() => {});
    setRefreshing(true);
    load(true);
  };

  const shiftDate = (days: number) => {
    Haptics.selectionAsync().catch(() => {});
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    setDate(startOfDay(d));
  };

  const goToday = () => {
    Haptics.selectionAsync().catch(() => {});
    setDate(startOfDay(new Date()));
  };

  const isToday = isSameDay(date, new Date());
  const totalPar = course?.holes.reduce((s, h) => s + h.par, 0) ?? 0;
  const dateLabel = formatDateLabel(date);
  const lastUpdatedLabel = lastUpdated ? formatClock(new Date(lastUpdated)) : "\u2014";

  // Unique course names seen today (for the filter chip row). Guard against
  // numeric-looking values that can appear when a row is column-shifted.
  const availableCourses = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      const c = (r.course || "").trim();
      if (!c) return;
      if (/^\d+(\.\d+)?$/.test(c)) return;
      set.add(c);
    });
    return Array.from(set).sort();
  }, [rows]);

  // Filter by selected course
  const filteredRows = useMemo(() => {
    if (courseFilter === ALL_COURSES) return rows;
    return rows.filter((r) => r.course === courseFilter);
  }, [rows, courseFilter]);

  // Sort individual rows
  const sortedIndividual = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      // Always prefer more-holes-played first as a tie-breaker for meaningful ranking
      const cmp = compareRows(a, b, sortKey, sortDir);
      if (cmp !== 0) return cmp;
      if (a.holes_played !== b.holes_played) return b.holes_played - a.holes_played;
      return a.player_name.localeCompare(b.player_name);
    });
  }, [filteredRows, sortKey, sortDir]);

  // Build 2BBB teams
  const sortedTeams = useMemo(() => {
    return buildTeams(filteredRows).sort((a, b) =>
      compareTeams(a, b, sortKey, sortDir),
    );
  }, [filteredRows, sortKey, sortDir]);

  const onSort = (key: SortKey) => {
    Haptics.selectionAsync().catch(() => {});
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Default direction — lowest is best for gross/net/putts; asc = handicap
      setSortDir("asc");
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]} testID="leaderboard-screen">
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          testID="leaderboard-back-button"
          style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Leaderboard</Text>
          <Text style={styles.subtitle}>
            {`${isToday ? "Live \u00b7 today" : dateLabel} \u00b7 updated ${lastUpdatedLabel}`}
          </Text>
        </View>
        {!isToday && (
          <Pressable
            onPress={goToday}
            testID="leaderboard-today-button"
            hitSlop={8}
            style={({ pressed }) => [styles.todayBtn, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.todayBtnText}>Today</Text>
          </Pressable>
        )}
      </View>

      {/* Mode toggle */}
      <View style={styles.segment} testID="leaderboard-mode-toggle">
        <SegmentButton
          label="Individual"
          active={mode === "individual"}
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            setMode("individual");
          }}
          testID="mode-individual"
        />
        <SegmentButton
          label="2BBB"
          active={mode === "2bbb"}
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            setMode("2bbb");
          }}
          testID="mode-2bbb"
        />
      </View>

      {/* Course filter chips */}
      {availableCourses.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          <FilterChip
            label="All courses"
            active={courseFilter === ALL_COURSES}
            onPress={() => setCourseFilter(ALL_COURSES)}
            testID="course-filter-all"
          />
          {availableCourses.map((c) => (
            <FilterChip
              key={c}
              label={c}
              active={courseFilter === c}
              onPress={() => setCourseFilter(c)}
              testID={`course-filter-${c}`}
            />
          ))}
        </ScrollView>
      )}

      {/* Date bar */}
      <View style={styles.dateBar}>
        <Pressable
          onPress={() => shiftDate(-1)}
          testID="leaderboard-prev-day"
          hitSlop={10}
          style={({ pressed }) => [styles.dateNavBtn, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="chevron-back" size={20} color={colors.onSurface} />
        </Pressable>
        <View style={styles.dateCenter}>
          <Text style={styles.dateLabel} testID="leaderboard-date">
            {dateLabel}
          </Text>
          {isToday && (
            <View style={styles.liveDot}>
              <View style={styles.liveDotInner} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          )}
        </View>
        <Pressable
          onPress={() => shiftDate(1)}
          disabled={isToday}
          testID="leaderboard-next-day"
          hitSlop={10}
          style={({ pressed }) => [
            styles.dateNavBtn,
            isToday && styles.dateNavBtnDisabled,
            pressed && !isToday && { opacity: 0.6 },
          ]}
        >
          <Ionicons name="chevron-forward" size={20} color={isToday ? colors.borderStrong : colors.onSurface} />
        </Pressable>
      </View>

      {webhookMissing ? (
        <View style={styles.center}>
          <Ionicons name="link-outline" size={28} color={colors.brand} />
          <Text style={styles.hint}>
            Google Sheet isn{"\u2019"}t connected yet. Open Settings to paste the Web App URL.
          </Text>
          <Pressable
            onPress={() => router.push("/settings")}
            testID="leaderboard-open-settings"
            style={styles.primaryBtn}
          >
            <Text style={styles.primaryBtnText}>Open Settings</Text>
          </Pressable>
        </View>
      ) : loading ? (
        <View style={styles.center} testID="leaderboard-loading">
          <ActivityIndicator color={colors.brand} />
          <Text style={styles.hint}>Loading leaderboard{"\u2026"}</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle" size={28} color={colors.error} />
          <Text style={styles.errorText}>Couldn{"\u2019"}t load the leaderboard.</Text>
          <Text style={styles.hint} testID="leaderboard-error-message">{error}</Text>
          <Pressable onPress={() => load()} style={styles.primaryBtn} testID="leaderboard-retry">
            <Text style={styles.primaryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : (mode === "individual" ? sortedIndividual.length === 0 : sortedTeams.length === 0) ? (
        <View style={styles.center}>
          <Ionicons name="trophy-outline" size={30} color={colors.borderStrong} />
          <Text style={styles.hint}>
            {mode === "2bbb"
              ? "No pairs playing this course yet."
              : `No scorecards for ${dateLabel}${courseFilter === ALL_COURSES ? "" : " on " + courseFilter} yet.`}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: spacing.xxxl }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />
          }
        >
          <SortableHeader
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={onSort}
            mode={mode}
          />

          {mode === "individual"
            ? sortedIndividual.map((r, idx) => (
                <IndividualRow
                  key={`${r.scorecard_id || r.member_id || idx}`}
                  row={r}
                  rank={idx + 1}
                  totalPar={totalPar}
                />
              ))
            : sortedTeams.map((t, idx) => (
                <TeamRowView
                  key={t.key}
                  team={t}
                  rank={idx + 1}
                  totalPar={totalPar}
                />
              ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

/* -------------------- Sub-components -------------------- */

function SegmentButton({
  label,
  active,
  onPress,
  testID,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.segmentBtn,
        active && styles.segmentBtnActive,
        pressed && { opacity: 0.85 },
      ]}
    >
      <Text style={[styles.segmentBtnText, active && styles.segmentBtnTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function FilterChip({
  label,
  active,
  onPress,
  testID,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.chip,
        active && styles.chipActive,
        pressed && { opacity: 0.85 },
      ]}
    >
      <Text
        numberOfLines={1}
        style={[styles.chipText, active && styles.chipTextActive]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function SortableHeader({
  sortKey,
  sortDir,
  onSort,
  mode,
}: {
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
  mode: Mode;
}) {
  return (
    <View style={styles.tableHeader}>
      <Text style={[styles.thText, styles.colRank]}>#</Text>
      <Text style={[styles.thText, styles.colPlayer]}>
        {mode === "2bbb" ? "Team" : "Player"}
      </Text>
      <SortableTh
        label="HCP"
        active={sortKey === "handicap"}
        dir={sortDir}
        onPress={() => onSort("handicap")}
        style={styles.colHcp}
        testID="sort-handicap"
      />
      <SortableTh
        label="Gross"
        active={sortKey === "gross"}
        dir={sortDir}
        onPress={() => onSort("gross")}
        style={styles.colGross}
        testID="sort-gross"
      />
      <SortableTh
        label="Net"
        active={sortKey === "net"}
        dir={sortDir}
        onPress={() => onSort("net")}
        style={styles.colNet}
        testID="sort-net"
      />
      <SortableTh
        label="Putts"
        active={sortKey === "putts"}
        dir={sortDir}
        onPress={() => onSort("putts")}
        style={styles.colPutts}
        testID="sort-putts"
      />
      <Text style={[styles.thText, styles.colThru, { textAlign: "center" }]}>Thru</Text>
    </View>
  );
}

function SortableTh({
  label,
  active,
  dir,
  onPress,
  style,
  testID,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onPress: () => void;
  style: any;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      hitSlop={6}
      style={({ pressed }) => [
        styles.thPressable,
        style,
        pressed && { opacity: 0.6 },
      ]}
    >
      <Text style={[styles.thText, active && { color: colors.brand }]}>{label}</Text>
      <Ionicons
        name={active ? (dir === "asc" ? "arrow-up" : "arrow-down") : "swap-vertical"}
        size={10}
        color={active ? colors.brand : colors.muted}
      />
    </Pressable>
  );
}

function IndividualRow({
  row,
  rank,
  totalPar,
}: {
  row: LeaderboardRow;
  rank: number;
  totalPar: number;
}) {
  const complete = row.holes_played >= 18;
  const diff = complete && totalPar ? row.gross_score - totalPar : null;
  const diffLabel = diff == null ? "" : diff === 0 ? "E" : diff > 0 ? `+${diff}` : `${diff}`;
  const diffColor =
    diff == null ? colors.muted : diff < 0 ? colors.success : diff > 0 ? colors.error : colors.brand;
  const rankBg = getRankBg(rank);
  const rankFg = rank <= 3 ? "#1F2937" : colors.onSurfaceSecondary;
  const displayName = shortName(row.player_name);
  return (
    <View style={styles.tr} testID={`leaderboard-row-${row.member_id || rank}`}>
      <View style={styles.colRank}>
        <View style={[styles.rankPill, { backgroundColor: rankBg }]}>
          <Text style={[styles.rankPillText, { color: rankFg }]}>{rank}</Text>
        </View>
      </View>
      <View style={styles.colPlayer}>
        <Text style={styles.playerName} numberOfLines={1}>{displayName}</Text>
        <Text style={styles.playerMeta} numberOfLines={1}>
          {row.member_id ? `#${row.member_id}` : ""}
        </Text>
      </View>
      <View style={styles.colHcp}>
        <Text style={styles.tdText}>{row.handicap ?? "\u2014"}</Text>
      </View>
      <View style={styles.colGross}>
        <Text style={styles.grossValue}>{row.gross_score || "\u2014"}</Text>
        {diffLabel ? <Text style={[styles.grossDiff, { color: diffColor }]}>{diffLabel}</Text> : null}
      </View>
      <View style={styles.colNet}>
        <Text style={styles.netValue}>{row.net_score == null ? "\u2014" : row.net_score}</Text>
      </View>
      <View style={styles.colPutts}>
        <Text style={styles.tdText}>{row.total_putts || "\u2014"}</Text>
      </View>
      <View style={styles.colThru}>
        <Text style={[styles.tdText, complete && { color: colors.success, fontFamily: typography.textBold }]}>
          {complete ? "F" : `${row.holes_played}`}
        </Text>
      </View>
    </View>
  );
}

function TeamRowView({
  team,
  rank,
  totalPar,
}: {
  team: TeamRow;
  rank: number;
  totalPar: number;
}) {
  const diff = team.complete && totalPar ? team.gross_score - totalPar : null;
  const diffLabel = diff == null ? "" : diff === 0 ? "E" : diff > 0 ? `+${diff}` : `${diff}`;
  const diffColor =
    diff == null ? colors.muted : diff < 0 ? colors.success : diff > 0 ? colors.error : colors.brand;
  const rankBg = getRankBg(rank);
  const rankFg = rank <= 3 ? "#1F2937" : colors.onSurfaceSecondary;
  const nameA = shortName(team.playerA.player_name);
  const nameB = shortName(team.playerB.player_name);
  return (
    <View style={styles.tr} testID={`leaderboard-team-${team.key}`}>
      <View style={styles.colRank}>
        <View style={[styles.rankPill, { backgroundColor: rankBg }]}>
          <Text style={[styles.rankPillText, { color: rankFg }]}>{rank}</Text>
        </View>
      </View>
      <View style={styles.colPlayer}>
        <Text style={styles.playerName} numberOfLines={1}>{nameA}</Text>
        <Text style={styles.playerName} numberOfLines={1}>{nameB}</Text>
      </View>
      <View style={styles.colHcp}>
        <Text style={styles.tdText}>{team.handicap == null ? "\u2014" : team.handicap}</Text>
      </View>
      <View style={styles.colGross}>
        <Text style={styles.grossValue}>{team.gross_score || "\u2014"}</Text>
        {diffLabel ? <Text style={[styles.grossDiff, { color: diffColor }]}>{diffLabel}</Text> : null}
      </View>
      <View style={styles.colNet}>
        <Text style={styles.netValue}>{team.net_score == null ? "\u2014" : team.net_score}</Text>
      </View>
      <View style={styles.colPutts}>
        <Text style={styles.tdText}>{team.total_putts || "\u2014"}</Text>
      </View>
      <View style={styles.colThru}>
        <Text style={[styles.tdText, team.complete && { color: colors.success, fontFamily: typography.textBold }]}>
          {team.complete ? "F" : `${team.holes_played}`}
        </Text>
      </View>
    </View>
  );
}

/* -------------------- Data transforms -------------------- */

/** Build 2BBB team rows from a flat list of scorecards.
 *  A team is admitted when we have exactly TWO distinct rows that:
 *    - both have a member_id AND a marker_id set
 *    - reference each other (A.marker_id == B.member_id AND vice-versa)
 *    - are on the same course
 *  Solo rows (no marker_id) and one-sided pairings are excluded, so the 2BBB
 *  leaderboard never shows a "team of one".
 *
 *  IDs are normalised (trim + toString) before comparison so that trailing
 *  whitespace or numeric-vs-string mismatches (which happen when the Google
 *  Sheet returns some columns as numbers) never break the pairing on iOS.
 */
function buildTeams(rows: LeaderboardRow[]): TeamRow[] {
  // Normalise IDs once and index by trimmed string member_id
  const norm = (v: any) => String(v ?? "").trim();
  const byMember = new Map<string, LeaderboardRow>();
  rows.forEach((r) => {
    const mid = norm(r.member_id);
    if (mid) byMember.set(mid, r);
  });
  const seen = new Set<string>();
  const teams: TeamRow[] = [];
  for (const r of rows) {
    const rMid = norm(r.member_id);
    const rMkr = norm(r.marker_id);
    if (!rMid || !rMkr) continue;               // must have both ids
    if (rMid === rMkr) continue;                // can't mark yourself
    const partner = byMember.get(rMkr);
    if (!partner) continue;                      // partner must exist
    const pMid = norm(partner.member_id);
    const pMkr = norm(partner.marker_id);
    if (!pMid || !pMkr) continue;                // partner must also have both ids
    if (pMkr !== rMid) continue;                 // must be mutual
    if (pMid === rMid) continue;                 // truly distinct
    if (norm(r.course) !== norm(partner.course)) continue; // same course only
    const key = [rMid, rMkr].sort().join("::");
    if (seen.has(key)) continue;
    seen.add(key);
    const playerA = r;
    const playerB = partner;
    let gross = 0;
    let holes_played = 0;
    let complete = true;
    for (let i = 0; i < 18; i++) {
      const a = playerA.hole_scores[i];
      const b = playerB.hole_scores[i];
      if (a != null && b != null) {
        gross += Math.min(a, b);
        holes_played++;
      } else if (a != null || b != null) {
        // Only one partner has a score — count as played but not complete
        gross += (a ?? b) as number;
        holes_played++;
      } else {
        complete = false;
      }
    }
    complete = complete && holes_played === 18;
    const hcpAvg =
      playerA.handicap != null && playerB.handicap != null
        ? Math.round((playerA.handicap + playerB.handicap) / 2)
        : null;
    const net = hcpAvg == null ? null : gross - hcpAvg;
    teams.push({
      key,
      playerA,
      playerB,
      course: r.course,
      gross_score: gross,
      net_score: net,
      handicap: hcpAvg,
      total_putts: playerA.total_putts + playerB.total_putts,
      holes_played,
      complete,
    });
  }
  return teams;
}

function compareRows(
  a: LeaderboardRow,
  b: LeaderboardRow,
  key: SortKey,
  dir: SortDir,
): number {
  const av = pickRow(a, key);
  const bv = pickRow(b, key);
  return applyDir(compareNumbers(av, bv), dir);
}
function compareTeams(a: TeamRow, b: TeamRow, key: SortKey, dir: SortDir): number {
  const av = pickTeam(a, key);
  const bv = pickTeam(b, key);
  const primary = applyDir(compareNumbers(av, bv), dir);
  if (primary !== 0) return primary;
  return b.holes_played - a.holes_played;
}
function pickRow(r: LeaderboardRow, key: SortKey): number | null {
  switch (key) {
    case "handicap": return r.handicap;
    case "gross":    return r.gross_score;
    case "net":      return r.net_score;
    case "putts":    return r.total_putts;
  }
}
function pickTeam(t: TeamRow, key: SortKey): number | null {
  switch (key) {
    case "handicap": return t.handicap;
    case "gross":    return t.gross_score;
    case "net":      return t.net_score;
    case "putts":    return t.total_putts;
  }
}
function compareNumbers(a: number | null, b: number | null): number {
  // Nulls / zeros always sink to the bottom regardless of direction
  const av = a == null || a === 0 ? Number.POSITIVE_INFINITY : a;
  const bv = b == null || b === 0 ? Number.POSITIVE_INFINITY : b;
  return av - bv;
}
function applyDir(cmp: number, dir: SortDir): number {
  return dir === "asc" ? cmp : -cmp;
}

/* -------------------- Utilities -------------------- */

function getRankBg(rank: number): string {
  if (rank === 1) return "#FDE68A";
  if (rank === 2) return "#E5E7EB";
  if (rank === 3) return "#FBCEB1";
  return colors.surfaceSecondary;
}
function shortName(full: string): string {
  const s = (full || "").trim();
  if (!s) return "\u2014";
  const parts = s.split(/\s+/);
  if (parts.length === 1) return parts[0];
  const first = parts[0];
  const last = parts[parts.length - 1];
  return `${first} ${last[0]}.`;
}
function toISODate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}
function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function formatDateLabel(d: Date): string {
  const today = startOfDay(new Date());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (isSameDay(d, today)) return "Today";
  if (isSameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: startOfDay(new Date()).getFullYear() === d.getFullYear() ? undefined : "numeric",
  });
}
function formatClock(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* -------------------- Styles -------------------- */

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  center: { alignItems: "center", justifyContent: "center", padding: spacing.xxl, gap: spacing.md },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  iconBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: typography.display, fontSize: 26, color: colors.onSurface },
  subtitle: { fontFamily: typography.text, fontSize: 12, color: colors.muted, marginTop: 2 },
  todayBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
  },
  todayBtnText: {
    color: colors.brand,
    fontFamily: typography.textBold,
    fontSize: 12,
    letterSpacing: 0.5,
  },
  segment: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    flexDirection: "row",
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    padding: 4,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentBtnActive: { backgroundColor: colors.brandPrimary },
  segmentBtnText: {
    fontFamily: typography.textBold,
    fontSize: 12,
    color: colors.onSurfaceSecondary,
    letterSpacing: 0.5,
  },
  segmentBtnTextActive: { color: colors.onBrandPrimary },
  filterRow: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    gap: 8,
    alignItems: "center",
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { color: colors.onSurfaceSecondary, fontFamily: typography.textBold, fontSize: 11, letterSpacing: 0.4 },
  chipTextActive: { color: colors.onBrandSecondary },
  dateBar: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSecondary,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
  },
  dateNavBtn: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 19,
  },
  dateNavBtnDisabled: { opacity: 0.4 },
  dateCenter: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3 },
  dateLabel: { fontFamily: typography.textBold, fontSize: 15, color: colors.onSurface },
  liveDot: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: "#FEE2E2",
  },
  liveDotInner: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.error },
  liveText: { color: "#991B1B", fontFamily: typography.textBold, fontSize: 9, letterSpacing: 1 },
  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surfaceSecondary,
    gap: 3,
  },
  thText: {
    fontFamily: typography.textBold,
    fontSize: 10,
    color: colors.muted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  thPressable: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3 },
  tr: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    gap: 3,
  },
  colRank: { width: 28, alignItems: "flex-start" },
  colPlayer: { flex: 1, minWidth: 0 },
  colHcp: { width: 32, alignItems: "center" },
  colGross: { width: 52, alignItems: "center" },
  colNet: { width: 34, alignItems: "center" },
  colPutts: { width: 40, alignItems: "center" },
  colThru: { width: 30, alignItems: "center" },
  rankPill: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  rankPillText: { fontFamily: typography.textBold, fontSize: 12 },
  playerName: { fontFamily: typography.textBold, fontSize: 13, color: colors.onSurface },
  playerMeta: { fontFamily: typography.text, fontSize: 10, color: colors.muted, marginTop: 1 },
  grossValue: { fontFamily: typography.display, fontSize: 18, color: colors.onSurface, lineHeight: 20 },
  grossDiff: { fontFamily: typography.textBold, fontSize: 10, marginTop: 1 },
  netValue: { fontFamily: typography.textBold, fontSize: 15, color: colors.brand },
  tdText: { fontFamily: typography.text, fontSize: 13, color: colors.onSurface },
  hint: { color: colors.muted, fontFamily: typography.text, textAlign: "center", lineHeight: 20 },
  errorText: { color: colors.error, fontFamily: typography.textBold, textAlign: "center" },
  primaryBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
    marginTop: spacing.md,
  },
  primaryBtnText: { color: colors.onBrandPrimary, fontFamily: typography.textBold },
});
