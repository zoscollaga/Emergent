import { useEffect, useState } from "react";
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
import { useLocalSearchParams, useRouter } from "expo-router";

import { colors, radius, spacing, typography } from "@/src/theme";
import {
  FinishedRound,
  getRoundHistory,
  getSelectedCourse,
  StoredCourse,
} from "@/src/lib/storage";

export default function SummaryScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [round, setRound] = useState<FinishedRound | null>(null);
  const [course, setCourse] = useState<StoredCourse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const list = await getRoundHistory();
      const target = id ? list.find((r) => r.id === id) : list[0];
      setRound(target || null);
      const c = await getSelectedCourse();
      setCourse(c);
      setLoading(false);
    })();
  }, [id]);

  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  if (!round) {
    return (
      <SafeAreaView style={[styles.root, styles.center]} edges={["top", "bottom"]}>
        <Text style={styles.emptyText}>No round found.</Text>
        <Pressable
          onPress={() => router.replace("/")}
          testID="summary-home-button"
          style={styles.doneBtn}
        >
          <Text style={styles.doneBtnText}>Back to home</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const holePars = course?.holes || [];
  const totalPar = holePars.reduce((s, h) => s + h.par, 0);
  const diff = round.total_score - totalPar;
  const diffLabel = totalPar === 0 ? "" : diff === 0 ? "E" : diff > 0 ? `+${diff}` : `${diff}`;

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]} testID="summary-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Round Summary</Text>
        <Text style={styles.subtitle} numberOfLines={1}>{round.course_name}</Text>
      </View>

      <View style={styles.totalsCard}>
        <TotalCell
          label="Total Score"
          value={String(round.total_score)}
          sub={diffLabel ? `${diffLabel} vs par ${totalPar}` : undefined}
          testID="total-score"
        />
        <View style={styles.totalDivider} />
        <TotalCell
          label="Total Putts"
          value={String(round.total_putts)}
          testID="total-putts"
        />
      </View>

      <View style={styles.tableHeader}>
        <Text style={[styles.thText, { flex: 1 }]}>Hole</Text>
        <Text style={[styles.thText, styles.tCol]}>Par</Text>
        <Text style={[styles.thText, styles.tCol]}>Score</Text>
        <Text style={[styles.thText, styles.tCol]}>Putts</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing.xxxl }}
        style={{ flex: 1 }}
      >
        {round.holes.map((h) => {
          const par = holePars.find((x) => x.number === h.number)?.par ?? null;
          const scoreDiff =
            h.score != null && par != null ? h.score - par : null;
          const chipColor = getScoreColor(scoreDiff);
          return (
            <View key={h.number} style={styles.tr} testID={`summary-row-${h.number}`}>
              <Text style={[styles.tdText, { flex: 1 }]}>{h.number}</Text>
              <Text style={[styles.tdText, styles.tCol]}>{par ?? "-"}</Text>
              <View style={[styles.tCol, { alignItems: "center" }]}>
                <View style={[styles.scoreChip, { backgroundColor: chipColor.bg }]}>
                  <Text style={[styles.scoreChipText, { color: chipColor.fg }]}>
                    {h.score ?? "-"}
                  </Text>
                </View>
              </View>
              <Text style={[styles.tdText, styles.tCol]}>{h.putts ?? "-"}</Text>
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          onPress={() => router.replace("/")}
          testID="summary-done-button"
          style={({ pressed }) => [styles.doneBtn, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="checkmark-circle" size={22} color={colors.onBrandPrimary} />
          <Text style={styles.doneBtnText}>Done</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function TotalCell({
  label,
  value,
  sub,
  testID,
}: {
  label: string;
  value: string;
  sub?: string;
  testID?: string;
}) {
  return (
    <View style={styles.totalCell} testID={testID}>
      <Text style={styles.totalLabel}>{label}</Text>
      <Text style={styles.totalValue}>{value}</Text>
      {sub && <Text style={styles.totalSub}>{sub}</Text>}
    </View>
  );
}

function getScoreColor(diff: number | null): { bg: string; fg: string } {
  if (diff == null) return { bg: colors.surfaceSecondary, fg: colors.onSurface };
  if (diff <= -2) return { bg: "#FEF3C7", fg: "#92400E" }; // eagle+
  if (diff === -1) return { bg: colors.brandTertiary, fg: colors.brand }; // birdie
  if (diff === 0) return { bg: colors.surfaceSecondary, fg: colors.onSurface }; // par
  if (diff === 1) return { bg: "#FEE2E2", fg: "#991B1B" }; // bogey
  return { bg: "#FCA5A5", fg: "#7F1D1D" }; // double+
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  center: { alignItems: "center", justifyContent: "center" },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.md },
  title: { fontFamily: typography.display, fontSize: 26, color: colors.onSurface },
  subtitle: { fontFamily: typography.text, fontSize: 14, color: colors.muted, marginTop: 2 },
  totalsCard: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.sm,
    backgroundColor: colors.brand,
    borderRadius: radius.lg,
    flexDirection: "row",
    padding: spacing.xl,
    alignItems: "center",
  },
  totalCell: { flex: 1, alignItems: "center" },
  totalLabel: {
    color: "#A7F3D0",
    fontFamily: typography.text,
    fontSize: 12,
    letterSpacing: 1,
  },
  totalValue: {
    color: colors.onBrandSecondary,
    fontFamily: typography.display,
    fontSize: 44,
    marginTop: 6,
  },
  totalSub: {
    color: "#D1FAE5",
    fontFamily: typography.text,
    fontSize: 12,
    marginTop: 4,
  },
  totalDivider: { width: 1, alignSelf: "stretch", backgroundColor: "rgba(255,255,255,0.15)" },
  tableHeader: {
    flexDirection: "row",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    marginTop: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  tCol: { width: 68, textAlign: "center" },
  thText: {
    fontFamily: typography.textBold,
    fontSize: 12,
    color: colors.muted,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  tr: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  tdText: {
    fontFamily: typography.text,
    fontSize: 16,
    color: colors.onSurface,
    textAlign: "center",
  },
  scoreChip: {
    minWidth: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreChipText: {
    fontFamily: typography.textBold,
    fontSize: 15,
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  doneBtn: {
    height: 62,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  doneBtnText: {
    color: colors.onBrandPrimary,
    fontFamily: typography.textBold,
    fontSize: 16,
  },
  emptyText: { fontFamily: typography.text, color: colors.muted, marginBottom: spacing.lg },
});
