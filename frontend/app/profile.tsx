import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";

import { colors, radius, spacing, typography } from "@/src/theme";
import {
  FinishedRound,
  getIdentifiedMember,
  getRoundHistory,
  IdentifiedMember,
} from "@/src/lib/storage";

export default function ProfileScreen() {
  const router = useRouter();
  const [identity, setIdentity] = useState<IdentifiedMember | null>(null);
  const [rounds, setRounds] = useState<FinishedRound[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [me, hist] = await Promise.all([getIdentifiedMember(), getRoundHistory()]);
    setIdentity(me);
    // Newest first (already the case from pushRoundHistory) — filter to this
    // player's rounds if the round history's course/name matches identity, but
    // since history is device-local we just show everything captured on this
    // device.
    setRounds(hist);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    load();
  }, [load]);

  const displayName = identity
    ? `${identity.first_name} ${identity.last_name}`.trim() || `Member #${identity.member_id}`
    : "Not signed in";

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

      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
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
                {identity.handicap != null ? `${identity.member_id ? "  ·  " : ""}HCP ${identity.handicap}` : ""}
              </Text>
              {(identity.email || identity.mobile) && (
                <View style={styles.contactRow}>
                  {identity.email ? (
                    <View style={styles.contactChip}>
                      <Ionicons name="mail" size={12} color={colors.brand} />
                      <Text style={styles.contactText}>{identity.email}</Text>
                    </View>
                  ) : null}
                  {identity.mobile ? (
                    <View style={styles.contactChip}>
                      <Ionicons name="call" size={12} color={colors.brand} />
                      <Text style={styles.contactText}>{identity.mobile}</Text>
                    </View>
                  ) : null}
                </View>
              )}
              {identity.status ? (
                <View style={[styles.statusChip, identity.status.toLowerCase() === "current" && styles.statusChipCurrent]}>
                  <Text style={[styles.statusChipText, identity.status.toLowerCase() === "current" && { color: colors.brand }]}>
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

        {/* Rounds list */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent rounds</Text>
          {loading ? (
            <ActivityIndicator color={colors.brand} style={{ marginVertical: spacing.xl }} />
          ) : rounds.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="golf-outline" size={30} color={colors.borderStrong} />
              <Text style={styles.emptyText}>
                No rounds recorded on this device yet.{"\n"}
                Finish a round to see it here.
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
              {rounds.map((r) => {
                const hcp = identity?.handicap;
                const net = hcp != null ? r.total_score - hcp : null;
                return (
                  <Pressable
                    key={r.id}
                    testID={`profile-round-${r.id}`}
                    onPress={() => router.push({ pathname: "/summary", params: { id: r.id } })}
                    style={({ pressed }) => [styles.roundRow, pressed && { opacity: 0.6 }]}
                  >
                    <Text style={[styles.tdText, styles.colDate]} numberOfLines={1}>
                      {formatDate(r.date)}
                    </Text>
                    <Text style={[styles.tdText, styles.colCourse]} numberOfLines={1}>
                      {r.course_name}
                    </Text>
                    <Text style={[styles.tdNum, styles.colNum]}>{r.total_score || "\u2014"}</Text>
                    <Text style={[styles.tdNum, styles.colNum]}>{net ?? "\u2014"}</Text>
                    <Text style={[styles.tdNum, styles.colNum]}>{r.total_putts || "\u2014"}</Text>
                    <Ionicons name="chevron-forward" size={14} color={colors.muted} />
                  </Pressable>
                );
              })}
              {hcp_note(identity)}
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function hcp_note(identity: IdentifiedMember | null) {
  if (!identity || identity.handicap == null) {
    return (
      <Text style={styles.footNote}>
        Net = Gross - Handicap. Pick or sign in as your player to see net scores.
      </Text>
    );
  }
  return (
    <Text style={styles.footNote}>Net = Gross - HCP {identity.handicap}</Text>
  );
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

  section: { marginHorizontal: spacing.xl, marginTop: spacing.xl },
  sectionTitle: {
    fontFamily: typography.textBold, fontSize: 12,
    color: colors.muted, letterSpacing: 1, textTransform: "uppercase",
    marginBottom: spacing.sm,
  },
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
  thText: { fontFamily: typography.textBold, fontSize: 10, color: colors.muted, letterSpacing: 0.6, textTransform: "uppercase" },
  colDate: { width: 62 },
  colCourse: { flex: 1, minWidth: 0 },
  colNum: { width: 40, textAlign: "center" },
  roundRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: spacing.md, gap: 4,
    borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  tdText: { fontFamily: typography.text, fontSize: 13, color: colors.onSurface },
  tdNum: { fontFamily: typography.textBold, fontSize: 14, color: colors.onSurface, textAlign: "center" },
  footNote: { fontFamily: typography.text, fontSize: 11, color: colors.muted, marginTop: spacing.md, textAlign: "center" },
});
