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
        setRows(sortRows(res.rows));
        setError(null);
        setLastUpdated(Date.now());
      } else {
        // A 404 typically means "no tab for that date yet" — treat as empty.
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

  // Initial load + polling
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
  const lastUpdatedLabel = lastUpdated
    ? formatClock(new Date(lastUpdated))
    : "—";

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
            {isToday ? "Live · today" : dateLabel} · updated {lastUpdatedLabel}
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
          <Text style={styles.hint}>Loading leaderboard…</Text>
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
      ) : rows.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="trophy-outline" size={30} color={colors.borderStrong} />
          <Text style={styles.hint}>
            No scorecards submitted for {dateLabel} yet.{"\n"}
            Play a round and hit Export to appear here.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: spacing.xxxl }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />
          }
        >
          <View style={styles.tableHeader}>
            <Text style={[styles.thText, styles.colRank]}>#</Text>
            <Text style={[styles.thText, styles.colPlayer]}>Player</Text>
            <Text style={[styles.thText, styles.colGross, { textAlign: "center" }]}>Gross</Text>
            <Text style={[styles.thText, styles.colNet, { textAlign: "center" }]}>Net</Text>
            <Text style={[styles.thText, styles.colPutts, { textAlign: "center" }]}>Putts</Text>
            <Text style={[styles.thText, styles.colThru, { textAlign: "center" }]}>Thru</Text>
          </View>

          {rows.map((r, idx) => (
            <Row
              key={`${r.scorecard_id || r.member_id || idx}`}
              row={r}
              rank={idx + 1}
              totalPar={totalPar}
            />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Row({
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
  const diffLabel =
    diff == null ? "" : diff === 0 ? "E" : diff > 0 ? `+${diff}` : `${diff}`;
  const diffColor =
    diff == null
      ? colors.muted
      : diff < 0
      ? colors.success
      : diff > 0
      ? colors.error
      : colors.brand;
  const rankBg =
    rank === 1
      ? "#FDE68A"
      : rank === 2
      ? "#E5E7EB"
      : rank === 3
      ? "#FBCEB1"
      : colors.surfaceSecondary;
  const rankFg = rank <= 3 ? "#1F2937" : colors.onSurfaceSecondary;
  const displayName = shortName(row.player_name);
  return (
    <View style={styles.tr} testID={`leaderboard-row-${row.member_id || rank}`}>
      <View style={[styles.colRank, { alignItems: "flex-start" }]}>
        <View style={[styles.rankPill, { backgroundColor: rankBg }]}>
          <Text style={[styles.rankPillText, { color: rankFg }]}>{rank}</Text>
        </View>
      </View>
      <View style={styles.colPlayer}>
        <Text style={styles.playerName} numberOfLines={1}>
          {displayName}
        </Text>
        <Text style={styles.playerMeta} numberOfLines={1}>
          {row.member_id ? `#${row.member_id}` : ""}
          {row.handicap != null ? `${row.member_id ? " · " : ""}HCP ${row.handicap}` : ""}
        </Text>
      </View>
      <View style={styles.colGross}>
        <Text style={styles.grossValue}>{row.gross_score || "—"}</Text>
        {diffLabel ? (
          <Text style={[styles.grossDiff, { color: diffColor }]}>{diffLabel}</Text>
        ) : null}
      </View>
      <View style={styles.colNet}>
        <Text style={styles.netValue}>
          {row.net_score == null ? "—" : row.net_score}
        </Text>
      </View>
      <View style={styles.colPutts}>
        <Text style={styles.tdText}>{row.total_putts || "—"}</Text>
      </View>
      <View style={styles.colThru}>
        <Text style={[styles.tdText, complete && { color: colors.success, fontFamily: typography.textBold }]}>
          {complete ? "F" : `${row.holes_played}`}
        </Text>
      </View>
    </View>
  );
}

/** "John Smith" → "John S." · "John" → "John" · "" → "—" */
function shortName(full: string): string {
  const s = (full || "").trim();
  if (!s) return "—";
  const parts = s.split(/\s+/);
  if (parts.length === 1) return parts[0];
  const first = parts[0];
  const last = parts[parts.length - 1];
  return `${first} ${last[0]}.`;
}

function sortRows(rows: LeaderboardRow[]): LeaderboardRow[] {
  return [...rows].sort((a, b) => {
    // Prefer more-holes-played first; then lower gross score
    if (a.holes_played !== b.holes_played) return b.holes_played - a.holes_played;
    if (a.gross_score !== b.gross_score) return a.gross_score - b.gross_score;
    return a.player_name.localeCompare(b.player_name);
  });
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
  liveDotInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.error,
  },
  liveText: {
    color: "#991B1B",
    fontFamily: typography.textBold,
    fontSize: 9,
    letterSpacing: 1,
  },
  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surfaceSecondary,
    gap: 4,
  },
  thText: {
    fontFamily: typography.textBold,
    fontSize: 10,
    color: colors.muted,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  tr: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    gap: 4,
  },
  colRank: { width: 30, alignItems: "flex-start" },
  colPlayer: { flex: 1, minWidth: 0 },
  colGross: { width: 54, alignItems: "center" },
  colNet: { width: 40, alignItems: "center" },
  colPutts: { width: 42, alignItems: "center" },
  colThru: { width: 34, alignItems: "center" },
  rankPill: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  rankPillText: { fontFamily: typography.textBold, fontSize: 12 },
  playerCell: { flex: 1 },
  playerName: {
    fontFamily: typography.textBold,
    fontSize: 14,
    color: colors.onSurface,
  },
  playerMeta: {
    fontFamily: typography.text,
    fontSize: 10,
    color: colors.muted,
    marginTop: 1,
  },
  grossValue: {
    fontFamily: typography.display,
    fontSize: 18,
    color: colors.onSurface,
    lineHeight: 20,
  },
  grossDiff: {
    fontFamily: typography.textBold,
    fontSize: 10,
    marginTop: 1,
  },
  netValue: {
    fontFamily: typography.textBold,
    fontSize: 15,
    color: colors.brand,
  },
  tdText: {
    fontFamily: typography.text,
    fontSize: 14,
    color: colors.onSurface,
  },
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
