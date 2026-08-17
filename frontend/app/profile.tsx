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
import { useFocusEffect, useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { colors, radius, spacing, typography } from "@/src/theme";
import {
  getIdentifiedMember,
  getRoundHistory,
  getWebhookUrl,
  IdentifiedMember,
} from "@/src/lib/storage";
import {
  cacheCloudRounds,
  computeStats,
  fetchPlayerHistory,
  getCachedCloudRounds,
  HistoryStats,
  mergeRounds,
  PlayerRound,
} from "@/src/lib/history";

type FilterMode = "all" | "solo" | "2bbb";

export default function ProfileScreen() {
  const router = useRouter();
  const [identity, setIdentity] = useState<IdentifiedMember | null>(null);
  const [rounds, setRounds] = useState<PlayerRound[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterMode>("all");
  const abortLoad = useRef(false);

  const applyMerge = useCallback(async (cloud: PlayerRound[]) => {
    const local = await getRoundHistory();
    // Build local→scorecard mapping so we can identify already-uploaded rounds
    const mapping: Record<string, string> = {};
    for (const r of local) {
      const k = `scId::solo::${r.id}`;
      const sc = await AsyncStorage.getItem(k);
      if (sc) mapping[r.id] = sc;
    }
    const merged = mergeRounds(cloud, local, mapping);
    if (!abortLoad.current) setRounds(merged);
  }, []);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      const me = await getIdentifiedMember();
      setIdentity(me);
      // 1) Instant paint from local cache (cloud + on-device rounds)
      const cached = await getCachedCloudRounds();
      await applyMerge(cached);
      setLoading(false);
      // 2) Background refresh from Google Sheets
      if (!me?.member_id) {
        setCloudError(null);
        setRefreshing(false);
        return;
      }
      const url = await getWebhookUrl();
      if (!url) {
        setCloudError(null);
        setRefreshing(false);
        return;
      }
      const res = await fetchPlayerHistory(url, me.member_id);
      if (abortLoad.current) return;
      if (res.ok) {
        await cacheCloudRounds(res.rounds);
        await applyMerge(res.rounds);
        setCloudError(null);
      } else {
        // 404 = tab not present, no history yet — not an error
        setCloudError(res.status === 404 ? null : res.message || "Couldn't load cloud rounds.");
      }
      setRefreshing(false);
    },
    [applyMerge],
  );

  useFocusEffect(
    useCallback(() => {
      abortLoad.current = false;
      load(true);
      return () => {
        abortLoad.current = true;
      };
    }, [load]),
  );

  useEffect(() => {
    load(false);
    return () => {
      abortLoad.current = true;
    };
  }, [load]);

  const displayName = identity
    ? `${identity.first_name} ${identity.last_name}`.trim() || `Member #${identity.member_id}`
    : "Not signed in";

  const stats: HistoryStats = useMemo(() => computeStats(rounds), [rounds]);

  const filteredRounds = useMemo(() => {
    if (filter === "all") return rounds;
    if (filter === "2bbb") return rounds.filter((r) => r.is_pair);
    return rounds.filter((r) => !r.is_pair);
  }, [rounds, filter]);

  const onRefresh = () => {
    setRefreshing(true);
    load(true);
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]} testID="profile-screen">
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          testID="profile-back-button"
          style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Player</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing.xxxl }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />
        }
      >
        {/* Details card */}
        <View style={styles.card} testID="profile-details-card">
          <View style={styles.avatar}>
            <Ionicons name="person" size={30} color={colors.onBrandPrimary} />
          </View>
          <Text style={styles.name} numberOfLines={2}>{displayName}</Text>
          {identity ? (
            <>
              <Text style={styles.subline}>
                {identity.member_id ? `Member #${identity.member_id}` : ""}
                {identity.handicap != null
                  ? `${identity.member_id ? "  ·  " : ""}HCP ${identity.handicap}`
                  : ""}
              </Text>
              {identity.mobile ? (
                <View style={styles.contactRow}>
                  <View style={styles.contactChip}>
                    <Ionicons name="call" size={12} color={colors.brand} />
                    <Text style={styles.contactText}>{identity.mobile}</Text>
                  </View>
                </View>
              ) : null}
              {identity.status ? (
                <View
                  style={[
                    styles.statusChip,
                    identity.status.toLowerCase() === "current" && styles.statusChipCurrent,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusChipText,
                      identity.status.toLowerCase() === "current" && { color: colors.brand },
                    ]}
                  >
                    {identity.status}
                  </Text>
                </View>
              ) : null}
              <Pressable
                onPress={() => router.push("/identify")}
                testID="profile-change-identity"
                style={({ pressed }) => [styles.linkBtn, pressed && { opacity: 0.6 }]}
              >
                <Ionicons name="swap-horizontal" size={14} color={colors.brand} />
                <Text style={styles.linkBtnText}>Not you? Switch player</Text>
              </Pressable>
            </>
          ) : (
            <Pressable
              onPress={() => router.push("/identify")}
              testID="profile-sign-in"
              style={styles.primaryBtn}
            >
              <Text style={styles.primaryBtnText}>Choose your name</Text>
            </Pressable>
          )}
        </View>

        {/* Stats card */}
        {stats.total_rounds > 0 && (
          <View style={styles.statsCard} testID="profile-stats-card">
            <View style={styles.statsRow}>
              <StatBlock label="Total rounds" value={String(stats.total_rounds)} />
              <View style={styles.statDivider} />
              <StatBlock
                label="Avg gross"
                value={stats.avg_gross != null ? String(stats.avg_gross) : "—"}
                sub={
                  stats.best_gross != null && stats.worst_gross != null
                    ? `best ${stats.best_gross} · worst ${stats.worst_gross}`
                    : undefined
                }
              />
            </View>
            <View style={styles.statsRow}>
              <StatBlock label="Avg putts" value={stats.avg_putts != null ? String(stats.avg_putts) : "—"} />
              <View style={styles.statDivider} />
              <StatBlock label="This month" value={String(stats.rounds_this_month)} />
            </View>
            {stats.favourite_course && (
              <View style={styles.favRow}>
                <Ionicons name="star" size={12} color={colors.brand} />
                <Text style={styles.favText} numberOfLines={1}>
                  Favourite: {stats.favourite_course.name}
                </Text>
                <Text style={styles.favSub}>· {stats.favourite_course.count} rounds</Text>
              </View>
            )}
          </View>
        )}

        {cloudError && (
          <View style={styles.errorBanner} testID="profile-cloud-error">
            <Ionicons name="cloud-offline-outline" size={16} color={colors.error} />
            <Text style={styles.errorBannerText} numberOfLines={4}>
              {cloudError}
            </Text>
          </View>
        )}

        {/* Filter chips */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Rounds</Text>
            {rounds.length > 0 && (
              <Text style={styles.sectionMeta}>{filteredRounds.length} of {rounds.length}</Text>
            )}
          </View>
          <View style={styles.filterRow} testID="profile-filter">
            <FilterPill
              label="All"
              active={filter === "all"}
              onPress={() => setFilter("all")}
              testID="filter-all"
            />
            <FilterPill
              label="Solo"
              active={filter === "solo"}
              onPress={() => setFilter("solo")}
              testID="filter-solo"
            />
            <FilterPill
              label="2BBB"
              active={filter === "2bbb"}
              onPress={() => setFilter("2bbb")}
              testID="filter-2bbb"
            />
          </View>

          {loading ? (
            <ActivityIndicator color={colors.brand} style={{ marginVertical: spacing.xl }} />
          ) : filteredRounds.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="golf-outline" size={30} color={colors.borderStrong} />
              <Text style={styles.emptyText}>
                {rounds.length === 0
                  ? "No rounds yet.\nFinish a round to see it here."
                  : "No rounds match this filter."}
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.tableHeader}>
                <Text style={[styles.thText, styles.colDate]}>Date</Text>
                <Text style={[styles.thText, styles.colCourse]}>Course</Text>
                <Text style={[styles.thText, styles.colNum]}>Gross</Text>
                <Text style={[styles.thText, styles.colNum]}>Net</Text>
                <Text style={[styles.thText, styles.colNum]}>Putts</Text>
              </View>
              {filteredRounds.map((r) => {
                const net =
                  r.net_score != null
                    ? r.net_score
                    : identity?.handicap != null && r.gross_score > 0
                    ? r.gross_score - identity.handicap
                    : null;
                return (
                  <Pressable
                    key={`${r.source}-${r.id}`}
                    testID={`profile-round-${r.id}`}
                    onPress={() =>
                      router.push({ pathname: "/summary", params: { id: r.id } })
                    }
                    style={({ pressed }) => [styles.roundRow, pressed && { opacity: 0.6 }]}
                  >
                    <View style={styles.colDate}>
                      <Text style={styles.tdText} numberOfLines={1}>
                        {formatDate(r.date)}
                      </Text>
                      {r.is_pair && (
                        <View style={styles.pairBadge}>
                          <Text style={styles.pairBadgeText}>2BBB</Text>
                        </View>
                      )}
                      {r.source === "local" && (
                        <View style={styles.offlineBadge}>
                          <Ionicons name="cloud-offline-outline" size={9} color={colors.muted} />
                          <Text style={styles.offlineBadgeText}>offline</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.tdText, styles.colCourse]} numberOfLines={1}>
                      {r.course_name}
                    </Text>
                    <Text style={[styles.tdNum, styles.colNum]}>
                      {r.gross_score || "\u2014"}
                    </Text>
                    <Text style={[styles.tdNum, styles.colNum]}>{net ?? "\u2014"}</Text>
                    <Text style={[styles.tdNum, styles.colNum]}>
                      {r.total_putts || "\u2014"}
                    </Text>
                    <Ionicons name="chevron-forward" size={14} color={colors.muted} />
                  </Pressable>
                );
              })}
              {netFootNote(identity)}
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatBlock({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={styles.statBlock}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      {sub ? <Text style={styles.statSub} numberOfLines={1}>{sub}</Text> : null}
    </View>
  );
}

function FilterPill({
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
        styles.filterPill,
        active && styles.filterPillActive,
        pressed && { opacity: 0.8 },
      ]}
    >
      <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function netFootNote(identity: IdentifiedMember | null) {
  if (!identity || identity.handicap == null) {
    return (
      <Text style={styles.footNote}>
        Net = Gross - Handicap. Pick or sign in as your player to see net scores.
      </Text>
    );
  }
  return <Text style={styles.footNote}>Net = Gross - HCP {identity.handicap}</Text>;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${String(d.getFullYear()).slice(-2)}`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
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

  card: {
    marginHorizontal: spacing.xl,
    padding: spacing.xl,
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.lg,
    alignItems: "center",
    gap: spacing.sm,
  },
  avatar: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: colors.brand,
    alignItems: "center", justifyContent: "center",
    marginBottom: spacing.sm,
  },
  name: { fontFamily: typography.display, fontSize: 22, color: colors.onSurface, textAlign: "center" },
  subline: { fontFamily: typography.textBold, color: colors.brand, fontSize: 13, letterSpacing: 0.4 },
  contactRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "center" },
  contactChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: colors.surface, borderRadius: radius.pill,
  },
  contactText: { fontFamily: typography.text, fontSize: 11, color: colors.onSurfaceSecondary },
  statusChip: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: radius.pill, backgroundColor: colors.surface,
  },
  statusChipCurrent: { backgroundColor: colors.surface },
  statusChipText: { fontFamily: typography.textBold, fontSize: 11, color: colors.onSurfaceSecondary, letterSpacing: 0.5 },
  linkBtn: { flexDirection: "row", gap: 4, alignItems: "center", marginTop: spacing.sm },
  linkBtnText: { fontFamily: typography.textBold, fontSize: 12, color: colors.brand, letterSpacing: 0.4 },
  primaryBtn: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
    borderRadius: radius.pill, backgroundColor: colors.brandPrimary,
  },
  primaryBtnText: { color: colors.onBrandPrimary, fontFamily: typography.textBold },

  statsCard: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSecondary,
    gap: spacing.md,
  },
  statsRow: { flexDirection: "row", alignItems: "center" },
  statBlock: { flex: 1 },
  statLabel: {
    fontFamily: typography.textBold,
    fontSize: 10,
    color: colors.muted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  statValue: {
    fontFamily: typography.display,
    fontSize: 26,
    color: colors.onSurface,
    lineHeight: 30,
    marginTop: 2,
  },
  statSub: { fontFamily: typography.text, fontSize: 11, color: colors.muted, marginTop: 2 },
  statDivider: { width: 1, height: 40, backgroundColor: colors.divider },
  favRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  favText: { flex: 1, fontFamily: typography.textBold, fontSize: 12, color: colors.onSurface },
  favSub: { fontFamily: typography.text, fontSize: 11, color: colors.muted },

  errorBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    marginHorizontal: spacing.xl,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: "#FEE2E2",
  },
  errorBannerText: { flex: 1, color: "#991B1B", fontFamily: typography.text, fontSize: 12, lineHeight: 16 },

  section: { marginHorizontal: spacing.xl, marginTop: spacing.xl },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontFamily: typography.textBold, fontSize: 12,
    color: colors.muted, letterSpacing: 1, textTransform: "uppercase",
  },
  sectionMeta: { fontFamily: typography.text, fontSize: 11, color: colors.muted },
  filterRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: spacing.md,
  },
  filterPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filterPillActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  filterPillText: {
    color: colors.onSurfaceSecondary,
    fontFamily: typography.textBold,
    fontSize: 11,
    letterSpacing: 0.4,
  },
  filterPillTextActive: { color: colors.onBrandSecondary },

  emptyBox: {
    alignItems: "center", justifyContent: "center",
    paddingVertical: spacing.xxxl, gap: spacing.md,
  },
  emptyText: { color: colors.muted, fontFamily: typography.text, textAlign: "center", lineHeight: 19 },
  tableHeader: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: spacing.sm, gap: 4,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.divider,
  },
  thText: {
    fontFamily: typography.textBold, fontSize: 10, color: colors.muted,
    letterSpacing: 0.6, textTransform: "uppercase",
  },
  colDate: { width: 72 },
  colCourse: { flex: 1, minWidth: 0 },
  colNum: { width: 40, textAlign: "center" },
  roundRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: spacing.md, gap: 4,
    borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  tdText: { fontFamily: typography.text, fontSize: 13, color: colors.onSurface },
  tdNum: { fontFamily: typography.textBold, fontSize: 14, color: colors.onSurface, textAlign: "center" },
  pairBadge: {
    alignSelf: "flex-start",
    marginTop: 2,
    paddingHorizontal: 5,
    paddingVertical: 1,
    backgroundColor: colors.brandTertiary,
    borderRadius: 4,
  },
  pairBadgeText: {
    fontFamily: typography.textBold,
    fontSize: 8,
    color: colors.brand,
    letterSpacing: 0.4,
  },
  offlineBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginTop: 2,
  },
  offlineBadgeText: { fontFamily: typography.text, fontSize: 9, color: colors.muted },
  footNote: {
    fontFamily: typography.text, fontSize: 11, color: colors.muted,
    marginTop: spacing.md, textAlign: "center",
  },
});
